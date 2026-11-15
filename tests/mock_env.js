/* ==========================================================================
   포켓 가계부 · Apps Script 모의 환경 (quickjs 단위 테스트용)
   Code.gs 를 "고치지 않고" 그대로 실행하기 위한 최소 목업입니다.
   · SpreadsheetApp / Utilities / LockService / ContentService / Session / Logger
   · 각 시트는 2차원 배열(rows)로 보관하고, 접근 횟수를 세어 검증에 씁니다.
   ========================================================================== */

var __log = { lockTry: 0, lockRelease: 0, sheetTouches: {}, rangeWrites: [] };

function __makeSheet(name, rows) {
  return {
    __name: name,
    __rows: rows,
    getLastRow: function () {
      var last = 0;
      for (var r = 0; r < this.__rows.length; r++) {
        var line = this.__rows[r] || [];
        for (var c = 0; c < line.length; c++) {
          if (String(line[c] == null ? '' : line[c]) !== '') { last = r + 1; break; }
        }
      }
      return last;
    },
    getLastColumn: function () { return 9; },
    getRange: function (row, col, numRows, numCols) {
      var self = this;
      var nr = numRows || 1;
      var nc = numCols || 1;
      __log.sheetTouches[self.__name] = (__log.sheetTouches[self.__name] || 0) + 1;
      return {
        getValues: function () {
          var out = [];
          for (var r = 0; r < nr; r++) {
            var src = self.__rows[row - 1 + r] || [];
            var line = [];
            for (var c = 0; c < nc; c++) {
              var v = src[col - 1 + c];
              line.push(v === undefined || v === null ? '' : v);
            }
            out.push(line);
          }
          return out;
        },
        getValue: function () {
          var src = self.__rows[row - 1] || [];
          var v = src[col - 1];
          return v === undefined || v === null ? '' : v;
        },
        setValues: function (vals) {
          for (var r = 0; r < vals.length; r++) {
            while (self.__rows.length < row - 1 + r + 1) self.__rows.push([]);
            var target = self.__rows[row - 1 + r];
            for (var c = 0; c < vals[r].length; c++) {
              target[col - 1 + c] = vals[r][c];
            }
            __log.rangeWrites.push({
              sheet: self.__name, row: row + r, col: col, count: vals[r].length,
              values: vals[r].slice()
            });
          }
        }
      };
    },
    deleteRow: function (row) {
      __log.rangeWrites.push({ sheet: this.__name, row: row, col: 0, count: 0, values: ['<deleteRow>'] });
      this.__rows.splice(row - 1, 1);
    }
  };
}

var __ss = {
  __sheets: {},
  getSheetByName: function (name) { return this.__sheets[name] || null; },
  getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; },
  getSheets: function () {
    var out = [];
    for (var k in this.__sheets) out.push(this.__sheets[k]);
    return out;
  }
};

var SpreadsheetApp = {
  getActiveSpreadsheet: function () { return __ss; },
  openById: function () { return __ss; }
};

var Utilities = {
  formatDate: function (d, tz, fmt) {
    function p(x) { return (x < 10 ? '0' : '') + x; }
    var map = {
      yyyy: String(d.getFullYear()),
      MM: p(d.getMonth() + 1),
      dd: p(d.getDate()),
      HH: p(d.getHours()),
      mm: p(d.getMinutes()),
      ss: p(d.getSeconds())
    };
    return String(fmt).replace(/yyyy|MM|dd|HH|mm|ss/g, function (t) { return map[t]; });
  }
};

var LockService = {
  getDocumentLock: function () {
    return {
      tryLock: function () { __log.lockTry++; return __lockFails !== true; },
      releaseLock: function () { __log.lockRelease++; }
    };
  }
};
var __lockFails = false;

var ContentService = {
  MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript' },
  createTextOutput: function (s) {
    return {
      __s: s,
      setMimeType: function () { return this; },
      getContent: function () { return this.__s; }
    };
  }
};

var Session = { getScriptTimeZone: function () { return 'Asia/Seoul'; } };
var Logger = { log: function () {} };

/* ── 테스트용 데이터 ─────────────────────────────────────────────────────── */
var __TX_HEADER = ['날짜', '시각', '사용처', '구분', '금액', '결제수단', '카테고리', '비고', '메일ID'];

function __txRows() {
  return [
    __TX_HEADER.slice(),
    ['2026-11-10', '09:12', '스타벅스', '출금', 5600, '국민계좌', '카페/간식', '', 'mail-1'],
    ['2026-11-11', '12:40', '이마트', '출금', 43200, 'KB국민', '생활/마트', '', 'mail-2'],
    ['2026-11-12', '', '월급', '입금', 3200000, '국민계좌', '주수입', '', 'mail-3'],
    ['2026-11-13', '19:03', '드레스샵', '출금', 550000, '토스', '문화/예술', '#결혼준비 #제외 계약금', 'mail-4'],
    [], // 중간의 빈 행 (건너뛰지만 행 번호는 유지되어야 함)
    ['2026-11-14', '08:05', 'GS25', '출금', 3200, '현금', '생활/마트', '간식', 'mail-5']
  ];
}

function __budgetRows() {
  return [
    ['카테고리', '예산', '지출', '남은', '상태', '상태', '하루', '지난달'],
    ['식사', 300000, 120000, 180000, '', '여유', 6000, 250000],
    ['합계', 300000, 120000, 180000, '', '여유', 6000, 250000]
  ];
}

function __monthlyRows() {
  return [
    ['월', '수입', '지출', '순액', '저축률', '건수'],
    ['2026-10', 3200000, 2100000, 1100000, 34.4, 42]
  ];
}

function __weddingRows() {
  return [
    ['누적 지출', 550000], ['입금/환급', 0], ['순 지출', 550000], ['건수', 1],
    ['날짜', '시각', '사용처', '구분', '금액', '결제수단', '카테고리', '비고'],
    ['2026-11-13', '19:03', '드레스샵', '출금', 550000, '토스', '문화/예술', '#결혼준비 #제외 계약금']
  ];
}

function __reset() {
  __log = { lockTry: 0, lockRelease: 0, sheetTouches: {}, rangeWrites: [] };
  __lockFails = false;
  __ss.__sheets = {
    '시트1': __makeSheet('시트1', __txRows()),
    '예산': __makeSheet('예산', __budgetRows()),
    '월별요약': __makeSheet('월별요약', __monthlyRows()),
    '결혼준비': __makeSheet('결혼준비', __weddingRows())
  };
  return __ss;
}
