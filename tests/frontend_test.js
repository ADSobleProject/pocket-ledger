/* ==========================================================================
   포켓 가계부 · 프런트엔드(별도지출) 단위 테스트 (quickjs)
   실행: python3 tests/run_frontend_tests.py
   · 비고 태그 판정(isSeparateTx) · 별도지출 집계(deriveSeparate)
   · 내역 필터(txMatches) · 화면 렌더(home/list/plan) 문자열 을 검사합니다.
   ========================================================================== */

var PL = window.__pocketLedger;

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
function falsy(v, msg) { if (v) throw new Error(msg || 'expected falsy, got ' + JSON.stringify(v)); }
function has(hay, needle, msg) {
  if (String(hay).indexOf(needle) < 0) throw new Error((msg || '문자열 누락') + ': ' + needle);
}
function hasNot(hay, needle, msg) {
  if (String(hay).indexOf(needle) >= 0) throw new Error((msg || '있으면 안 되는 문자열') + ': ' + needle);
}

/* 실제 시트1 116행 값 (2026 가계부 · 자동기록, 2026-11-17 14:40) */
var INSURANCE = {
  row: 116, date: '2026-11-17', time: '14:40', merchant: '자동차보험료 (한화손해보험)',
  type: '출금', amount: 640080, method: 'KB국민(507802-**-***249)', category: '금융/보험',
  note: '자동차보험료 · #자동차보험 #제외 · 잔액 4,472,929원', mailId: '1a1e805ce21460da'
};
var WEDDING = {
  row: 115, date: '2026-11-14', time: '10:00', merchant: '탁연지', type: '출금',
  amount: 1650000, method: '국민계좌', category: '기타지출', note: '드레스 · #결혼준비 #제외', mailId: ''
};
/* 결혼준비 탭 두 번째 행 (11-15 몽펠리에 계약금) — 11월 결혼준비 누적 2,150,000원 = 1,650,000 + 500,000 */
var WEDDING_DEPOSIT = {
  date: '2026-11-15', time: '16:20', merchant: '몽펠리에', type: '출금',
  amount: 500000, method: '국민계좌', category: '기타지출', note: '예식장 계약금 · #결혼준비 #제외'
};
var GROCERY = {
  row: 114, date: '2026-11-16', time: '19:02', merchant: '이마트 에브리데이', type: '출금',
  amount: 32000, method: 'KB국민', category: '생활/마트', note: '', mailId: ''
};
var TRAVEL_REFUND = {
  row: 113, date: '2026-11-15', time: '09:10', merchant: '한화손해보험 환급', type: '입금',
  amount: 40080, method: 'KB국민', category: '기타수입', note: '보험료 일부 환급 #제외', mailId: ''
};
/* 실제 시트1 119·120행 (2026-11-18 09:04 카카오페이 자동충전 · 카카오톡 클라우드 실결제) */
var KAKAO_CHARGE = {
  row: 119, date: '2026-11-18', time: '09:04', merchant: '카카오페이 충전', type: '출금',
  amount: 10000, method: 'KB국민(507802-**-***249)', category: '기타지출',
  note: '카카오톡 클라우드 1,900원 결제용 · #충전 #제외 · 잔액 4,446,569원', mailId: '1a1ebf808df39b17'
};
var KAKAO_CLOUD = {
  row: 120, date: '2026-11-18', time: '09:04', merchant: '카카오톡 클라우드', type: '출금',
  amount: 1900, method: '카카오페이', category: '주거/통신',
  note: '자동충전 10,000원 중 실결제 · 페이 잔액 +8,100원', mailId: '1a1ebf808df39b17-cloud'
};

/* 실제 시트1 126행 (2026-11-20 21:47 전북대학교 주차장 · 잔액 3,891,369원) */
var PARKING = {
  row: 126, date: '2026-11-20', time: '21:47', merchant: '전북대학교 주차장', type: '출금',
  amount: 650, method: 'KB국민(507802-**-***249)', category: '교통/차량',
  note: '주차장 이용료 · 잔액 3,891,369원', mailId: '1a1f8ff8b5e0c610'
};
var OCT_LUNCH = {
  row: 2, date: '2026-10-01', time: '12:53', merchant: '양평해장국효', type: '출금',
  amount: 35000, method: '국민계좌', category: '식사', note: '', mailId: ''
};

/* ── 1. 태그 판정 ────────────────────────────────────────────────────────── */
check('isSeparateTx: #제외 만 있고 #결혼준비 가 없으면 별도지출이다', function () {
  eq(PL.isSeparateTx(INSURANCE), true);
});

check('isSeparateTx: #결혼준비 #제외 는 결혼준비이므로 별도지출이 아니다', function () {
  eq(PL.isSeparateTx(WEDDING), false);
  eq(PL.isWeddingTx(WEDDING), true);
});

check('isSeparateTx: 태그 없는 일반 지출은 false', function () {
  eq(PL.isSeparateTx(GROCERY), false);
  eq(PL.isSeparateTx(WEDDING), false);
});

check("isSeparateTx: '#충전 #제외' 는 별도지출이 아니다 (시트 별도지출 탭과 동일)", function () {
  eq(PL.isSeparateTx(KAKAO_CHARGE), false);
  eq(PL.isChargeTx(KAKAO_CHARGE), true);
  eq(PL.isExcludedTx(KAKAO_CHARGE), true, '생활비 집계에서는 빠져야 함');
});

