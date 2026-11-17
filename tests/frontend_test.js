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
var GROCERY = {
  row: 114, date: '2026-11-16', time: '19:02', merchant: '이마트 에브리데이', type: '출금',
  amount: 32000, method: 'KB국민', category: '생활/마트', note: '', mailId: ''
};
var TRAVEL_REFUND = {
  row: 113, date: '2026-11-15', time: '09:10', merchant: '한화손해보험 환급', type: '입금',
  amount: 40080, method: 'KB국민', category: '기타수입', note: '보험료 일부 환급 #제외', mailId: ''
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
  budget: { period: { month: '2026-11', daysLeft: 12 }, rows: [], total: { budget: 1310000, spent: 678888 } },
  monthly: [{ month: '2026-11', income: 2858322, expense: 678888, net: 2179434, rate: 76.25, count: 47 }],
  wedding: { summary: { spend: 2150000, refund: 0, net: 2150000, count: 2 }, rows: [WEDDING] },
  transactions: ALL
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

/* ── 결과 출력 ───────────────────────────────────────────────────────────── */
var __failed = R.filter(function (r) { return !r.ok; });
JSON.stringify({
  total: R.length,
  passed: R.length - __failed.length,
  failed: __failed.length,
  failures: __failed
});
