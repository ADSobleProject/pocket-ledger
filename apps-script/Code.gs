/**
 * ============================================================================
 *  포켓 가계부 · Google Apps Script 백엔드
 * ============================================================================
 *
 *  "2026 가계부 (자동기록)" 스프레드시트에 붙여넣어 쓰는 백엔드입니다.
 *  · 읽기 : 예산, 월별요약, 결혼준비, 시트1 최근 거래(행 번호 포함)
 *  · 쓰기 : 시트1 새 거래 추가(append) · 기존 행 수정(update) · 행 삭제(delete)
 *           그 외 시트(정제데이터·월별요약·대시보드·예산·결혼준비)는 절대 건드리지 않고,
 *           수정할 때도 I열(메일ID)은 그대로 둡니다.
 *
 *  [설치 순서]
 *   1) 구글 시트 열기 → 확장 프로그램 → Apps Script
 *   2) 편집기의 기본 Code.gs 내용을 모두 지우고, 이 파일 전체를 그대로 붙여넣기
 *   3) 아래 APP_PIN 값을 원하는 4자리 숫자로 수정 (기본 0000)
 *   4) 저장(Ctrl+S) → 오른쪽 위 [배포] → [새 배포]
 *        · 유형 선택      : 웹 앱
 *        · 설명           : 포켓 가계부
 *        · 다음 사용자로 실행 : 나
 *        · 액세스 권한     : 모든 사람        ← 이 값을 바꾸면 폰에서 연결되지 않습니다
 *   5) [배포] → 나오는 "웹 앱 URL"(.../exec)을 복사
 *   6) 포켓 가계부 앱 첫 화면에 URL과 PIN을 넣고 [연결하기]
 *
 *  ※ 스크립트가 시트에 붙어 있지 않은 "독립 스크립트"라면
 *     아래 SPREADSHEET_ID 에 시트 ID를 넣어 주세요.
 *  ※ PIN을 바꾼 뒤에는 [배포] → [배포 관리] → 연필 아이콘 → 버전: 새 버전 → 배포.
 * ============================================================================
 */

// ── 설정 ────────────────────────────────────────────────────────────────────
var APP_PIN = '0000';            // ★ 여기를 4자리 PIN으로 바꾸세요 (예: '2468')

var SPREADSHEET_ID = '';         // 비워 두면 이 스크립트가 붙어 있는 스프레드시트를 사용합니다

var SHEET_TX      = '시트1';
var SHEET_BUDGET  = '예산';
var SHEET_MONTHLY = '월별요약';
var SHEET_WEDDING = '결혼준비';

var RECENT_LIMIT  = 200;         // 앱으로 보낼 최근 거래 건수

// 표준 13개 카테고리 (AI가이드 시트 3번 목록과 동일)
var CATEGORIES = [
  '식사', '카페/간식', '생활/마트', '온라인쇼핑', '교통/차량', '주거/통신',
  '금융/보험', '의료/건강', '뷰티/미용', '문화/예술', '기타지출',
  '주수입', '기타수입'
];

var WEDDING_TAG = '#결혼준비 #제외';

// ── 진입점 ──────────────────────────────────────────────────────────────────
function doGet(e) {
  var p = (e && e.parameter) || {};
  var callback = p.callback || '';

  if (String(p.pin || '') !== String(APP_PIN)) {
    return respond_({ ok: false, error: { code: 'PIN_MISMATCH', message: 'PIN이 올바르지 않습니다.' } }, callback);
  }

  try {
    var ss = getSS_();
    var data = {
      source: 'pocket-ledger-apps-script',
      serverTime: formatNow_('yyyy-MM-dd HH:mm:ss'),
      period: readPeriodInfo_(ss),
      budget: readBudget_(ss),
      monthly: readMonthly_(ss),
      wedding: readWedding_(ss),
      transactions: readTransactions_(ss, RECENT_LIMIT),
      categories: CATEGORIES
    };
    return respond_({ ok: true, data: data }, callback);
  } catch (err) {
    return respond_({ ok: false, error: { code: 'READ_FAILED', message: String(err && err.message || err) } }, callback);
  }
}