check("isChargeTx: '#충전' 태그가 없으면 충전으로 보지 않는다", function () {
  eq(PL.isChargeTx(KAKAO_CLOUD), false, '"자동충전 10,000원 중 실결제" 는 #충전 태그가 아님');
  eq(PL.isSeparateTx(KAKAO_CLOUD), false);
  eq(PL.isExcludedTx(KAKAO_CLOUD), false, '실결제는 생활비에 남는다');
  eq(PL.isChargeTx(GROCERY), false);
  eq(PL.isChargeTx({}), false);
  eq(PL.isChargeTx(null), false);
});

check('isSeparateTx: note 가 없거나 비어도 안전하다', function () {
  eq(PL.isSeparateTx({}), false);
  eq(PL.isSeparateTx({ note: '' }), false);
  eq(PL.isSeparateTx(null), false);
});

check('isSeparateTx: "#제외아님" 처럼 붙은 단어도 #제외 로 오인하지 않는다', function () {
  eq(PL.isSeparateTx({ note: '메모 #제외아님' }), true); // 태그 접두 일치 — 시트 규칙(REGEXMATCH)과 동일
  eq(PL.isSeparateTx({ note: '제외 없음' }), false);
});

/* ── 2. 태그 추출 ────────────────────────────────────────────────────────── */
check('noteTags: #결혼준비 · #제외 는 빼고 업무 태그만 남긴다', function () {
  eq(PL.noteTags(INSURANCE), ['자동차보험']);
  eq(PL.noteTags(WEDDING), []);
  eq(PL.noteTags({ note: '#자동차보험 #보험 #제외' }), ['자동차보험', '보험']);
  eq(PL.noteTags({}), []);
});

/* ── 3. 집계 ─────────────────────────────────────────────────────────────── */
check('deriveSeparate: 별도지출만 골라 합계·건수를 낸다', function () {
  var out = PL.deriveSeparate([INSURANCE, WEDDING, GROCERY]);
  eq(out.summary, { spend: 640080, refund: 0, net: 640080, count: 1 });
  eq(out.rows.length, 1);
  eq(out.rows[0].row, 116);
});

check('deriveSeparate: 입금(환급)도 별도지출로 잡혀 순 지출에서 빠진다', function () {
  var out = PL.deriveSeparate([INSURANCE, TRAVEL_REFUND]);
  eq(out.summary, { spend: 640080, refund: 40080, net: 600000, count: 2 });
});

check('deriveSeparate: 가맹점 이름이 "충전" 이어도 #충전 태그가 없으면 일반 지출로 남는다', function () {
  var out = PL.deriveSeparate([KAKAO_CLOUD]);
  eq(out.summary.count, 0);
});

check('deriveSeparate: #충전 #제외 는 별도지출 합계·건수에서 빠진다', function () {
  var out = PL.deriveSeparate([INSURANCE, WEDDING, GROCERY, KAKAO_CHARGE, KAKAO_CLOUD]);
  eq(out.summary, { spend: 640080, refund: 0, net: 640080, count: 1 });
  eq(out.rows.map(function (t) { return t.row; }), [116]);
});

check('deriveSeparate: 해당 거래가 없으면 0건 · 0원', function () {
  eq(PL.deriveSeparate([WEDDING, GROCERY]).summary, { spend: 0, refund: 0, net: 0, count: 0 });
  eq(PL.deriveSeparate([]).rows.length, 0);
  eq(PL.deriveSeparate(null).summary.count, 0);
});

/* ── 4. 내역 필터 ────────────────────────────────────────────────────────── */
var ALL = [INSURANCE, WEDDING, GROCERY];
function only(f) {
  return ALL.filter(function (t) { return PL.txMatches(t, f); }).map(function (t) { return t.row; });
}

check("txMatches '생활비만'은 결혼준비와 별도지출을 모두 뺀다", function () {
  eq(only({ wedding: 'exclude' }), [114]);
});

check("txMatches '전체'는 셋 다 보여 준다", function () {
  eq(only({ wedding: 'all' }), [116, 115, 114]);
});

check("txMatches '결혼만'은 #결혼준비 만 남긴다", function () {
  eq(only({ wedding: 'only' }), [115]);
});

check("txMatches '별도만'은 별도지출만 남긴다", function () {
  eq(only({ wedding: 'sep' }), [116]);
});

/* #충전 #제외 까지 포함한 목록 */
var ALL5 = ALL.concat([KAKAO_CHARGE, KAKAO_CLOUD]);
function only5(f) {
  return ALL5.filter(function (t) { return PL.txMatches(t, f); }).map(function (t) { return t.row; });
}

check("txMatches '생활비만'은 #충전 #제외 도 뺀다 (시트 생활비와 동일)", function () {
  eq(only5({ wedding: 'exclude' }), [114, 120], '일반 지출 + 충전으로 산 실결제만');
});

check("txMatches '별도만'에도 #충전 #제외 는 섞이지 않는다", function () {
  eq(only5({ wedding: 'sep' }), [116]);
});

check("txMatches '전체'에서만 #충전 #제외 가 보인다", function () {
  eq(only5({ wedding: 'all' }), [116, 115, 114, 119, 120]);
  eq(only5({ wedding: 'only' }), [115]);
});

check('txMatches: 카테고리 · 검색어 조건이 함께 걸린다', function () {
  eq(only({ wedding: 'all', cat: '금융/보험' }), [116]);
  eq(only({ wedding: 'all', q: '한화' }), [116]);
  eq(only({ wedding: 'sep', q: '이마트' }), []);
  eq(only({ wedding: 'all', q: '자동차보험' }), [116]);
  eq(only({}), [116, 115, 114], '필터가 비면 모두 통과');
});

