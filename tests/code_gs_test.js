/* ==========================================================================
   포켓 가계부 · Code.gs 단위 테스트 (quickjs)
   실행: python3 tests/run_tests.py
   · update / delete / 행 불일치 방어 / 다른 시트 무접촉 을 검증합니다.
   ========================================================================== */

var R = [];
function check(name, fn) {
  try { fn(); R.push({ name: name, ok: true }); }
  catch (e) { R.push({ name: name, ok: false, err: String((e && e.message) || e) }); }
}
function eq(actual, expected, msg) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ' — ' : '') + 'expected ' + b + ', got ' + a);
}
function truthy(v, msg) { if (!v) throw new Error(msg || 'expected truthy, got ' + JSON.stringify(v)); }
function codeOf(fn) {
  try { fn(); } catch (e) { return String(e && e.code || ''); }
  return '(no-throw)';
}
function txRow(n) { return __ss.getSheetByName('시트1').__rows[n - 1]; }
function post(body) {
  var res = doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} });
  return JSON.parse(res.getContent());
}
var PIN = APP_PIN;

/* ── 읽기: 행 번호 ───────────────────────────────────────────────────────── */
check('readTransactions_ 가 실제 시트 행 번호(row)를 붙인다', function () {
  __reset();
  var tx = readTransactions_(__ss, 200);
  eq(tx.length, 5, '빈 행은 제외하고 5건');
  var byRow = {};
  tx.forEach(function (t) { byRow[t.merchant] = t.row; });
  eq(byRow['스타벅스'], 2);
  eq(byRow['이마트'], 3);
  eq(byRow['월급'], 4);
  eq(byRow['드레스샵'], 5);
  eq(byRow['GS25'], 7, '중간 빈 행(6행) 뒤 항목은 7행');
  eq(tx[0].merchant, 'GS25', '최신 순 정렬 유지');
});

check('readTransactions_ 가 거래를 추가해도 기존 행 번호가 유지된다', function () {
  __reset();
  appendTransaction_({ date: '2026-11-15', time: '10:00', merchant: '새내역', type: '출금', amount: 1000, method: '현금', category: '기타지출' });
  var tx = readTransactions_(__ss, 200);
  var map = {};
  tx.forEach(function (t) { map[t.merchant] = t.row; });
  eq(map['스타벅스'], 2);
  eq(map['새내역'], 8);
});

/* ── 수정 ────────────────────────────────────────────────────────────────── */
check('update: 3행을 고치고 A~H만 쓰며 I열 메일ID는 보존한다', function () {
  __reset();
  var out = post({
    action: 'update', pin: PIN, row: 3,
    date: '2026-11-11', time: '13:05', merchant: '이마트 에브리데이', type: '출금',
    amount: 51000, method: '카카오페이', category: '생활/마트', note: '장보기', isWedding: false
  });
  truthy(out.ok, 'ok: ' + JSON.stringify(out));
  eq(out.data.row, 3);
  eq(out.data.updated.mailId, 'mail-2', '메일ID 보존');
  eq(out.data.previous.merchant, '이마트');
  eq(txRow(3), ['2026-11-11', '13:05', '이마트 에브리데이', '출금', 51000, '카카오페이', '생활/마트', '장보기', 'mail-2']);
  eq(txRow(2), ['2026-11-10', '09:12', '스타벅스', '출금', 5600, '국민계좌', '카페/간식', '', 'mail-1'], '다른 행 무변화');
  eq(__ss.getSheetByName('시트1').getLastRow(), 7, '행 수 변화 없음');
});

check('update: I열은 setValues 대상에서 빠진다(8칸만 씀)', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 2, date: '2026-11-10', time: '09:12', merchant: '스타벅스2', type: '출금', amount: 6100, method: '국민계좌', category: '카페/간식', note: '', isWedding: false });
  var writes = __log.rangeWrites.filter(function (w) { return w.values[0] !== '<deleteRow>'; });
  eq(writes.length, 1);
  eq(writes[0].col, 1);
  eq(writes[0].count, 8, 'A~H 8칸만 기록');
});