function doPost(e) {
  var body;
  try {
    body = parseBody_(e);
  } catch (err) {
    return respond_({ ok: false, error: { code: 'BAD_BODY', message: '요청 본문을 읽을 수 없습니다.' } }, '');
  }

  if (String(body.pin || '') !== String(APP_PIN)) {
    return respond_({ ok: false, error: { code: 'PIN_MISMATCH', message: 'PIN이 올바르지 않습니다.' } }, '');
  }

  var action = String(body.action || 'append');
  try {
    if (action === 'append') return respond_(appendTransaction_(body), '');
    if (action === 'update') return respond_(updateTransaction_(body), '');
    if (action === 'delete') return respond_(deleteTransaction_(body), '');
    if (action === 'ping')   return respond_({ ok: true, data: { pong: true, serverTime: formatNow_('yyyy-MM-dd HH:mm:ss') } }, '');
    return respond_({ ok: false, error: { code: 'UNKNOWN_ACTION', message: '알 수 없는 action: ' + action } }, '');
  } catch (err) {
    return respond_({
      ok: false,
      error: { code: String((err && err.code) || 'WRITE_FAILED'), message: String(err && err.message || err) }
    }, '');
  }
}

// ── 쓰기: 시트1 마지막 행에 9칸 추가 ─────────────────────────────────────────
function appendTransaction_(body) {
  var date     = normDate_(body.date);
  var time     = normTime_(body.time);
  var merchant = String(body.merchant == null ? '' : body.merchant).trim();
  var type     = String(body.type || '출금').trim() === '입금' ? '입금' : '출금';
  var amount   = toAmount_(body.amount);
  var method   = String(body.method == null ? '' : body.method).trim() || '직접입력';
  var category = String(body.category == null ? '' : body.category).trim();
  var note     = String(body.note == null ? '' : body.note).trim();

  if (!date)                 throw new Error('날짜 형식이 올바르지 않습니다 (yyyy-mm-dd).');
  if (!merchant)             throw new Error('사용처를 입력해 주세요.');
  if (!(amount > 0))         throw new Error('금액은 0보다 큰 숫자여야 합니다.');

  if (CATEGORIES.indexOf(category) < 0) {
    category = (type === '입금') ? '기타수입' : '기타지출';
  }
  if (body.isWedding === true && note.indexOf('#결혼준비') < 0) {
    note = (WEDDING_TAG + ' ' + note).trim();
  }

  var mailId = 'webapp-' + Date.now();
  var lock = null;
  var locked = false;
  try {
    lock = LockService.getDocumentLock();
    locked = lock.tryLock(20000);
  } catch (e1) {
    locked = false; // 독립 스크립트 등 잠금을 쓸 수 없는 환경에서도 저장은 계속합니다
  }

  try {
    var ss = getSS_();
    var sh = mustSheet_(ss, SHEET_TX);
    var lastRow = sh.getLastRow();
    var target = Math.max(lastRow + 1, 2);

    // 정확히 9칸(A~I)만 씁니다. 다른 열과 다른 탭은 건드리지 않습니다.
    sh.getRange(target, 1, 1, 9).setValues([[
      date, time, merchant, type, amount, method, category, note, mailId
    ]]);

    return {
      ok: true,
      data: {
        row: target,
        inserted: {
          date: date, time: time, merchant: merchant, type: type, amount: amount,
          method: method, category: category, note: note, isWedding: body.isWedding === true,
          mailId: mailId
        }
      }
    };
  } finally {
    if (locked && lock) { try { lock.releaseLock(); } catch (e2) {} }
  }
}