/* ── 5. separateView (백엔드 별도지출 지원 시 우선 사용) ─────────────────── */
check('separateView: separate 가 없으면 앱이 거래 목록에서 계산한다', function () {
  PL.state.data = { transactions: ALL };
  var v = PL.separateView();
  eq(v.source, 'app');
  eq(v.summary.spend, 640080);
  eq(v.summary.count, 1);
});

check('separateView: 백엔드가 separate 를 내려 주면 그 값을 쓴다(시트 누적 전체)', function () {
  PL.state.data = {
    transactions: ALL,
    separate: { summary: { spend: 900000, refund: 0, net: 900000, count: 3 }, rows: [INSURANCE] }
  };
  var v = PL.separateView();
  eq(v.source, 'sheet');
  eq(v.summary.spend, 900000, '시트 탭 누적값 우선');
  eq(v.rows.length, 1);
  PL.state.data = { transactions: ALL };
});

/* ── 6. 화면 렌더 ────────────────────────────────────────────────────────── */
PL.state.data = {
  period: { month: '2026-11', daysLeft: 12 },
  budget: { period: { month: '2026-11', daysLeft: 12 }, rows: [], total: { budget: 1310000, spent: 680788 } },
  monthly: [{ month: '2026-11', income: 2858322, expense: 680788, net: 2177534, rate: 76.25, count: 47 }],
  wedding: { summary: { spend: 2150000, refund: 0, net: 2150000, count: 2 }, rows: [WEDDING, WEDDING_DEPOSIT] },
  transactions: ALL5
};

check('홈: 생활비에서 빼는 지출 카드에 별도지출 합계가 나온다', function () {
  var html = PL.views.home();
  has(html, '생활비에서 빼는 지출');
  has(html, '별도지출');
  has(html, '₩640,080', '별도지출 합계');
  has(html, '₩2,150,000', '결혼준비 합계');
  has(html, 'data-planseg="separate"');
  has(html, 'data-planseg="wedding"');
});

check('결혼/월별: 별도지출 세그먼트를 고르면 별도지출 내역이 그려진다', function () {
  PL.state.planSeg = 'separate';
  var html = PL.views.plan();
  has(html, '별도지출 누적 지출');
  has(html, 'wed--sep');
  has(html, '별도지출 내역');
  has(html, '자동차보험료 (한화손해보험)');
  has(html, 'tx__tag--sep');
  hasNot(html, '탁연지', '결혼준비 내역은 이 화면에 없어야 함');
  has(html, '월별 흐름', '월별 섹션은 그대로 유지');
});

check('결혼/월별: 결혼준비 세그먼트는 기존 화면 그대로', function () {
  PL.state.planSeg = 'wedding';
  var html = PL.views.plan();
  has(html, '결혼준비 누적 지출');
  has(html, '탁연지');
  has(html, '₩2,150,000');
  hasNot(html, 'wed--sep');
});

check('내역: 별도만 칩이 있고, 별도 행에는 "별도" 태그가 붙는다', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'sep' };
  var html = PL.views.list();
  has(html, '🧾 별도만');
  has(html, '생활비만');
  has(html, 'tx__tag--sep');
  has(html, '자동차보험료');
  hasNot(html, '이마트 에브리데이', '별도만 필터에서 일반 지출은 빠져야 함');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
});

check('내역: 생활비만 화면에는 640,080원이 나타나지 않는다', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
  var html = PL.views.list();
  has(html, '이마트 에브리데이');
  hasNot(html, '자동차보험료', '생활비만 필터에서 별도지출은 빠져야 함');
});

check('내역: 별도지출 행은 앱에서 수정할 수 없다(#제외 태그 보존)', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'sep' };
  var html = PL.views.list();
  hasNot(html, 'data-txrow="116"', '별도지출 행에 수정 버튼이 붙으면 안 됨');
});

check('결혼/월별: 별도지출 화면에 시트 직접 수정 안내가 나온다', function () {
  PL.state.planSeg = 'separate';
  has(PL.views.plan(), '시트1에서 해 주세요');
  PL.state.planSeg = 'wedding';
});

check("결혼/월별: 별도지출 화면에 #충전 은 나오지 않는다(합계 640,080원 · 1건 그대로)", function () {
  PL.state.planSeg = 'separate';
  var html = PL.views.plan();
  has(html, '₩640,080');
  has(html, '#자동차보험');
  hasNot(html, '카카오페이 충전', '별도지출에서 충전은 빠져야 함');
  hasNot(html, '₩650,080', '충전 10,000원이 더해지면 안 됨');
  PL.state.planSeg = 'wedding';
});

check('홈: 별도지출 카드는 640,080원 · 1건 그대로다(충전은 카운트하지 않음)', function () {
  var html = PL.views.home();
  has(html, '₩640,080 · 1건');
});

check('내역: 생활비만 화면에도 별도만 화면에도 충전은 없다', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
  var html = PL.views.list();
  hasNot(html, '카카오페이 충전', '생활비만에서 충전은 빠져야 함');
  has(html, '카카오톡 클라우드', '충전으로 산 실결제는 생활비에 남는다');
  PL.state.filter = { q: '', cat: '', wedding: 'sep' };
  hasNot(PL.views.list(), '카카오페이 충전');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
});

check('내역: 전체 화면에서만 충전 행이 보인다', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'all' };
  has(PL.views.listResults(), '카카오페이 충전');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
});