check('update: 금액 문자열/날짜 표기 정규화', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 2, date: '2026.11.20', time: '9:07', merchant: '스타벅스', type: '출금', amount: '12,300', method: '국민계좌', category: '카페/간식', note: '', isWedding: false });
  eq(txRow(2)[0], '2026-11-20');
  eq(txRow(2)[1], '09:07');
  eq(txRow(2)[4], 12300);
});

check('update: 결혼준비 토글 ON 이면 비고에 태그를 자동 포함', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 2, date: '2026-11-10', time: '09:12', merchant: '스타벅스', type: '출금', amount: 5600, method: '국민계좌', category: '카페/간식', note: '신랑 커피', isWedding: true });
  eq(txRow(2)[7], '#결혼준비 #제외 신랑 커피');
});

check('update: 이미 태그가 있어도 중복으로 붙지 않는다', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 5, date: '2026-11-13', time: '19:03', merchant: '드레스샵', type: '출금', amount: 560000, method: '토스', category: '문화/예술', note: '#결혼준비 #제외 계약금 잔금', isWedding: true });
  eq(txRow(5)[7], '#결혼준비 #제외 계약금 잔금');
});

check('update: 토글 OFF 면 태그를 깔끔히 제거(공백 정리)', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 5, date: '2026-11-13', time: '19:03', merchant: '드레스샵', type: '출금', amount: 550000, method: '토스', category: '문화/예술', note: '', isWedding: false });
  eq(txRow(5)[7], '');
});

check('update: 토글 OFF + 새 메모 → 메모만 남는다', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 5, date: '2026-11-13', time: '19:03', merchant: '드레스샵', type: '출금', amount: 550000, method: '토스', category: '문화/예술', note: '일반 지출로 정정', isWedding: false });
  eq(txRow(5)[7], '일반 지출로 정정');
});

check('update: #제외 만 있는 비고도 제거', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 4, date: '2026-11-12', time: '10:00', merchant: '월급', type: '입금', amount: 3200000, method: '국민계좌', category: '주수입', note: '#결혼준비#제외', isWedding: false });
  eq(txRow(4)[7], '');
});

check('update: 태그를 지운 자리의 구분자·중복 공백까지 정리', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 5, date: '2026-11-13', time: '19:03', merchant: '드레스샵', type: '출금', amount: 550000, method: '토스', category: '문화/예술', note: '#결혼준비 #제외 · 계약금   잔금', isWedding: false });
  eq(txRow(5)[7], '계약금 잔금');
});

check('update: 잘못된 카테고리는 기타지출/기타수입으로 대체', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 2, date: '2026-11-10', time: '09:12', merchant: '스타벅스', type: '출금', amount: 5600, method: '국민계좌', category: '없는카테고리', note: '', isWedding: false });
  eq(txRow(2)[6], '기타지출');
  post({ action: 'update', pin: PIN, row: 4, date: '2026-11-12', time: '10:00', merchant: '월급', type: '입금', amount: 3200000, method: '국민계좌', category: '없는카테고리', note: '', isWedding: false });
  eq(txRow(4)[6], '기타수입');
});

/* ── 수정: 방어 ──────────────────────────────────────────────────────────── */
check('update 방어: 행 번호가 시트 범위를 벗어나면 ROW_OUT_OF_RANGE', function () {
  __reset();
  var out = post({ action: 'update', pin: PIN, row: 99, date: '2026-11-10', time: '09:12', merchant: 'X', type: '출금', amount: 100, method: '현금', category: '식사', note: '', isWedding: false });
  eq(out.ok, false);
  eq(out.error.code, 'ROW_OUT_OF_RANGE');
  eq(__ss.getSheetByName('시트1').getLastRow(), 7, '시트 그대로');
  eq(__log.rangeWrites.length, 0, '쓰기 시도 없음');
});

check('update 방어: 2 미만/정수 아닌 행 번호는 INVALID_ROW', function () {
  __reset();
  [1, 0, -3, 2.5, 'abc', null, undefined].forEach(function (bad) {
    var out = post({ action: 'update', pin: PIN, row: bad, date: '2026-11-10', time: '09:12', merchant: 'X', type: '출금', amount: 100, method: '현금', category: '식사', note: '', isWedding: false });
    eq(out.error && out.error.code, 'INVALID_ROW', 'row=' + String(bad));
  });
  eq(__log.rangeWrites.length, 0, '쓰기 시도 없음');
});