// ── 쓰기: 시트1 기존 행 수정 (A~H만, I열 메일ID 보존) ──────────────────────
function updateTransaction_(body) {
  var row = toRow_(body.row);

  var date     = normDate_(body.date);
  var time     = normTime_(body.time);
  var merchant = String(body.merchant == null ? '' : body.merchant).trim();
  var type     = String(body.type || '출금').trim() === '입금' ? '입금' : '출금';
  var amount   = toAmount_(body.amount);
  var method   = String(body.method == null ? '' : body.method).trim() || '직접입력';
  var category = String(body.category == null ? '' : body.category).trim();
  var note     = applyWeddingTag_(body.note, body.isWedding === true);

  if (!date)         throw scriptError_('BAD_DATE', '날짜 형식이 올바르지 않습니다 (yyyy-mm-dd).');
  if (!merchant)     throw scriptError_('BAD_MERCHANT', '사용처를 입력해 주세요.');
  if (!(amount > 0)) throw scriptError_('BAD_AMOUNT', '금액은 0보다 큰 숫자여야 합니다.');

  if (CATEGORIES.indexOf(category) < 0) {
    category = (type === '입금') ? '기타수입' : '기타지출';
  }

  var lock = lockOrNull_();
  try {
    var ss = getSS_();
    var sh = mustSheet_(ss, SHEET_TX);
    var lastRow = sh.getLastRow();

    // 행이 실제로 존재하는지 확인 (다른 곳에서 지워졌거나 행이 밀린 경우 방어)
    if (row > lastRow) {
      throw scriptError_('ROW_OUT_OF_RANGE', row + '행이 시트 범위를 벗어났습니다. 새로고침 후 다시 시도해 주세요.');
    }
    var before = sh.getRange(row, 1, 1, 9).getValues()[0];
    if (isBlankRow_(before)) {
      throw scriptError_('ROW_EMPTY', row + '행이 비어 있습니다. 새로고침 후 다시 시도해 주세요.');
    }

    // 정확히 A~H 8칸만 씁니다. I열(메일ID)은 그대로 둡니다.
    sh.getRange(row, 1, 1, 8).setValues([[
      date, time, merchant, type, amount, method, category, note
    ]]);

    return {
      ok: true,
      data: {
        row: row,
        updated: {
          date: date, time: time, merchant: merchant, type: type, amount: amount,
          method: method, category: category, note: note, isWedding: body.isWedding === true,
          mailId: String(before[8] == null ? '' : before[8]).trim()
        },
        previous: {
          merchant: String(before[2] == null ? '' : before[2]).trim(),
          amount: num_(before[4]) || 0,
          note: String(before[7] == null ? '' : before[7]).trim()
        }
      }
    };
  } finally {
    releaseLock_(lock);
  }
}

// ── 쓰기: 시트1 기존 행 삭제 ────────────────────────────────────────────────
function deleteTransaction_(body) {
  var row = toRow_(body.row);
  var expected = String(body.expectedMerchant == null ? '' : body.expectedMerchant).trim();

  var lock = lockOrNull_();
  try {
    var ss = getSS_();
    var sh = mustSheet_(ss, SHEET_TX);
    var lastRow = sh.getLastRow();

    if (row > lastRow) {
      throw scriptError_('ROW_OUT_OF_RANGE', row + '행이 시트 범위를 벗어났습니다. 새로고침 후 다시 시도해 주세요.');
    }
    var before = sh.getRange(row, 1, 1, 9).getValues()[0];
    if (isBlankRow_(before)) {
      throw scriptError_('ROW_EMPTY', row + '행이 비어 있습니다. 새로고침 후 다시 시도해 주세요.');
    }

    var merchant = String(before[2] == null ? '' : before[2]).trim();
    // 안전 장치: 앱이 보고 있던 사용처와 시트의 사용처가 다르면 삭제하지 않습니다.
    if (expected && merchant !== expected) {
      throw scriptError_('ROW_MISMATCH',
        '시트 내용이 바뀌어 삭제하지 않았습니다. (앱: ' + expected + ' / 시트: ' + merchant +
        ') 새로고침 후 다시 시도해 주세요.');
    }

    sh.deleteRow(row);

    return {
      ok: true,
      data: {
        row: row,
        deleted: {
          date: dateStr_(before[0]), time: timeStr_(before[1]), merchant: merchant,
          type: String(before[3] || '출금').trim() === '입금' ? '입금' : '출금',
          amount: num_(before[4]) || 0,
          method: String(before[5] == null ? '' : before[5]).trim(),
          category: String(before[6] == null ? '' : before[6]).trim(),
          note: String(before[7] == null ? '' : before[7]).trim()
        }
      }
    };
  } finally {
    releaseLock_(lock);
  }
}