check('내역: 충전 행은 앱에서 수정할 수 없다(#제외 태그 보존)', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'all' };
  hasNot(PL.views.list(), 'data-txrow="119"', '충전 행에 수정 버튼이 붙으면 안 됨');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
});

/* ── 6-2. 이번 달 실지출(생활비 + 결혼준비 + 별도지출) ────────────────────── */
var HOME_DATA = PL.state.data;

check('monthSum: 해당 월 행만 골라 출금·입금·순액을 낸다', function () {
  eq(PL.monthSum([INSURANCE, WEDDING], '2026-10'), { spend: 0, refund: 0, net: 0, count: 0 });
  eq(PL.monthSum([INSURANCE, TRAVEL_REFUND, WEDDING], '2026-11'),
    { spend: 640080 + 1650000, refund: 40080, net: 2250000, count: 3 });
  eq(PL.monthSum([], '2026-11').count, 0);
  eq(PL.monthSum(null, '2026-11').net, 0);
});

check("monthSum: '#충전 #제외' 행은 어느 쪽에도 더하지 않는다", function () {
  eq(PL.monthSum([KAKAO_CHARGE, KAKAO_CLOUD], '2026-11'), { spend: 1900, refund: 0, net: 1900, count: 1 });
});

check('actualView: 이번 달 실지출 = 생활비 + 결혼준비 + 별도지출', function () {
  var a = PL.actualView();
  eq(a.month, '2026-11');
  eq(a.living, 680788, '예산 시트의 이번 달 생활비');
  eq(a.wedding, 2150000, '11월 결혼준비 2건');
  eq(a.separate, 640080, '11월 별도지출 1건');
  eq(a.total, 3470868, '11월 실지출 합계');
});

check('actualView: 실제 순현금 = 이번 달 수입 − 실지출 (마이너스)', function () {
  var a = PL.actualView();
  eq(a.income, 2858322);
  eq(a.net, -612546);
});

check("#충전 10,000원은 실지출 총액에 더해지지 않는다", function () {
  var a = PL.actualView();
  eq(a.total, 3470868, '충전이 더해지면 3,480,868 이 된다');
});

check('actualView: 지난달 결혼준비·별도지출은 이번 달 실지출에서 뺀다', function () {
  var saved = PL.state.data;
  PL.state.data = {
    budget: saved.budget,
    monthly: saved.monthly,
    wedding: {
      summary: saved.wedding.summary,
      rows: saved.wedding.rows.concat([
        { date: '2026-10-20', merchant: '예식장 중도금', type: '출금', amount: 300000, category: '기타지출', note: '#결혼준비 #제외' }
      ])
    },
    transactions: saved.transactions.concat([
      { date: '2026-10-21', merchant: '연납 보험', type: '출금', amount: 500000, category: '금융/보험', note: '#제외' }
    ])
  };
  var a = PL.actualView();
  eq(a.wedding, 2150000, '10월 결혼준비 300,000원 제외');
  eq(a.separate, 640080, '10월 별도지출 500,000원 제외');
  eq(a.total, 3470868);
  PL.state.data = saved;
});

check('actualView: 예산 시트가 비어 있으면 시트1 내역으로 생활비를 추정한다', function () {
  var saved = PL.state.data;
  PL.state.data = { period: { month: '2026-11' }, monthly: saved.monthly, wedding: saved.wedding, transactions: saved.transactions };
  var a = PL.actualView();
  eq(a.living, 33900, '일반 32,000 + 카카오톡 클라우드 1,900 (#제외 빠짐)');
  eq(a.total, 33900 + 2150000 + 640080);
  PL.state.data = saved;
});

check('홈: 히어로는 «생활비»로 표시하고 예산 기준임을 밝힌다', function () {
  var html = PL.views.home();
  has(html, '2026년 11월 생활비');
  has(html, '예산 기준');
  hasNot(html, '총 지출');
});

check('홈: 실지출 카드에 총액과 구성 3가지가 한눈에 나온다', function () {
  var html = PL.views.home();
  has(html, '11월 실지출');
  has(html, '₩3,470,868');
  has(html, '생활비 + 결혼준비 + 별도지출');
  has(html, '₩680,788');
  has(html, '₩2,150,000');
  has(html, '₩640,080');
  has(html, '#충전·#저축 제외');
  has(html, 'real__part', '구성 행');
});

check('홈: 마이너스 실제 순현금은 붉은 경고 톤(is-minus)으로 보여 준다', function () {
  var html = PL.views.home();
  has(html, '실제 순현금');
  has(html, '−₩612,546');
  has(html, 'real__net is-minus');
  has(html, '더 나갔어요');
});

check('홈: 순현금이 플러스면 is-plus 로 표시하고 경고는 띄우지 않는다', function () {
  var saved = PL.state.data;
  PL.state.data = {
    budget: saved.budget, monthly: [{ month: '2026-11', income: 5000000 }],
    wedding: saved.wedding, transactions: saved.transactions
  };
  var html = PL.views.home();
  has(html, 'real__net is-plus');
  has(html, '+₩1,529,132');
  hasNot(html, '더 나갔어요');
  PL.state.data = saved;
});

check('홈: 수입을 모르면 실제 순현금은 — 로 두고 마이너스로 단정하지 않는다', function () {
  var saved = PL.state.data;
  PL.state.data = { budget: saved.budget, monthly: [], wedding: saved.wedding, transactions: [] };
  var html = PL.views.home();
  has(html, '이번 달 수입을 아직 몰라요');
  hasNot(html, 'real__net is-minus');
  PL.state.data = saved;
});

