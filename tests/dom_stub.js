/* 포켓 가계부 · 프런트엔드 테스트용 최소 DOM 스텁
   app.js 를 quickjs 에서 "실행"하되 부트스트랩(boot)은 돌지 않게 readyState='loading' 으로 둡니다.
   화면을 그리지 않고, app.js 안의 순수 로직(isSeparateTx · deriveSeparate · txMatches 등)만 검사합니다. */

var Intl = {
  NumberFormat: function () {
    return {
      format: function (v) {
        var s = String(Math.round(Number(v) || 0));
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
    };
  }
};

function __el() {
  return {
    hidden: false,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    style: {},
    classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } },
    setAttribute: function () {},
    getAttribute: function () { return null; },
    hasAttribute: function () { return false; },
    addEventListener: function () {},
    removeEventListener: function () {},
    querySelector: function () { return __el(); },
    querySelectorAll: function () { return []; },
    focus: function () {},
    setSelectionRange: function () {},
    appendChild: function () {},
    closest: function () { return null; }
  };
}

var document = {
  readyState: 'loading', // loading → app.js 는 boot() 를 바로 실행하지 않습니다
  visibilityState: 'visible',
  getElementById: function () { return __el(); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function () { return __el(); },
  addEventListener: function () {},
  removeEventListener: function () {},
  body: { appendChild: function () {}, classList: { add: function () {}, remove: function () {} } },
  documentElement: { style: {} }
};

var storage = (function () {
  var map = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) { map[k] = String(v); },
    removeItem: function (k) { delete map[k]; },
    clear: function () { map = {}; }
  };
})();

var window = {
  document: document,
  location: { protocol: 'https:', href: 'https://example.test/pocket-ledger/', origin: 'https://example.test' },
  navigator: {},
  localStorage: storage,
  scrollTo: function () {},
  requestAnimationFrame: function () {},
  addEventListener: function () {},
  confirm: function () { return false; },
  matchMedia: function () { return { matches: false, addEventListener: function () {} }; }
};
window.window = window;
window.Intl = Intl;
window.setTimeout = function () { return 0; };
window.clearTimeout = function () {};