// ── 쓰기 보조 ───────────────────────────────────────────────────────────────
function toRow_(v) {
  var row = Number(v);
  if (!isFinite(row) || Math.floor(row) !== row || row < 2) {
    throw scriptError_('INVALID_ROW', '행 번호가 올바르지 않습니다. (2 이상의 정수)');
  }
  return row;
}

function isBlankRow_(vals) {
  if (!vals) return true;
  var merchant = String(vals[2] == null ? '' : vals[2]).trim();
  var amount = num_(vals[4]);
  var date = dateStr_(vals[0]);
  return !merchant && !amount && !date;
}

function scriptError_(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function lockOrNull_() {
  try {
    var lock = LockService.getDocumentLock();
    if (!lock) return null;
    return lock.tryLock(20000) ? lock : null; // 잠금을 못 잡아도 쓰기는 계속합니다
  } catch (e) {
    return null; // 독립 스크립트 등 잠금을 쓸 수 없는 환경
  }
}

function releaseLock_(lock) {
  if (!lock) return;
  try { lock.releaseLock(); } catch (e) {}
}

function applyWeddingTag_(note, isWedding) {
  var cleaned = stripWeddingTags_(note);
  if (!isWedding) return cleaned;
  return (WEDDING_TAG + ' ' + cleaned).trim();
}

function stripWeddingTags_(note) {
  var s = String(note == null ? '' : note)
    .replace(/#결혼준비/g, ' ')
    .replace(/#제외/g, ' ')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
  return s.replace(/^[·,\-:;|]+ ?/, '').trim(); // 태그만 지운 자리에 남은 구분자 정리
}

// ── 읽기: 예산 ──────────────────────────────────────────────────────────────
function readBudget_(ss) {
  var sh = mustSheet_(ss, SHEET_BUDGET);
  var rowCount = Math.min(Math.max(sh.getLastRow(), 10), 60);
  var vals = sh.getRange(1, 1, rowCount, 8).getValues();

  var headerRow = -1;
  for (var r = 0; r < vals.length; r++) {
    if (String(vals[r][0]).trim() === '카테고리') { headerRow = r; break; }
  }

  var rows = [];
  var total = null;

  if (headerRow >= 0) {
    for (var i = headerRow + 1; i < vals.length; i++) {
      var name = String(vals[i][0]).trim();
      if (!name) continue;
      var rec = budgetRecord_(name, vals[i]);
      if (name === '합계') { total = rec; break; }
      rows.push(rec);
    }
  }

  if (!total) {
    total = { category: '합계', budget: 0, spent: 0, remaining: 0, rate: 0, status: '여유', daily: 0, lastMonth: 0 };
    for (var k = 0; k < rows.length; k++) {
      total.budget += rows[k].budget;
      total.spent += rows[k].spent;
      total.lastMonth += rows[k].lastMonth;
    }
    total.remaining = total.budget - total.spent;
    total.rate = total.budget > 0 ? round1_(total.spent / total.budget * 100) : 0;
    total.status = statusOf_(total.rate, total.spent, total.budget);
  }

  var period = readPeriodFromBudget_(vals);
  if (period.daysLeft > 0 && total.remaining !== 0) {
    total.daily = Math.floor(total.remaining / period.daysLeft);
  }

  return { period: period, rows: rows, total: total };
}

function budgetRecord_(name, row) {
  var budget  = num_(row[1]);
  var spent   = num_(row[2]);
  var remain  = num_(row[3]);
  var lastMon = num_(row[7]);
  if (remain === null) remain = budget - spent;
  var rate = budget > 0 ? round1_(spent / budget * 100) : 0;
  var status = String(row[5] || '').trim();
  if (!status) status = statusOf_(rate, spent, budget);
  var daily = num_(row[6]);
  return {
    category: name,
    budget: budget === null ? 0 : budget,
    spent: spent === null ? 0 : spent,
    remaining: remain,
    rate: rate,
    status: status,
    daily: daily === null ? 0 : daily,
    lastMonth: lastMon === null ? 0 : lastMon
  };
}

function statusOf_(rate, spent, budget) {
  if (budget > 0 && spent >= budget) return '초과';
  if (rate >= 80) return '주의';
  return '여유';
}

function readPeriodFromBudget_(vals) {
  var month = '';
  var daysLeft = 0;
  for (var r = 0; r < Math.min(vals.length, 6); r++) {
    for (var c = 0; c < vals[r].length; c++) {
      var label = String(vals[r][c] || '').trim();
      if (label.indexOf('기준') >= 0 && label.indexOf('월') >= 0) {
        month = nextValue_(vals[r], c);
      } else if (label.indexOf('남은 일수') >= 0) {
        var v = nextValue_(vals[r], c);
        daysLeft = num_(v) || 0;
      }
    }
  }
  if (month instanceof Date) month = formatNow_('yyyy-MM'); // 방어
  month = String(month || '').trim();
  if (/^\d{4}-\d{1,2}$/.test(month) && month.length === 6) month = month.slice(0, 5) + '0' + month.slice(5);
  return { month: month, daysLeft: daysLeft };
}

function nextValue_(row, fromCol) {
  for (var c = fromCol + 1; c < row.length; c++) {
    var s = String(row[c] == null ? '' : row[c]).trim();
    if (s !== '') return row[c];
  }
  return '';
}

function readPeriodInfo_(ss) {
  var b = readBudget_(ss);
  return b.period;
}

// ── 읽기: 월별요약 ──────────────────────────────────────────────────────────
function readMonthly_(ss) {
  var sh = mustSheet_(ss, SHEET_MONTHLY);
  var rowCount = Math.min(Math.max(sh.getLastRow(), 5), 80);
  var vals = sh.getRange(1, 1, rowCount, 6).getValues();

  var headerRow = -1;
  for (var r = 0; r < vals.length; r++) {
    if (String(vals[r][0]).trim() === '월') { headerRow = r; break; }
  }
  var out = [];
  if (headerRow < 0) return out;

  for (var i = headerRow + 1; i < vals.length; i++) {
    var rawMonth = vals[i][0];
    var label = monthLabel_(rawMonth);
    if (!label) continue;
    var income = valueOr_(vals[i][1], 0);
    var spend  = valueOr_(vals[i][2], 0);
    var net    = valueOr_(vals[i][3], income - spend);
    var rate   = income > 0 ? round1_(net / income * 100) : null;
    var count  = valueOr_(vals[i][5], null);
    out.push({
      month: label,
      income: income,
      expense: spend,
      net: net,
      rate: rate,
      count: count
    });
  }
  return out;
}

function monthLabel_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, sheetTz_(), 'yyyy-MM');
  }
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})[.\-\/년\s]*(\d{1,2})/);
  if (m) return m[1] + '-' + (m[2].length === 1 ? '0' + m[2] : m[2]);
  return s;
}