check('홈: 생활비에서 빼는 지출 카드는 예산 제외지만 실지출엔 포함임을 밝힌다', function () {
  has(PL.views.home(), '누적 · 실지출엔 포함');
});

/* ── 7. 행 날짜 표시 ─────────────────────────────────────────────────────── */
check('shortDate: ISO 날짜를 M/D 로 줄인다', function () {
  eq(PL.shortDate('2026-11-16'), '11/16');
  eq(PL.shortDate('2026-01-05'), '1/5');
  eq(PL.shortDate(''), '');
  eq(PL.shortDate('날짜없음'), '');
});

check('결혼/월별: 결혼준비 내역 행 메타가 날짜로 시작한다', function () {
  PL.state.planSeg = 'wedding';
  var html = PL.views.plan();
  has(html, '11/14 · 기타지출', '날짜 · 카테고리 순서');
  has(html, '11/14 · 기타지출 · 국민계좌 · 10:00', '시각까지 이어서');
});

check('결혼/월별: 별도지출 내역 행 메타도 날짜로 시작하고 태그가 그 뒤에 온다', function () {
  PL.state.planSeg = 'separate';
  var html = PL.views.plan();
  has(html, '11/17 · #자동차보험 · 금융/보험', '날짜 · 태그 · 카테고리 순서');
  PL.state.planSeg = 'wedding';
});

check('내역: 날짜 묶음이 있는 목록 행에는 날짜를 중복해서 넣지 않는다', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
  var html = PL.views.listResults();
  has(html, 'daygroup__head', '날짜 묶음 헤더는 그대로');
  hasNot(html, '11/16 · 생활/마트', '그룹 헤더가 날짜를 대신하므로 행에는 날짜 없음');
});

/* ── 8. 검색창 한글 IME 조합 보존 ──────────────────────────────────────── */
check('내역: 결과 영역 조각(#listResults)에는 검색 input 이 없다(조합 유지)', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
  var full = PL.views.list();
  has(full, 'id="listResults"');
  has(full, 'id="searchInput"');
  var frag = PL.views.listResults();
  hasNot(frag, 'searchInput', '결과 조각이 input 을 다시 그리면 IME 조합이 끊깁니다');
  hasNot(frag, '<input');
  has(frag, '이마트 에브리데이');
});

check('내역: 검색창은 type=text 라 네이티브 ✕ 가 겹치지 않는다', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
  var html = PL.views.list();
  has(html, 'id="searchInput" type="text"');
  hasNot(html, 'type="search"');
  has(html, 'data-clear-q');
});

check('내역: 검색어가 바뀌면 결과 조각만 그 검색어로 걸러진다', function () {
  PL.state.filter = { q: '한화', cat: '', wedding: 'all' };
  var frag = PL.views.listResults();
  has(frag, '자동차보험료');
  hasNot(frag, '이마트 에브리데이');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude' };
});

check('isComposingEvent: 한글 조합 중 입력 이벤트를 가려낸다', function () {
  eq(PL.isComposingEvent({ isComposing: true }), true);
  eq(PL.isComposingEvent({ isComposing: false }), false);
  eq(PL.isComposingEvent({ keyCode: 229 }), true, 'Android 구형 키보드');
  eq(PL.isComposingEvent(null), false);
  eq(PL.isComposingEvent(undefined), false);
});

/* ── 9. 현재 잔액(비고의 '잔액 …원') ────────────────────────────────────── */
check('noteBalance: 비고의 잔액을 숫자로 읽는다', function () {
  eq(PL.noteBalance(PARKING), 3891369);
  eq(PL.noteBalance(INSURANCE), 4472929);
  eq(PL.noteBalance(WEDDING), null, '잔액이 없는 행은 null');
  eq(PL.noteBalance(null), null);
  eq(PL.noteBalance({}), null);
});

check('noteBalance: 페이 잔액은 계좌 잔액으로 읽지 않는다', function () {
  eq(PL.noteBalance(KAKAO_CLOUD), null, '"페이 잔액 +8,100원" 은 계좌 잔액이 아님');
  eq(PL.noteBalance({ note: '페이 잔액 8,100원' }), null);
  eq(PL.noteBalance({ note: '#제외 · 잔액 4,446,569원' }), 4446569);
});

check('balanceView: 날짜·시각이 가장 늦은 행의 잔액을 쓴다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: [KAKAO_CHARGE, INSURANCE, PARKING, GROCERY] };
  var b = PL.balanceView();
  eq(b.amount, 3891369, '11/20 21:47 이 가장 최근');
  eq(b.date, '2026-11-20');
  eq(b.time, '21:47');
  eq(b.method, 'KB국민', '가린 카드번호 괄호는 표시하지 않음');
  PL.state.data = saved;
});

check('balanceView: 잔액이 적힌 행이 없으면 null(카드를 띄우지 않음)', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: [GROCERY, OCT_LUNCH] };
  eq(PL.balanceView(), null);
  hasNot(PL.views.home(), '현재 잔액');
  PL.state.data = saved;
});

check('홈: 현재 잔액과 기준 시각이 실지출·순현금과 따로 나온다', function () {
  var html = PL.views.home();
  has(html, '현재 잔액');
  has(html, '₩4,446,569', '11/18 09:04 카카오페이 충전 행의 잔액');
  has(html, '11/18 09:04 기준');
  has(html, 'KB국민 결제 알림의 계좌 잔액');
  has(html, '반영 전', '기준 시점 이후 입출금 미반영을 밝힌다');
  has(html, '이번 달 순현금과 달리', '순현금 카드와 헷갈리지 않게 밝힌다');
  truthy(html.indexOf('현재 잔액') < html.indexOf('생활비'), '잔액 띠가 히어로 위에 온다');
});