check('update 방어: 비어 있는 행은 ROW_EMPTY (엉뚱한 행 생성 방지)', function () {
  __reset();
  var out = post({ action: 'update', pin: PIN, row: 6, date: '2026-11-14', time: '08:05', merchant: '몰래추가', type: '출금', amount: 1000, method: '현금', category: '식사', note: '', isWedding: false });
  eq(out.error.code, 'ROW_EMPTY');
  eq(txRow(6), [], '빈 행에 값이 생기지 않음');
});

check('update 방어: 금액 0/사용처 공백/날짜 오류는 저장하지 않는다', function () {
  __reset();
  var before = JSON.stringify(__ss.getSheetByName('시트1').__rows);
  eq(post({ action: 'update', pin: PIN, row: 2, date: '2026-11-10', time: '09:12', merchant: 'X', type: '출금', amount: 0, method: '현금', category: '식사', note: '', isWedding: false }).error.code, 'BAD_AMOUNT');
  eq(post({ action: 'update', pin: PIN, row: 2, date: '2026-11-10', time: '09:12', merchant: '   ', type: '출금', amount: 100, method: '현금', category: '식사', note: '', isWedding: false }).error.code, 'BAD_MERCHANT');
  eq(post({ action: 'update', pin: PIN, row: 2, date: '11/10/2026', time: '09:12', merchant: 'X', type: '출금', amount: 100, method: '현금', category: '식사', note: '', isWedding: false }).error.code, 'BAD_DATE');
  eq(JSON.stringify(__ss.getSheetByName('시트1').__rows), before, '시트 그대로');
});

check('update: PIN이 틀리면 PIN_MISMATCH', function () {
  __reset();
  var out = post({ action: 'update', pin: '9999', row: 2, date: '2026-11-10', time: '09:12', merchant: 'X', type: '출금', amount: 100, method: '현금', category: '식사', note: '', isWedding: false });
  eq(out.error.code, 'PIN_MISMATCH');
  eq(__log.rangeWrites.length, 0);
});

check('update: 잠금을 못 잡는 환경에서도 저장은 진행', function () {
  __reset();
  __lockFails = true;
  var out = post({ action: 'update', pin: PIN, row: 2, date: '2026-11-10', time: '09:12', merchant: '스타벅스', type: '출금', amount: 7000, method: '국민계좌', category: '카페/간식', note: '', isWedding: false });
  truthy(out.ok, JSON.stringify(out));
  eq(txRow(2)[4], 7000);
  eq(__log.lockRelease, 0, '잡지 못한 잠금은 해제하지 않음');
});

/* ── 삭제 ────────────────────────────────────────────────────────────────── */
check('delete: 사용처가 일치하면 해당 행만 지운다', function () {
  __reset();
  var out = post({ action: 'delete', pin: PIN, row: 3, expectedMerchant: '이마트' });
  truthy(out.ok, JSON.stringify(out));
  eq(out.data.deleted.merchant, '이마트');
  eq(out.data.deleted.amount, 43200);
  eq(__ss.getSheetByName('시트1').getLastRow(), 6, '한 행 줄어듦');
  eq(txRow(3)[2], '월급', '아래 행이 위로 당겨짐');
  eq(txRow(2)[2], '스타벅스', '위 행은 그대로');
  eq(txRow(6)[2], 'GS25');
});

check('delete 방어: 사용처가 다르면 ROW_MISMATCH 로 막고 아무것도 지우지 않는다', function () {
  __reset();
  var before = JSON.stringify(__ss.getSheetByName('시트1').__rows);
  var out = post({ action: 'delete', pin: PIN, row: 3, expectedMerchant: '다른가게' });
  eq(out.ok, false);
  eq(out.error.code, 'ROW_MISMATCH');
  truthy(out.error.message.indexOf('새로고침') >= 0, '새로고침 안내 포함');
  eq(JSON.stringify(__ss.getSheetByName('시트1').__rows), before, '시트 그대로');
  eq(__log.rangeWrites.length, 0, 'deleteRow 호출 없음');
});