// ── 읽기: 결혼준비 ──────────────────────────────────────────────────────────
function readWedding_(ss) {
  var sh = mustSheet_(ss, SHEET_WEDDING);
  var rowCount = Math.min(Math.max(sh.getLastRow(), 10), 400);
  var vals = sh.getRange(1, 1, rowCount, 8).getValues();

  var summary = { spend: 0, refund: 0, net: 0, count: 0 };
  var headerRow = -1;

  for (var r = 0; r < Math.min(vals.length, 6); r++) {
    for (var c = 0; c < vals[r].length; c++) {
      var label = String(vals[r][c] || '').trim();
      if (label === '누적 지출')      { summary.spend  = num_(nextValue_(vals[r], c)) || 0; }
      else if (label === '입금/환급') { summary.refund = num_(nextValue_(vals[r], c)) || 0; }
      else if (label === '순 지출')   { summary.net    = num_(nextValue_(vals[r], c)) || 0; }
      else if (label === '건수')      { summary.count  = num_(nextValue_(vals[r], c)) || 0; }
    }
  }
  for (var h = 0; h < vals.length; h++) {
    if (String(vals[h][0]).trim() === '날짜') { headerRow = h; break; }
  }

  var rows = [];
  if (headerRow >= 0) {
    for (var i = headerRow + 1; i < vals.length; i++) {
      var merchant = String(vals[i][2] || '').trim();
      var amount = num_(vals[i][4]);
      if (!merchant && !amount) continue;
      rows.push({
        date: dateStr_(vals[i][0]),
        time: timeStr_(vals[i][1]),
        merchant: merchant,
        type: String(vals[i][3] || '출금').trim() === '입금' ? '입금' : '출금',
        amount: amount || 0,
        method: String(vals[i][5] || '').trim(),
        category: String(vals[i][6] || '').trim(),
        note: String(vals[i][7] || '').trim()
      });
    }
  }

  if (!summary.spend && !summary.refund) {
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].type === '입금') summary.refund += rows[j].amount;
      else summary.spend += rows[j].amount;
    }
    summary.net = summary.spend - summary.refund;
    summary.count = rows.length;
  }

  rows.reverse(); // 최신 순
  return { summary: summary, rows: rows };
}