/* ── 10. 내역 월별 필터 ─────────────────────────────────────────────────── */
check('txMonths: 거래에 있는 달만 최신순으로 만든다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: [OCT_LUNCH, PARKING, INSURANCE, OCT_LUNCH] };
  eq(PL.txMonths(), ['2026-11', '2026-10']);
  PL.state.data = { transactions: [] };
  eq(PL.txMonths(), []);
  PL.state.data = saved;
});

check('monthChipLabel: 올해는 월만, 다른 해는 연도까지 보여 준다', function () {
  eq(PL.monthChipLabel('2026-11'), '11월');
  eq(PL.monthChipLabel('2025-12'), '25년 12월');
});

var MIX = [OCT_LUNCH, GROCERY, INSURANCE, PARKING];
function onlyM(f) {
  return MIX.filter(function (t) { return PL.txMatches(t, f); }).map(function (t) { return t.row; });
}

check('txMatches: 월 조건이 다른 필터와 함께 걸린다', function () {
  eq(onlyM({ month: '2026-10' }), [2]);
  eq(onlyM({ month: '2026-11' }), [114, 116, 126]);
  eq(onlyM({ month: '2026-11', cat: '교통/차량' }), [126]);
  eq(onlyM({ month: '2026-11', wedding: 'exclude' }), [114, 126], '별도지출은 생활비만에서 빠짐');
  eq(onlyM({ month: '' }), [2, 114, 116, 126], '빈 값이면 전체');
});

check('내역: 월 칩(모든 달 · 11월 · 10월)이 생기고 기본은 모든 달', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: MIX };
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  var html = PL.views.list();
  has(html, 'data-month=""');
  has(html, '모든 달');
  has(html, 'data-month="2026-11"');
  has(html, 'data-month="2026-10"');
  eq((html.match(/class="chip is-on"/g) || []).length >= 2, true, '모든 달 + 생활비만 이 켜져 있다');
  has(html, '>11월<');
  has(html, '>10월<');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  PL.state.data = saved;
});

check('내역: 달을 고르면 그 달 행만 남고 머리말에 달이 표시된다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: MIX };
  PL.state.filter = { q: '', cat: '', wedding: 'all', month: '2026-10' };
  var frag = PL.views.listResults();
  has(frag, '양평해장국효', '10월 행');
  hasNot(frag, '이마트 에브리데이', '11월 행은 빠져야 함');
  hasNot(frag, '자동차보험료');
  has(frag, '2026년 10월 · 1건');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  PL.state.data = saved;
});

check('내역: 월이 하나뿐이면 월 칩 줄을 그리지 않는다(기존 화면 유지)', function () {
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  hasNot(PL.views.list(), 'data-month=');
});

check('내역: 검색어 + 월 + 카테고리가 동시에 걸린다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: MIX };
  PL.state.filter = { q: '주차', cat: '교통/차량', wedding: 'exclude', month: '2026-11' };
  has(PL.views.listResults(), '전북대학교 주차장');
  PL.state.filter = { q: '주차', cat: '교통/차량', wedding: 'exclude', month: '2026-10' };
  hasNot(PL.views.listResults(), '전북대학교 주차장');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  PL.state.data = saved;
});

/* ── 11. 저축 이체(#저축 · #적금) 제외 ─────────────────────────────────── */
/* 실제 시트1 125행 (2026-11-20 20:33 청년희망적금 이체 500,000원) */
var SAVINGS = {
  row: 125, date: '2026-11-20', time: '20:33', merchant: '청년희망적금 (계좌 507803041146)', type: '출금',
  amount: 500000, method: 'KB국민(507802-**-***249)', category: '금융/보험',
  note: '청년희망적금 이체 · #저축 #제외 · 잔액 3,892,019원', mailId: '1a1f8bbc29111af1'
};
var JAN_COFFEE = {
  row: 127, date: '2027-01-02', time: '09:12', merchant: '메가커피 전주점', type: '출금',
  amount: 2000, method: 'KB국민', category: '카페/간식', note: '잔액 3,889,369원', mailId: ''
};
var DEC_LUNCH = {
  row: 128, date: '2026-12-31', time: '12:40', merchant: '국밥집', type: '출금',
  amount: 9000, method: '국민계좌', category: '식사', note: '', mailId: ''
};

check("isSavingsTx: '#저축' · '#적금' 태그를 저축 이체로 본다", function () {
  eq(PL.isSavingsTx(SAVINGS), true);
  eq(PL.isSavingsTx({ note: '적금 납입 #적금' }), true);
  eq(PL.isSavingsTx({ note: '#저축' }), true);
  eq(PL.isSavingsTx(GROCERY), false);
  eq(PL.isSavingsTx(null), false);
  eq(PL.isSavingsTx({}), false);
});

check('isSavingsTx: 사용처 이름의 "적금" 글자는 저축 태그로 오인하지 않는다', function () {
  eq(PL.isSavingsTx({ merchant: '청년희망적금 (계좌 507803041146)', note: '잔액 3,892,019원' }), false);
  eq(PL.isSavingsTx({ note: '청년희망적금 이체' }), false, '태그(#)가 없으면 일반 지출');
});