check('delete 방어: 행 번호 범위 밖/비정상/빈 행', function () {
  __reset();
  eq(post({ action: 'delete', pin: PIN, row: 99, expectedMerchant: 'X' }).error.code, 'ROW_OUT_OF_RANGE');
  eq(post({ action: 'delete', pin: PIN, row: 1 }).error.code, 'INVALID_ROW');
  eq(post({ action: 'delete', pin: PIN, row: 'x' }).error.code, 'INVALID_ROW');
  eq(post({ action: 'delete', pin: PIN, row: 6 }).error.code, 'ROW_EMPTY');
  eq(__ss.getSheetByName('시트1').getLastRow(), 7, '시트 그대로');
});

check('delete: expectedMerchant 없이도(안전장치 미사용) 동작', function () {
  __reset();
  var out = post({ action: 'delete', pin: PIN, row: 2 });
  truthy(out.ok);
  eq(__ss.getSheetByName('시트1').getLastRow(), 6);
});

check('delete: PIN이 틀리면 아무것도 지우지 않는다', function () {
  __reset();
  eq(post({ action: 'delete', pin: '0001', row: 3, expectedMerchant: '이마트' }).error.code, 'PIN_MISMATCH');
  eq(__ss.getSheetByName('시트1').getLastRow(), 7);
});

/* ── 다른 시트 무접촉 / 공통 ─────────────────────────────────────────────── */
check('수정·삭제가 다른 시트(예산·월별요약·결혼준비)를 건드리지 않는다', function () {
  __reset();
  var budget = JSON.stringify(__ss.getSheetByName('예산').__rows);
  var monthly = JSON.stringify(__ss.getSheetByName('월별요약').__rows);
  var wedding = JSON.stringify(__ss.getSheetByName('결혼준비').__rows);
  post({ action: 'update', pin: PIN, row: 3, date: '2026-11-11', time: '13:05', merchant: '이마트', type: '출금', amount: 99000, method: 'KB국민', category: '생활/마트', note: '', isWedding: false });
  post({ action: 'delete', pin: PIN, row: 4, expectedMerchant: '월급' });
  eq(JSON.stringify(__ss.getSheetByName('예산').__rows), budget);
  eq(JSON.stringify(__ss.getSheetByName('월별요약').__rows), monthly);
  eq(JSON.stringify(__ss.getSheetByName('결혼준비').__rows), wedding);
  var touched = Object.keys(__log.sheetTouches);
  eq(touched, ['시트1'], '접근한 시트는 시트1 뿐');
});

check('update/delete 는 LockService 잠금을 잡고 반드시 해제한다', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 2, date: '2026-11-10', time: '09:12', merchant: '스타벅스', type: '출금', amount: 5600, method: '국민계좌', category: '카페/간식', note: '', isWedding: false });
  post({ action: 'delete', pin: PIN, row: 3, expectedMerchant: '이마트' });
  eq(__log.lockTry, 2);
  eq(__log.lockRelease, 2);
});

check('알 수 없는 action 은 UNKNOWN_ACTION', function () {
  __reset();
  eq(post({ action: 'nuke', pin: PIN }).error.code, 'UNKNOWN_ACTION');
});

check('수정 후 재조회하면 바뀐 값이 보인다(앱 재조회 경로)', function () {
  __reset();
  post({ action: 'update', pin: PIN, row: 7, date: '2026-11-14', time: '08:05', merchant: 'GS25 역전점', type: '출금', amount: 4500, method: '현금', category: '생활/마트', note: '', isWedding: false });
  var tx = readTransactions_(__ss, 200);
  eq(tx[0].row, 7);
  eq(tx[0].merchant, 'GS25 역전점');
  eq(tx[0].amount, 4500);
});

/* ── 결과 출력 ───────────────────────────────────────────────────────────── */
var __failed = R.filter(function (r) { return !r.ok; });
JSON.stringify({
  total: R.length,
  passed: R.length - __failed.length,
  failed: __failed.length,
  failures: __failed
});