// ── 읽기: 시트1 최근 거래 ────────────────────────────────────────────────────
function readTransactions_(ss, limit) {
  var sh = mustSheet_(ss, SHEET_TX);
  var last = sh.getLastRow();
  if (last < 2) return [];

  var vals = sh.getRange(2, 1, last - 1, 9).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var merchant = String(vals[i][2] || '').trim();
    var amount = num_(vals[i][4]);
    if (!merchant && !amount) continue;
    out.push({
      row: i + 2, // 시트1의 실제 행 번호 (1-based, 헤더가 1행)
      date: dateStr_(vals[i][0]),
      time: timeStr_(vals[i][1]),
      merchant: merchant,
      type: String(vals[i][3] || '출금').trim() === '입금' ? '입금' : '출금',
      amount: amount || 0,
      method: String(vals[i][5] || '').trim(),
      category: String(vals[i][6] || '').trim(),
      note: String(vals[i][7] || '').trim(),
      mailId: String(vals[i][8] || '').trim()
    });
  }
  out.reverse(); // 시트는 과거→현재 순으로 쌓이므로 뒤집어 최신 순
  return out.slice(0, limit || RECENT_LIMIT);
}

// ── 응답/유틸 ───────────────────────────────────────────────────────────────
function respond_(payload, callback) {
  var json = JSON.stringify(payload);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  if (!e) return {};
  var raw = e.postData && e.postData.contents;
  if (raw) {
    try { return JSON.parse(raw); } catch (err) {}
    // form-encoded 로 들어온 경우
    try {
      var obj = {};
      raw.split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) obj[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
      if (Object.keys(obj).length) return obj;
    } catch (err2) {}
  }
  return (e.parameter || {});
}

function getSS_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('스프레드시트를 찾을 수 없습니다. SPREADSHEET_ID를 지정해 주세요.');
}

function mustSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('"' + name + '" 탭을 찾을 수 없습니다.');
  return sh;
}

function sheetTz_() {
  try {
    var tz = getSS_().getSpreadsheetTimeZone();
    return tz || Session.getScriptTimeZone();
  } catch (e) {
    return Session.getScriptTimeZone();
  }
}

function formatNow_(fmt) {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', fmt);
}

function num_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/\s/g, '');
  if (!s || s === '-' || s === '—') return null;
  var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  var cleaned = s.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  var n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

function valueOr_(v, fallback) {
  var n = num_(v);
  return n === null ? fallback : n;
}

function toAmount_(v) {
  var n = num_(v);
  if (n === null) return NaN;
  return Math.round(Math.abs(n));
}

function round1_(n) {
  return Math.round(n * 10) / 10;
}

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, sheetTz_(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) {
    var mm = m[2].length === 1 ? '0' + m[2] : m[2];
    var dd = m[3].length === 1 ? '0' + m[3] : m[3];
    return m[1] + '-' + mm + '-' + dd;
  }
  return s;
}

function timeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, sheetTz_(), 'HH:mm');
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2];
  return s;
}

function normDate_(v) {
  var s = dateStr_(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return s;
}

function normTime_(v) {
  var s = timeStr_(v);
  if (!s) return '';
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  var h = parseInt(m[1], 10);
  if (h > 23) h = 23;
  return (h < 10 ? '0' + h : String(h)) + ':' + m[2];
}

// ── PIN만 확인하는 간단 테스트용 ─────────────────────────────────────────────
function test_pinCheck() {
  Logger.log(doGet({ parameter: { pin: APP_PIN } }).getContent().slice(0, 400));
}