check("isExcludedTx: '#저축' 만 있고 '#제외' 가 없어도 생활비에서 빠진다", function () {
  eq(PL.isExcludedTx({ note: '청년희망적금 이체 #저축' }), true);
  eq(PL.isExcludedTx({ note: '적금 만기 #적금' }), true);
  eq(PL.isExcludedTx(SAVINGS), true);
  eq(PL.isExcludedTx(GROCERY), false);
});

check("isSeparateTx: '#저축 #제외' 는 별도지출이 아니다 (#충전 과 같은 처리)", function () {
  eq(PL.isSeparateTx(SAVINGS), false);
  eq(PL.isSeparateTx({ note: '#적금 #제외' }), false);
  eq(PL.isSeparateTx({ note: '#저축 #제외', type: '입금' }), false);
});

check('deriveSeparate: 저축 이체 500,000원은 별도지출 합계에서 빠진다', function () {
  var out = PL.deriveSeparate([INSURANCE, WEDDING, GROCERY, SAVINGS, KAKAO_CHARGE]);
  eq(out.summary, { spend: 640080, refund: 0, net: 640080, count: 1 });
  eq(out.rows.map(function (t) { return t.row; }), [116]);
});

check('monthSum: 저축 이체는 출금·입금 어느 쪽에도 더하지 않는다', function () {
  eq(PL.monthSum([SAVINGS, PARKING], '2026-11'), { spend: 650, refund: 0, net: 650, count: 1 });
  eq(PL.monthSum([{ date: '2026-11-21', type: '입금', amount: 1000000, note: '적금 만기 #적금' }], '2026-11'),
    { spend: 0, refund: 0, net: 0, count: 0 }, '적금 해지금도 수입으로 보지 않음');
});

check('actualView: 저축 이체 500,000원은 실지출에 들어가지 않는다', function () {
  var saved = PL.state.data;
  PL.state.data = {
    budget: saved.budget, monthly: saved.monthly, wedding: saved.wedding,
    transactions: saved.transactions.concat([SAVINGS])
  };
  var a = PL.actualView();
  eq(a.total, 3470868, '저축이 더해지면 3,970,868 이 된다');
  eq(a.savings, 500000, '저축 이체는 따로 보여 줌');
  eq(a.savingsCount, 1);
  eq(a.net, -612546, '순현금도 저축 이체 때문에 줄지 않음');
  PL.state.data = saved;
});

check('actualView: 다른 달 저축 이체는 이번 달 합계에 섞이지 않는다', function () {
  var saved = PL.state.data;
  PL.state.data = {
    budget: saved.budget, monthly: saved.monthly, wedding: saved.wedding,
    transactions: saved.transactions.concat([
      { date: '2026-10-20', type: '출금', amount: 700000, note: '청년희망적금 #저축 #제외' }
    ])
  };
  eq(PL.actualView().savings, 0);
  PL.state.data = saved;
});

check("txMatches: 저축 이체는 '생활비만'·'별도만'에서 빠지고 '전체'에서만 보인다", function () {
  var ALL6 = [INSURANCE, WEDDING, GROCERY, SAVINGS];
  function pick(f) { return ALL6.filter(function (t) { return PL.txMatches(t, f); }).map(function (t) { return t.row; }); }
  eq(pick({ wedding: 'exclude' }), [114]);
  eq(pick({ wedding: 'sep' }), [116]);
  eq(pick({ wedding: 'all' }), [116, 115, 114, 125]);
});

check('내역: 저축 행에는 "저축" 배지가 붙고 앱에서는 수정할 수 없다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: [GROCERY, SAVINGS] };
  PL.state.filter = { q: '', cat: '', wedding: 'all', month: '' };
  var html = PL.views.list();
  has(html, 'tx__tag--sav');
  has(html, '청년희망적금');
  hasNot(html, 'data-txrow="125"', '저축 행에 수정 버튼이 붙으면 #저축 태그가 지워짐');
  has(html, 'data-txrow="114"', '보통 지출은 그대로 수정 가능');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  PL.state.data = saved;
});

check('홈: 이번 달 저축 이체를 실지출과 구분해 보여 준다', function () {
  var saved = PL.state.data;
  PL.state.data = {
    budget: saved.budget, monthly: saved.monthly, wedding: saved.wedding,
    transactions: saved.transactions.concat([SAVINGS])
  };
  var html = PL.views.home();
  has(html, '저축 이체');
  has(html, '₩500,000');
  has(html, '실지출에서 뺐어요');
  has(html, '₩3,470,868', '실지출 총액은 그대로');
  PL.state.data = saved;
});

check('stripWeddingNote: 태그를 지우고 가운데 남은 구분자도 정리한다', function () {
  eq(PL.stripWeddingNote(SAVINGS.note), '청년희망적금 이체 · 잔액 3,892,019원');
  eq(PL.stripWeddingNote('드레스 · #결혼준비 #제외'), '드레스');
  eq(PL.stripWeddingNote(''), '');
  eq(PL.stripWeddingNote(null), '');
});

/* ── 12. 2027년 연도 전환 ───────────────────────────────────────────────── */
check('monthLabelShort: 다른 해는 연도를 붙이고 1월을 01월 로 쓰지 않는다', function () {
  eq(PL.monthLabelShort('2026-11'), '11월');
  eq(PL.monthLabelShort('2026-12'), '12월', '올해 12월은 연도 없이');
  eq(PL.monthLabelShort('2027-01'), '27년 1월');
  eq(PL.monthLabelShort('2025-12'), '25년 12월');
  eq(PL.monthLabelShort(''), '');
});

check('shortDate: 다른 해 날짜에는 연도를 붙인다', function () {
  eq(PL.shortDate('2026-11-16'), '11/16');
  eq(PL.shortDate('2027-01-05'), '27/1/5');
  eq(PL.shortDate('2025-12-31'), '25/12/31');
});

check('dayLabel: 다른 해 날짜는 연도를 붙이고 올해는 붙이지 않는다', function () {
  has(PL.dayLabel('2026-11-16'), '11월 16일');
  hasNot(PL.dayLabel('2026-11-16'), '26년');
  has(PL.dayLabel('2027-01-05'), '27년 1월 5일');
  has(PL.dayLabel('2025-12-31'), '25년 12월 31일');
});

check('monthChipLabel: 여러 해가 섞이면 모든 칩에 연도를 붙인다', function () {
  eq(PL.monthChipLabel('2026-11'), '11월');
  eq(PL.monthChipLabel('2026-11', true), '26년 11월');
  eq(PL.monthChipLabel('2027-01'), '27년 1월');
  eq(PL.monthChipLabel('2027-01', true), '27년 1월');
  eq(PL.monthChipLabel('bad'), 'bad');
});

check('내역: 26년 12월 · 27년 1월이 같이 있으면 두 칩에 연도가 보인다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: [DEC_LUNCH, JAN_COFFEE, PARKING] };
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  var html = PL.views.list();
  has(html, '>26년 12월<');
  has(html, '>27년 1월<');
  has(html, '>26년 11월<', '올해 칩도 연도를 붙여 섞이지 않게');
  has(html, 'data-month="2027-01"');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  PL.state.data = saved;
});

check('내역: 한 해만 있으면 기존처럼 월만 보여 준다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: [OCT_LUNCH, PARKING] };
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  var html = PL.views.list();
  has(html, '>11월<');
  hasNot(html, '>26년 11월<');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  PL.state.data = saved;
});

check('내역: 연도가 바끈 달의 홈·필터가 서로 섞이지 않는다', function () {
  var saved = PL.state.data;
  PL.state.data = { transactions: [DEC_LUNCH, JAN_COFFEE] };
  PL.state.filter = { q: '', cat: '', wedding: 'all', month: '2027-01' };
  var frag = PL.views.listResults();
  has(frag, '메가커피');
  hasNot(frag, '국밥집');
  has(frag, '2027년 1월 · 1건');
  PL.state.filter = { q: '', cat: '', wedding: 'all', month: '2026-12' };
  has(PL.views.listResults(), '국밥집');
  PL.state.filter = { q: '', cat: '', wedding: 'exclude', month: '' };
  PL.state.data = saved;
});

check('홈: 2027년 1월처럼 거래가 0건인 새 달은 안내 문구로 바뀌고 깨지지 않는다', function () {
  var saved = PL.state.data;
  PL.state.data = {
    period: { month: '2027-01', daysLeft: 31 },
    budget: { period: { month: '2027-01', daysLeft: 31 }, rows: [], total: { budget: 1310000, spent: 0 } },
    monthly: [{ month: '2026-11', income: 2858322 }],
    wedding: { summary: saved.wedding.summary, rows: saved.wedding.rows },
    transactions: [PARKING, SAVINGS]
  };
  var a = PL.actualView();
  eq(a.month, '2027-01');
  eq(a.total, 0, '지난달 거래는 새 달 실지출에 더하지 않는다');
  eq(a.savings, 0);
  var html = PL.views.home();
  has(html, '2027년 1월 생활비');
  has(html, '2027년 1월에는 아직 기록이 없어요');
  hasNot(html, 'real__net', '0건인 달에 순현금 − 로 깨지지 않음');
  has(html, '₩1,310,000', '예산은 그대로 보임');
  PL.state.data = saved;
});

check('홈: 예산 기준 월이 2027-01 이면 제목도 27년 1월로 붙는다', function () {
  var saved = PL.state.data;
  PL.state.data = {
    period: { month: '2027-01', daysLeft: 10 },
    budget: { period: { month: '2027-01', daysLeft: 10 }, rows: [], total: { budget: 1310000, spent: 120000 } },
    monthly: [{ month: '2027-01', income: 2858322 }],
    wedding: { summary: { spend: 0, refund: 0, net: 0, count: 0 }, rows: [] },
    transactions: [JAN_COFFEE]
  };
  var html = PL.views.home();
  has(html, '27년 1월 실지출');
  has(html, '2027년 1월 생활비');
  PL.state.data = saved;
});

check('monthSyncNote: 기준 월과 오늘 달이 다를 때만 안내한다', function () {
  var saved = PL.state.data;
  var today = PL.todayISO().slice(0, 7);
  PL.state.data = {
    budget: { period: { month: today, daysLeft: 5 }, rows: [], total: { budget: 100, spent: 0 } },
    monthly: [], wedding: { rows: [] }, transactions: []
  };
  eq(PL.monthSyncNote(), '', '같은 달이면 안내 없음');
  PL.state.data = {
    budget: { period: { month: '2027-01', daysLeft: 5 }, rows: [], total: { budget: 100, spent: 0 } },
    monthly: [], wedding: { rows: [] }, transactions: []
  };
  has(PL.monthSyncNote(), '예산 시트의 기준 월');
  has(PL.monthSyncNote(), '2027년 1월');
  PL.state.data = saved;
});

/* ── 결과 출력 ───────────────────────────────────────────────────────────── */
var __failed = R.filter(function (r) { return !r.ok; });
JSON.stringify({
  total: R.length,
  passed: R.length - __failed.length,
  failed: __failed.length,
  failures: __failed
});
