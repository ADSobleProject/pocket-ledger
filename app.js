/* ==========================================================================
   포켓 가계부 · app.js
   구글 시트(Apps Script 웹 앱)와 통신하는 모바일 가계부 프론트엔드
   · 데이터는 구글 시트에만 저장됩니다. 이 기기에는 URL/PIN과 최근 캐시만 남습니다.
   ========================================================================== */
(function () {
  'use strict';

  /* ── 상수 ─────────────────────────────────────────────────────────────── */
  var LS = {
    url: 'pl.url',
    pin: 'pl.pin',
    cache: 'pl.cache',
    tab: 'pl.tab'
  };

  var CATEGORIES = [
    '식사', '카페/간식', '생활/마트', '온라인쇼핑', '교통/차량', '주거/통신',
    '금융/보험', '의료/건강', '뷰티/미용', '문화/예술', '기타지출', '주수입', '기타수입'
  ];
  var EXPENSE_CATS = CATEGORIES.slice(0, 11);
  var INCOME_CATS = ['주수입', '기타수입'];
  var CAT_ICON = {
    '식사': '🍚', '카페/간식': '☕️', '생활/마트': '🛒', '온라인쇼핑': '📦',
    '교통/차량': '🚕', '주거/통신': '🏠', '금융/보험': '🏦', '의료/건강': '💊',
    '뷰티/미용': '💇', '문화/예술': '🎬', '기타지출': '🧾', '주수입': '💰', '기타수입': '💸'
  };
  var METHODS = ['국민계좌', 'KB국민', '토스', '카카오페이', '네이버페이', '현금'];
  var WEDDING_TAG = '#결혼준비 #제외';
  // 시트 규칙: 비고에 '#제외'가 붙은 행은 생활비 집계에서 빠집니다.
  // 그중 '#결혼준비'가 아닌 것을 앱에서는 '별도지출'로 따로 모아 보여 줍니다.
  var EXCLUDE_TAG = '#제외';

  var state = {
    url: '',
    pin: '',
    data: null,
    syncedAt: null,
    tab: 'home',
    loading: false,
    offline: false,
    filter: { q: '', cat: '', wedding: 'exclude' },
    planSeg: 'wedding', // 'wedding' | 'separate'
    form: null,
    saved: null
  };

  /* ── DOM 헬퍼 ─────────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── 숫자 / 날짜 포맷 ─────────────────────────────────────────────────── */
  var numFmt = new Intl.NumberFormat('ko-KR');

  function n(v) {
    if (v === null || v === undefined || v === '') return 0;
    var x = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(x) ? 0 : x;
  }
  function money(v) { return '₩' + numFmt.format(Math.round(Math.abs(n(v)))); }
  function digits(s) { return String(s == null ? '' : s).replace(/[^0-9]/g, ''); }
  function commaDigits(d) { return d ? numFmt.format(Number(d)) : ''; }
  function pct(v, digitsN) {
    var x = n(v);
    if (!isFinite(x)) x = 0;
    return (Math.round(x * 10) / 10).toFixed(digitsN === 0 ? 0 : 1).replace(/\.0$/, '') + '%';
  }

  function pad2(v) { return (v < 10 ? '0' : '') + v; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function nowHM() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function parseISO(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  function dayLabel(iso) {
    var d = parseISO(iso);
    if (!d) return iso || '날짜 없음';
    var t = new Date();
    var today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var diff = Math.round((d - today) / 86400000);
    var base = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WD[d.getDay()] + ')';
    if (diff === 0) return '오늘 · ' + base;
    if (diff === -1) return '어제 · ' + base;
    return base;
  }
  function monthLabel(ym) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return ym || '';
    return m[1] + '년 ' + Number(m[2]) + '월';
  }
  function monthLabelShort(ym) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return ym || '';
    return m[2] + '월';
  }

  /* ── 저장소 ───────────────────────────────────────────────────────────── */
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function loadCache() {
    var raw = lsGet(LS.cache);
    if (!raw) return null;
    try {
      var obj = JSON.parse(raw);
      if (obj && obj.data) return obj;
    } catch (e) {}
    return null;
  }
  function saveCache(data) {
    try {
      lsSet(LS.cache, JSON.stringify({ at: Date.now(), data: data }));
    } catch (e) {}
  }

  /* ── API ──────────────────────────────────────────────────────────────── */
  function ApiError(code, message) {
    this.code = code || 'ERROR';
    this.message = message || '알 수 없는 오류가 발생했습니다.';
  }
  ApiError.prototype = Object.create(Error.prototype);

  function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
  }

  function withParam(base, kv) {
    var qs = Object.keys(kv).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(kv[k]);
    }).join('&');
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function unwrap(json) {
    if (json && json.ok === true && json.data) return json.data;
    if (json && json.ok === false && json.error) {
      throw new ApiError(json.error.code || 'ERROR', json.error.message || '요청을 처리하지 못했습니다.');
    }
    throw new ApiError('BAD_RESPONSE', '서버 응답 형식이 예상과 다릅니다. 웹 앱 배포 설정을 확인해 주세요.');
  }

  function jsonpGet(base) {
    return new Promise(function (resolve, reject) {
      var cb = 'plCb' + Date.now() + Math.floor(Math.random() * 1000);
      var script = document.createElement('script');
      var timer = setTimeout(function () { cleanup(); reject(new ApiError('NETWORK', '서버 응답이 없습니다.')); }, 20000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = function (json) {
        cleanup();
        try { resolve(unwrap(json)); } catch (err) { reject(err); }
      };
      script.onerror = function () { cleanup(); reject(new ApiError('NETWORK', '연결에 실패했습니다.')); };
      script.src = withParam(base, { pin: state.pin, callback: cb, t: Date.now() });
      document.head.appendChild(script);
    });
  }

  async function apiGet() {
    if (window.__PL_MOCK__) return unwrap(await window.__PL_MOCK__.get());
    var base = normalizeUrl(state.url);
    if (!base) throw new ApiError('NO_URL', '웹 앱 URL이 없습니다.');
    var url = withParam(base, { pin: state.pin, t: Date.now() });

    var res, text;
    try {
      res = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'follow' });
      text = await res.text();
    } catch (e) {
      return await jsonpGet(base); // CORS/네트워크 차단 시 JSONP로 재시도
    }
    var json = parseJson(text);
    if (!json) {
      throw new ApiError('BAD_RESPONSE',
        '서버 응답을 해석하지 못했습니다. 웹 앱 URL이 .../exec 인지, 액세스 권한이 "모든 사람"인지 확인해 주세요.');
    }
    return unwrap(json);
  }

  async function apiPost(payload) {
    if (window.__PL_MOCK__) return unwrap(await window.__PL_MOCK__.post(payload));
    var base = normalizeUrl(state.url);
    if (!base) throw new ApiError('NO_URL', '웹 앱 URL이 없습니다.');

    var body = JSON.stringify(Object.assign({ pin: state.pin }, payload));
    var res, text;
    try {
      // Content-Type: text/plain → 브라우저 preflight(CORS OPTIONS)를 생략합니다.
      res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow',
        cache: 'no-store'
      });
      text = await res.text();
    } catch (e) {
      throw new ApiError('NETWORK', '전송에 실패했습니다. (네트워크 또는 배포 설정 확인)');
    }
    var json = parseJson(text);
    if (!json) throw new ApiError('BAD_RESPONSE', '서버 응답을 해석하지 못했습니다. 실제로 저장되었는지 다시 조회해 확인할게요.');
    return unwrap(json);
  }

  /* ── 데이터 파생값 ────────────────────────────────────────────────────── */
  function isWeddingTx(t) {
    return /#결혼준비/.test(String((t && t.note) || ''));
  }

  // #제외 는 달렸지만 #결혼준비 는 아닌 지출 = 별도지출(연납 보험료처럼 생활비에서 빼는 특별지출)
  function isSeparateTx(t) {
    var note = String((t && t.note) || '');
    return note.indexOf(EXCLUDE_TAG) >= 0 && !isWeddingTx(t);
  }

  // 비고에서 태그만 뽑습니다 (#결혼준비 · #제외 는 화면에 보여 주지 않음).
  function noteTags(t) {
    var note = String((t && t.note) || '');
    var out = [];
    var re = /#([^\s#]+)/g;
    var m;
    while ((m = re.exec(note))) {
      var tag = m[1];
      if (tag === '결혼준비' || tag === '제외') continue;
      if (out.indexOf(tag) < 0) out.push(tag);
    }
    return out;
  }

  // 별도지출 집계 — ① 백엔드가 separate 를 내려 주면 그대로 쓰고,
  // ② 없으면 앱이 받은 거래 목록(시트1)의 비고로 직접 판단합니다.
  function deriveSeparate(tx) {
    var summary = { spend: 0, refund: 0, net: 0, count: 0 };
    var rows = [];
    (tx || []).forEach(function (t) {
      if (!isSeparateTx(t)) return;
      rows.push(t);
      if (t.type === '입금') summary.refund += n(t.amount);
      else summary.spend += n(t.amount);
      summary.count += 1;
    });
    summary.net = summary.spend - summary.refund;
    return { summary: summary, rows: rows };
  }

  function budgetView() {
    var d = state.data || {};
    var b = d.budget || {};
    var total = b.total || {};
    var period = b.period || d.period || {};
    var spent = n(total.spent), budget = n(total.budget);
    var rate = budget > 0 ? (spent / budget) * 100 : 0;
    var remaining = budget > 0 ? budget - spent : 0;
    var daysLeft = n(period.daysLeft);

    // 예산 시트가 비어 있으면 시트1 최근 내역으로 이번 달 지출을 추정합니다.
    if (!budget && !spent) {
      var ym = period.month || (todayISO().slice(0, 7));
      var sum = 0;
      (d.transactions || []).forEach(function (t) {
        if (String(t.date || '').slice(0, 7) === ym && t.type !== '입금' && !isWeddingTx(t) && !isSeparateTx(t)) sum += n(t.amount);
      });
      spent = sum;
    }
    var daily = daysLeft > 0 ? Math.floor(remaining / daysLeft) : n(total.daily);

    return {
      month: period.month || todayISO().slice(0, 7),
      daysLeft: daysLeft,
      spent: spent,
      budget: budget,
      remaining: remaining,
      rate: rate,
      daily: daily,
      rows: (b.rows || []).filter(function (r) {
        return n(r.budget) > 0 || n(r.spent) > 0;
      })
    };
  }

  function monthlyView() {
    var d = state.data || {};
    return (d.monthly || []).slice().sort(function (a, b) {
      return String(a.month).localeCompare(String(b.month));
    });
  }

  function currentMonthRow() {
    var bv = budgetView();
    var rows = monthlyView();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].month).slice(0, 7) === bv.month) return rows[i];
    }
    return null;
  }

  function separateView() {
    var s = state.data && state.data.separate;
    if (s && s.rows) {
      return {
        summary: s.summary || { spend: 0, refund: 0, net: 0, count: 0 },
        rows: s.rows || [],
        source: 'sheet'
      };
    }
    var derived = deriveSeparate((state.data && state.data.transactions) || []);
    derived.source = 'app';
    return derived;
  }

  function weddingView() {
    var w = (state.data && state.data.wedding) || {};
    return { summary: w.summary || { spend: 0, refund: 0, net: 0, count: 0 }, rows: w.rows || [] };
  }

  /* ── 잠금 화면 ────────────────────────────────────────────────────────── */
  function showLock(message) {
    $('main').hidden = true;
    $('lock').hidden = false;
    $('inUrl').value = state.url || lsGet(LS.url) || '';
    $('inPin').value = '';
    setLockError(message || '');
    setTimeout(function () {
      var target = $('inUrl').value ? $('inPin') : $('inUrl');
      try { target.focus(); } catch (e) {}
    }, 120);
  }

  function setLockError(msg) {
    var box = $('lockError');
    if (!msg) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = msg;
  }

  function setConnecting(on) {
    var btn = $('btnConnect');
    btn.disabled = on;
    btn.querySelector('.btn__label').textContent = on ? '연결하는 중…' : '연결하기';
  }

  async function connect(url, pin) {
    setLockError('');
    var cleanUrl = normalizeUrl(url);
    if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) {
      setLockError('웹 앱 URL을 확인해 주세요. https://script.google.com/macros/s/…/exec 형식입니다.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setLockError('PIN은 숫자 4자리입니다. (Code.gs 의 APP_PIN 과 같은 값)');
      return;
    }
    setConnecting(true);
    var prev = { url: state.url, pin: state.pin };
    state.url = cleanUrl;
    state.pin = pin;
    try {
      var data = await apiGet();
      state.data = data;
      state.syncedAt = Date.now();
      state.offline = false;
      lsSet(LS.url, cleanUrl);
      lsSet(LS.pin, pin);
      saveCache(data);
      setConnecting(false);
      enterApp();
      toast('연결했어요');
    } catch (err) {
      state.url = prev.url;
      state.pin = prev.pin;
      setConnecting(false);
      setLockError(connectErrorMessage(err));
    }
  }

  function connectErrorMessage(err) {
    var code = err && err.code;
    if (code === 'PIN_MISMATCH') return 'PIN이 맞지 않습니다. Code.gs 의 APP_PIN 값과 같은 4자리를 입력해 주세요.';
    if (code === 'BAD_RESPONSE') return err.message;
    if (code === 'NETWORK') {
      return '연결하지 못했습니다. ① 배포 → 액세스 권한이 "모든 사람"인지 ② URL이 .../exec 로 끝나는지 ③ 인터넷 연결을 확인해 주세요.';
    }
    if (code === 'READ_FAILED') {
      return '시트를 읽지 못했습니다: ' + err.message +
        ' — 스크립트가 시트에 붙어 있지 않은 경우 Code.gs 위쪽 SPREADSHEET_ID 에 시트 ID를 넣어 주세요.';
    }
    return (err && err.message) || '연결에 실패했습니다.';
  }

  /* ── 앱 진입 ──────────────────────────────────────────────────────────── */
  function enterApp() {
    $('lock').hidden = true;
    $('main').hidden = false;
    var saved = lsGet(LS.tab);
    state.tab = (saved === 'home' || saved === 'list' || saved === 'add' || saved === 'plan') ? saved : 'home';
    if (!state.form) resetForm(true);
    render();
    window.scrollTo(0, 0);
  }

  /* ── 새로고침 ─────────────────────────────────────────────────────────── */
  async function refresh(opts) {
    opts = opts || {};
    if (state.loading) return false;
    state.loading = true;
    var btn = $('btnRefresh');
    if (btn) btn.disabled = true; // 잠금 상태에서는 버튼이 없습니다
    try {
      var data = await apiGet();
      state.data = data;
      state.syncedAt = Date.now();
      state.offline = false;
      saveCache(data);
      clearBanner();
      render();
      return true;
    } catch (err) {
      if (err && err.code === 'PIN_MISMATCH') {
        showLock('PIN이 바뀐 것 같습니다. 다시 연결해 주세요.');
        return false;
      }
      state.offline = true;
      setBanner((err && err.message) || '데이터를 불러오지 못했습니다.', true);
      if (!opts.silent) render();
      return false;
    } finally {
      state.loading = false;
      if (btn) btn.disabled = false;
    }
  }

  function setBanner(msg, retryable) {
    var box = $('banner');
    box.hidden = false;
    box.innerHTML = '<span>' + esc(msg) + '</span>' +
      (retryable ? '<button type="button" id="bannerRetry">다시 시도</button>' : '');
    var r = $('bannerRetry');
    if (r) r.addEventListener('click', function () { clearBanner(); refresh(); });
  }
  function clearBanner() { $('banner').hidden = true; $('banner').innerHTML = ''; }

  /* ── 렌더 ─────────────────────────────────────────────────────────────── */
  function render() {
    if (!state.data) {
      renderSkeleton();
      return;
    }
    var titles = {
      home: ['홈', '이번 달 흐름'],
      list: ['내역', ''],
      add: ['입력', '새 거래 기록'],
      plan: ['결혼/월별', '']
    };
    var t = titles[state.tab] || titles.home;
    $('topTitle').textContent = t[0];
    $('topSub').textContent = subTitle();

    qsa('.tab').forEach(function (el) {
      el.classList.toggle('is-on', el.getAttribute('data-tab') === state.tab);
    });

    var view = $('view');
    if (state.tab === 'home') view.innerHTML = homeHTML();
    else if (state.tab === 'list') view.innerHTML = listHTML();
    else if (state.tab === 'add') view.innerHTML = addHTML();
    else view.innerHTML = planHTML();

    bindView();
  }

  function subTitle() {
    var bv = budgetView();
    if (state.tab === 'home') return monthLabel(bv.month);
    if (state.tab === 'list') {
      var c = filteredTx().length;
      return c + '건';
    }
    if (state.tab === 'add') return '시트1에 바로 추가됩니다';
    if (state.tab === 'plan') return '결혼준비 · 별도지출 · 월별';
    return '';
  }

  function renderSkeleton() {
    $('view').innerHTML =
      '<div class="card"><div class="skel" style="width:38%;height:12px"></div>' +
      '<div class="skel" style="width:64%;height:26px;margin-top:14px"></div>' +
      '<div class="skel" style="width:100%;height:9px;margin-top:18px"></div>' +
      '<div class="skel" style="width:80%;height:12px;margin-top:16px"></div></div>' +
      '<div class="card"><div class="skel" style="width:30%;height:12px"></div>' +
      '<div class="skel" style="width:100%;height:12px;margin-top:16px"></div>' +
      '<div class="skel" style="width:100%;height:12px"></div>' +
      '<div class="skel" style="width:70%;height:12px"></div></div>';
  }

  function syncLine() {
    if (!state.syncedAt) return '';
    var d = new Date(state.syncedAt);
    return (state.offline ? '오프라인 · ' : '') + '마지막 동기화 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ── 홈 ───────────────────────────────────────────────────────────────── */
  function homeHTML() {
    var bv = budgetView();
    var cur = currentMonthRow();
    var w = weddingView();
    var recent = (state.data.transactions || []).slice(0, 5);
    var fill = Math.max(0, Math.min(100, bv.rate));
    var gaugeClass = bv.rate >= 100 ? ' is-over' : (bv.rate >= 80 ? ' is-warn' : '');

    var html = '';

    html += '<section class="hero">';
    html += '<p class="hero__label">' + esc(monthLabel(bv.month)) + ' 총 지출</p>';
    html += '<p class="hero__amount num">' + money(bv.spent) + '</p>';
    html += '<p class="hero__budget">예산 <b class="num">' + money(bv.budget) + '</b> 중 <b class="num">' + pct(bv.rate) + '</b> 사용</p>';
    html += '<div class="gauge">';
    html += '<div class="gauge__track"><div class="gauge__fill' + gaugeClass + '" id="gaugeFill" style="width:0%"></div></div>';
    html += '<div class="gauge__meta"><span class="num">' +
      (bv.remaining >= 0 ? money(bv.remaining) + ' 남음' : money(Math.abs(bv.remaining)) + ' 초과') +
      '</span><span>' + (bv.daysLeft > 0 ? '남은 ' + bv.daysLeft + '일' : '') + '</span></div>';
    html += '</div>';
    html += '<dl class="hero__chips">';
    html += '<div class="hero__chip"><dt>하루 가용액</dt><dd class="num">' +
      (bv.remaining > 0 && bv.daysLeft > 0 ? money(bv.daily) : '—') + '</dd></div>';
    html += '<div class="hero__chip"><dt>이번 달 수입</dt><dd class="num">' +
      (cur ? money(cur.income) : '—') + '</dd></div>';
    html += '</dl>';
    html += '</section>';

    // 카테고리별 예산
    html += '<div class="card"><div class="card__head"><h2 class="card__title">카테고리별 예산</h2>' +
      '<span class="card__more">' + (bv.rows.length ? bv.rows.length + '개' : '') + '</span></div>';
    if (!bv.rows.length) {
      html += emptyHTML('📋', '예산 정보가 없어요', '시트의 예산 탭 B열에 월 예산을 입력하면 여기에 표시됩니다.');
    } else {
      html += '<div class="bud">';
      bv.rows.forEach(function (r) {
        html += budgetRowHTML(r);
      });
      html += '</div>';
    }
    html += '</div>';

    // 최근 거래
    html += '<div class="card"><div class="card__head"><h2 class="card__title">최근 거래</h2>' +
      '<button class="card__more" type="button" data-go="list">전체보기 ›</button></div>';
    if (!recent.length) {
      html += emptyHTML('🧾', '아직 기록이 없어요', '+ 입력 탭에서 첫 거래를 추가해 보세요.');
    } else {
      recent.forEach(function (t) { html += txRowHTML(t); });
    }
    html += '</div>';

    // 생활비 집계에서 빼는 지출 (결혼준비 · 별도지출)
    var sv = separateView();
    html += '<div class="card"><div class="card__head"><h2 class="card__title">생활비에서 빼는 지출</h2>' +
      '<span class="card__more">예산 집계 제외</span></div>';
    html += exclRowHTML('💍', '결혼준비', w.summary, 'wedding');
    html += exclRowHTML('🧾', '별도지출', sv.summary, 'separate');
    html += '</div>';

    html += '<p class="sync">' + esc(syncLine()) + '</p>';
    return html;
  }

  function exclRowHTML(icon, label, s, seg) {
    return '<button class="excl excl--' + seg + '" type="button" data-go="plan" data-planseg="' + seg + '">' +
      '<span class="excl__icon">' + icon + '</span>' +
      '<span class="excl__body"><span class="excl__t">' + esc(label) + '</span>' +
      '<span class="excl__d num">' + money(s.spend) + ' · ' + n(s.count) + '건</span></span>' +
      '<span class="excl__more">›</span></button>';
  }

  function budgetRowHTML(r) {
    var rate = n(r.rate);
    var cls = rate >= 100 ? 'over' : (rate >= 80 ? 'warn' : '');
    var statusCls = cls === 'over' ? 'over' : (cls === 'warn' ? 'warn' : 'ok');
    var width = Math.max(0, Math.min(100, rate));
    return '<div class="bud__row bud__row--' + (cls || 'ok') + '">' +
      '<div class="bud__top">' +
      '<span class="bud__name">' + esc(r.category) + ' <span class="bud__status bud__status--' + statusCls + '">' +
      esc(r.status || '여유') + '</span></span>' +
      '<span class="bud__amounts num"><b>' + money(r.spent) + '</b> / ' + money(r.budget) + '</span>' +
      '</div>' +
      '<div class="bud__bar"><i style="width:' + width + '%"></i></div>' +
      '</div>';
  }

  function txRowHTML(t) {
    var isIn = t.type === '입금';
    var w = isWeddingTx(t);
    var sep = isSeparateTx(t);
    var row = Number(t.row);
    var tappable = isFinite(row) && row >= 2 && !sep; // 별도지출은 앱 수정 시 #제외 태그가 지워져 시트에서 직접 고칩니다
    var meta = [];
    if (t.category) meta.push(esc(t.category));
    if (t.method) meta.push(esc(t.method));
    if (t.time) meta.push(esc(t.time));
    var note = stripWeddingNote(t.note);
    if (sep) {
      // 별도지출은 '#자동차보험' 같은 분류 태그만 보여 줍니다.
      var tags = noteTags(t);
      note = tags.length ? tags.map(function (g) { return '#' + g; }).join(' ') : '';
    }
    if (note) meta.push(esc(note.length > 14 ? note.slice(0, 14) + '…' : note));

    var tagHTML = w ? '<span class="tx__tag">결혼</span>'
      : (sep ? '<span class="tx__tag tx__tag--sep">별도</span>' : '');

    var inner =
      '<div class="tx__icon">' + (w ? '💍' : (sep ? '🧾' : (CAT_ICON[t.category] || '🧾'))) + '</div>' +
      '<div class="tx__body">' +
      '<div class="tx__name">' + tagHTML + esc(t.merchant || '이름 없음') + '</div>' +
      '<div class="tx__meta">' + meta.join(' · ') + '</div>' +
      '</div>' +
      '<div class="tx__amt num' + (isIn ? ' tx__amt--in' : '') + '">' +
      (isIn ? '+' : '−') + numFmt.format(Math.round(n(t.amount))) +
      '</div>';

    if (!tappable) return '<div class="tx">' + inner + '</div>';
    return '<button class="tx tx--tap" type="button" data-txrow="' + row + '" ' +
      'aria-label="' + esc((t.merchant || '내역') + ' ' + numFmt.format(Math.round(n(t.amount))) + '원 수정 또는 삭제') + '">' +
      inner + '</button>';
  }

  function emptyHTML(icon, title, desc) {
    return '<div class="empty"><div class="empty__icon">' + icon + '</div>' +
      '<div class="empty__t">' + esc(title) + '</div>' +
      (desc ? '<div class="empty__d">' + esc(desc) + '</div>' : '') + '</div>';
  }

  /* ── 내역 ─────────────────────────────────────────────────────────────── */
  function filteredTx() {
    var tx = (state.data && state.data.transactions) || [];
    return tx.filter(function (t) { return txMatches(t, state.filter); });
  }

  // 필터 판정 (순수 함수 — 단위 테스트 대상)
  function txMatches(t, f) {
    f = f || {};
    var isW = isWeddingTx(t);
    var isSep = isSeparateTx(t);
    // '생활비만' = #제외 가 붙지 않은 모든 거래 (결혼준비 + 별도지출 모두 빠짐)
    if (f.wedding === 'exclude' && (isW || isSep)) return false;
    if (f.wedding === 'only' && !isW) return false;
    if (f.wedding === 'sep' && !isSep) return false;
    if (f.cat && t.category !== f.cat) return false;
    var q = String(f.q || '').trim().toLowerCase();
    if (q) {
      var hay = [t.merchant, t.category, t.method, t.note].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function listHTML() {
    var tx = filteredTx();
    var out = 0, inc = 0;
    tx.forEach(function (t) { if (t.type === '입금') inc += n(t.amount); else out += n(t.amount); });

    var html = '';
    html += '<div class="search">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>' +
      '<input id="searchInput" type="search" inputmode="search" placeholder="사용처 · 카테고리 · 메모 검색" value="' + esc(state.filter.q) + '">' +
      (state.filter.q ? '<button class="search__clear" type="button" data-clear-q>✕</button>' : '') +
      '</div>';

    html += '<div class="chips chips--scroll" style="margin-bottom:8px">';
    [['exclude', '생활비만'], ['all', '전체'], ['only', '💍 결혼만'], ['sep', '🧾 별도만']].forEach(function (o) {
      html += '<button class="chip' + (state.filter.wedding === o[0] ? ' is-on' : '') +
        '" type="button" data-wed="' + o[0] + '">' + o[1] + '</button>';
    });
    html += '</div>';

    html += '<div class="chips chips--scroll" style="margin-bottom:12px">';
    html += '<button class="chip chip--sm' + (!state.filter.cat ? ' is-on' : '') + '" type="button" data-cat="">전체</button>';
    CATEGORIES.forEach(function (c) {
      html += '<button class="chip chip--sm' + (state.filter.cat === c ? ' is-on' : '') +
        '" type="button" data-cat="' + esc(c) + '">' + (CAT_ICON[c] || '') + ' ' + esc(c) + '</button>';
    });
    html += '</div>';

    html += '<div class="card" style="padding:14px 16px 6px">';
    html += '<div class="card__head" style="margin-bottom:2px">' +
      '<span class="card__more">' + tx.length + '건</span>' +
      '<span class="card__more num">지출 ' + money(out) + (inc ? ' · 수입 ' + money(inc) : '') + '</span></div>';

    if (!tx.length) {
      html += emptyHTML('🔍', '조건에 맞는 내역이 없어요', '검색어나 필터를 바꿔 보세요.');
    } else {
      var lastDate = null;
      var groups = [];
      tx.forEach(function (t) {
        var d = String(t.date || '').slice(0, 10);
        if (!groups.length || groups[groups.length - 1].date !== d) groups.push({ date: d, items: [] });
        groups[groups.length - 1].items.push(t);
      });
      groups.forEach(function (g) {
        var s = 0, inc = 0;
        g.items.forEach(function (t) {
          if (t.type === '입금') inc += n(t.amount);
          else s += n(t.amount);
        });
        var sumLabel = s > 0 ? money(s) : (inc > 0 ? '+' + numFmt.format(inc) : '');
        html += '<div class="daygroup"><div class="daygroup__head"><span>' + esc(dayLabel(g.date)) + '</span>' +
          '<span class="daygroup__sum num">' + sumLabel + '</span></div>';
        g.items.forEach(function (t) { html += txRowHTML(t); });
        html += '</div>';
      });
    }
    html += '</div>';
    html += '<p class="sync">' + esc(syncLine()) + ' · 최근 ' + ((state.data.transactions || []).length) + '건 기준</p>';
    return html;
  }

  /* ── 입력 ─────────────────────────────────────────────────────────────── */
  function resetForm(keepDate) {
    state.form = {
      date: keepDate && state.form ? state.form.date : todayISO(),
      time: nowHM(),
      type: (state.form && state.form.type) || '출금',
      merchant: '',
      amountRaw: '',
      method: (state.form && state.form.method) || '국민계좌',
      methodCustom: '',
      category: (state.form && state.form.category) || '',
      note: '',
      isWedding: false
    };
  }

  function addHTML() {
    var f = state.form;
    var cats = f.type === '입금' ? INCOME_CATS.concat(EXPENSE_CATS) : EXPENSE_CATS;
    var html = '';

    html += '<div class="form">';

    if (state.saved) {
      html += '<div class="saved"><div class="saved__icon">✓</div><div>' +
        '<div class="saved__t">시트1에 저장했어요</div>' +
        '<div class="saved__d">' + esc(state.saved.text) + '</div></div></div>';
    }

    html += '<div id="formError" class="formerr" hidden></div>';

    html += '<div class="amount-box">' +
      '<label class="amount-box__label" for="inAmount">금액</label>' +
      '<input id="inAmount" class="amount-input" type="text" inputmode="numeric" autocomplete="off" ' +
      'placeholder="0" value="' + esc(commaDigits(f.amountRaw)) + '">' +
      '<div class="amount-quick">' +
      '<button type="button" data-add="10000">+1만</button>' +
      '<button type="button" data-add="50000">+5만</button>' +
      '<button type="button" data-add="100000">+10만</button>' +
      '<button type="button" data-clr-amount>지우기</button>' +
      '</div></div>';

    html += '<div class="card">';

    html += '<div class="segmented" id="segType">' +
      '<button type="button" data-type="출금" class="' + (f.type === '출금' ? 'is-on' : '') + '">출금</button>' +
      '<button type="button" data-type="입금" class="' + (f.type === '입금' ? 'is-on' : '') + '">입금</button>' +
      '</div>';

    html += '<label class="field"><span class="field__label">사용처</span>' +
      '<input id="inMerchant" class="input" type="text" placeholder="예) 스타벅스 전주점" ' +
      'autocomplete="off" value="' + esc(f.merchant) + '"></label>';

    html += '<div class="row2">' +
      '<label class="field"><span class="field__label">날짜</span>' +
      '<input id="inDate" class="input" type="date" value="' + esc(f.date) + '"></label>' +
      '<label class="field"><span class="field__label">시각</span>' +
      '<input id="inTime" class="input" type="time" value="' + esc(f.time) + '"></label>' +
      '</div>';

    html += '<div class="field" style="margin-bottom:6px"><span class="field__label">카테고리</span>' +
      '<div class="chips" id="catChips">';
    cats.forEach(function (c) {
      html += '<button class="chip' + (f.category === c ? ' is-on' : '') + '" type="button" data-cat-sel="' +
        esc(c) + '">' + (CAT_ICON[c] || '') + ' ' + esc(c) + '</button>';
    });
    html += '</div></div>';

    html += '<div class="field" style="margin:16px 0 0"><span class="field__label">결제수단</span>' +
      '<div class="chips" id="methodChips">';
    METHODS.forEach(function (m) {
      html += '<button class="chip' + (f.method === m ? ' is-on' : '') + '" type="button" data-method="' +
        esc(m) + '">' + esc(m) + '</button>';
    });
    html += '<button class="chip' + (f.method === '__custom' ? ' is-on' : '') +
      '" type="button" data-method="__custom">직접입력</button>';
    html += '</div>';
    html += '<input id="inMethodCustom" class="input" type="text" placeholder="결제수단 이름" autocomplete="off" ' +
      'style="margin-top:9px;' + (f.method === '__custom' ? '' : 'display:none') + '" value="' + esc(f.methodCustom) + '">';
    html += '</div>';

    html += '</div>'; // card

    html += '<div class="switchrow" id="weddingRow">' +
      '<div><div class="switchrow__t">💍 결혼준비 지출</div>' +
      '<div class="switchrow__d">생활비 집계에서 빼고 결혼준비로 따로 모읍니다</div></div>' +
      '<button class="switch' + (f.isWedding ? ' is-on' : '') + '" id="swWedding" type="button" role="switch" ' +
      'aria-checked="' + (f.isWedding ? 'true' : 'false') + '" aria-label="결혼준비 지출로 기록"></button>' +
      '</div>';

    if (f.isWedding) {
      html += '<div class="note-preview">비고에 <code>' + WEDDING_TAG + '</code> 가 자동으로 붙습니다.</div>';
    }

    html += '<div class="card" style="padding:16px 18px">' +
      '<label class="field" style="margin:0"><span class="field__label">비고 (선택)</span>' +
      '<input id="inNote" class="input" type="text" placeholder="메모" autocomplete="off" value="' + esc(f.note) + '"></label>' +
      '</div>';

    html += '<button class="btn btn--primary btn--block" id="btnSave" type="button" style="margin-top:4px">' +
      '<span class="btn__label">시트에 저장</span></button>';
    html += '<p class="sync">저장하면 구글 시트 <b>시트1</b> 마지막 행에 추가됩니다.</p>';
    html += '</div>';

    return html;
  }

  function showFormError(msg) {
    var box = $('formError');
    if (!box) { toast(msg); return; }
    box.hidden = false;
    box.textContent = msg;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function clearFormError() {
    var box = $('formError');
    if (box) { box.hidden = true; box.textContent = ''; }
  }

  async function saveTransaction() {
    var f = state.form;
    clearFormError();
    state.saved = null;

    var amount = Number(digits(f.amountRaw) || 0);
    var method = f.method === '__custom' ? f.methodCustom.trim() : f.method;

    if (!f.merchant.trim()) return showFormError('사용처를 입력해 주세요.');
    if (!(amount > 0)) return showFormError('금액을 입력해 주세요.');
    if (!f.category) return showFormError('카테고리를 선택해 주세요.');
    if (!method) return showFormError('결제수단을 입력해 주세요.');

    var payload = {
      action: 'append',
      date: f.date,
      time: f.time || nowHM(),
      merchant: f.merchant.trim(),
      type: f.type,
      amount: amount,
      method: method,
      category: f.category,
      note: f.note.trim(),
      isWedding: !!f.isWedding
    };

    var btn = $('btnSave');
    if (btn) { btn.disabled = true; btn.querySelector('.btn__label').textContent = '저장하는 중…'; }

    var res = null, err = null;
    try {
      res = await apiPost(payload);
    } catch (e) {
      err = e;
    }

    // 저장 여부는 결과와 무관하게 "재조회"로 확인합니다.
    var verified = await verifyLanded(payload);

    if (btn) { btn.disabled = false; btn.querySelector('.btn__label').textContent = '시트에 저장'; }

    if (!verified) {
      if (err && err.code === 'PIN_MISMATCH') {
        showLock('PIN이 바뀐 것 같습니다. 다시 연결해 주세요.');
        return;
      }
      showFormError((err && err.message ? err.message : '저장하지 못했습니다.') + ' 다시 시도해 주세요.');
      return;
    }

    var rowInfo = res && res.row ? res.row + '행 · ' : '';
    state.saved = {
      text: rowInfo + dayLabel(payload.date) + ' ' + payload.time + ' · ' +
        payload.merchant + ' ' + money(payload.amount) + (payload.isWedding ? ' · 결혼준비' : '')
    };

    var keepDate = f.date, keepType = f.type, keepMethod = f.method, keepCategory = f.category;
    resetForm(false);
    state.form.date = keepDate;
    state.form.type = keepType;
    state.form.method = keepMethod;
    state.form.category = keepCategory;

    render();
    toast('저장했어요');
  }

  async function verifyLanded(payload) {
    try {
      var data = await apiGet();
      state.data = data;
      state.syncedAt = Date.now();
      state.offline = false;
      saveCache(data);
      var tx = data.transactions || [];
      for (var i = 0; i < Math.min(tx.length, 5); i++) {
        var t = tx[i];
        if (String(t.date).slice(0, 10) === payload.date &&
            n(t.amount) === n(payload.amount) &&
            String(t.merchant) === payload.merchant) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /* ── 결혼/월별 ────────────────────────────────────────────────────────── */
  function planHTML() {
    var w = weddingView();
    var sv = separateView();
    var months = monthlyView();
    var seg = state.planSeg === 'separate' ? 'separate' : 'wedding';
    var cur = seg === 'separate' ? sv : w;
    var s = cur.summary;
    var html = '';

    html += '<div class="segmented" id="planSeg">' +
      '<button type="button" data-planseg="wedding"' + (seg === 'wedding' ? ' class="is-on"' : '') + '>💍 결혼준비</button>' +
      '<button type="button" data-planseg="separate"' + (seg === 'separate' ? ' class="is-on"' : '') + '>🧾 별도지출</button>' +
      '</div>';

    html += '<section class="wed' + (seg === 'separate' ? ' wed--sep' : '') + '">' +
      '<p class="wed__label">' + (seg === 'separate' ? '별도지출 누적 지출' : '결혼준비 누적 지출') + '</p>' +
      '<p class="wed__amount num">' + money(s.spend) + '</p>' +
      '<dl class="wed__grid">' +
      '<div><dt>입금/환급</dt><dd class="num">' + money(s.refund) + '</dd></div>' +
      '<div><dt>순 지출</dt><dd class="num">' + money(s.net) + '</dd></div>' +
      '<div><dt>건수</dt><dd class="num">' + n(s.count) + '건</dd></div>' +
      '</dl></section>';

    html += '<div class="card"><div class="card__head"><h2 class="card__title">' +
      (seg === 'separate' ? '별도지출 내역' : '결혼준비 내역') + '</h2>' +
      '<span class="card__more">' + cur.rows.length + '건</span></div>';
    if (!cur.rows.length) {
      html += seg === 'separate'
        ? emptyHTML('🧾', '별도지출 기록이 없어요', '시트1 비고에 #제외 를 달고 #결혼준비 는 달지 않은 지출이 여기에 모입니다.')
        : emptyHTML('💍', '결혼준비 기록이 없어요', '입력 탭에서 💍 토글을 켜고 저장하면 여기에 쌓입니다.');
    } else {
      cur.rows.forEach(function (t) { html += txRowHTML(t); });
    }
    html += '</div>';

    if (seg === 'separate') {
      html += '<p class="sync">시트 `별도지출` 탭과 같은 기준(비고에 #제외, #결혼준비 아님) · ' +
        '앱이 받은 최근 ' + ((state.data && state.data.transactions || []).length) + '건에서 집계<br>' +
        '내역 수정은 시트1에서 해 주세요 — 앱에서 고치면 #제외 태그가 지워져 생활비로 잡힙니다.</p>';
    }

    // 월별 요약
    var max = 1;
    months.forEach(function (m) {
      max = Math.max(max, n(m.income), n(m.expense));
    });

    html += '<div class="card"><div class="card__head"><h2 class="card__title">월별 흐름</h2>' +
      '<span class="card__more">' + months.length + '개월</span></div>';
    if (!months.length) {
      html += emptyHTML('📈', '월별 요약이 없어요', '시트의 월별요약 탭이 채워지면 자동으로 표시됩니다.');
    } else {
      months.slice().reverse().forEach(function (m) {
        var inW = Math.max(2, Math.round(n(m.income) / max * 100));
        var outW = Math.max(2, Math.round(n(m.expense) / max * 100));
        var netCls = n(m.net) >= 0 ? 'mrow__net--plus' : 'mrow__net--minus';
        html += '<div class="mrow">' +
          '<div class="mrow__top"><span class="mrow__month">' + esc(monthLabel(m.month)) + '</span>' +
          '<span class="mrow__net num ' + netCls + '">' +
          (n(m.net) >= 0 ? '+' : '−') + numFmt.format(Math.abs(Math.round(n(m.net)))) + '</span></div>' +
          '<div class="mrow__lines">' +
          '<div class="mrow__line"><span class="mrow__lbl">수입</span>' +
          '<span class="mrow__track"><i class="in" style="width:' + inW + '%"></i></span>' +
          '<span class="mrow__val num">' + money(m.income) + '</span></div>' +
          '<div class="mrow__line"><span class="mrow__lbl">지출</span>' +
          '<span class="mrow__track"><i class="out" style="width:' + outW + '%"></i></span>' +
          '<span class="mrow__val num">' + money(m.expense) + '</span></div>' +
          '</div>' +
          '<div class="mrow__meta">' +
          (m.rate != null ? '<span class="num">저축률 ' + pct(m.rate) + '</span>' : '') +
          (m.count != null ? '<span class="num">' + n(m.count) + '건</span>' : '') +
          '</div></div>';
      });
    }
    html += '</div>';
    html += '<p class="sync">' + esc(syncLine()) + '</p>';
    return html;
  }

  /* ── 이벤트 바인딩 ────────────────────────────────────────────────────── */
  function bindView() {
    qsa('[data-planseg]').forEach(function (el) {
      if (el.hasAttribute('data-go')) return; // 홈 카드 버튼은 아래 data-go 핸들러가 같이 처리합니다
      el.addEventListener('click', function () {
        state.planSeg = el.getAttribute('data-planseg') === 'separate' ? 'separate' : 'wedding';
        render();
      });
    });

    qsa('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () {
        var seg = el.getAttribute('data-planseg');
        if (seg) state.planSeg = seg === 'separate' ? 'separate' : 'wedding';
        switchTab(el.getAttribute('data-go'));
      });
    });

    if (state.tab === 'list') bindList();
    if (state.tab === 'add') bindAdd();

    qsa('[data-txrow]').forEach(function (el) {
      el.addEventListener('click', function () {
        openEditSheet(Number(el.getAttribute('data-txrow')));
      });
    });

    var gauge = $('gaugeFill');
    if (gauge) {
      var target = Math.max(0, Math.min(100, budgetView().rate));
      requestAnimationFrame(function () { gauge.style.width = target + '%'; });
    }
  }

  function bindList() {
    var input = $('searchInput');
    if (input) {
      input.addEventListener('input', function () {
        state.filter.q = input.value;
        var pos = input.selectionStart;
        render();
        var again = $('searchInput');
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }
    var clear = document.querySelector('[data-clear-q]');
    if (clear) clear.addEventListener('click', function () { state.filter.q = ''; render(); });

    qsa('[data-wed]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.filter.wedding = el.getAttribute('data-wed');
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    qsa('[data-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.filter.cat = el.getAttribute('data-cat');
        render();
      });
    });
  }

  function bindAdd() {
    var f = state.form;

    var amount = $('inAmount');
    if (amount) {
      amount.addEventListener('input', function () {
        var d = digits(amount.value).replace(/^0+(?=\d)/, '');
        f.amountRaw = d;
        amount.value = commaDigits(d);
        clearFormError();
      });
      amount.addEventListener('focus', function () {
        setTimeout(function () { amount.setSelectionRange(amount.value.length, amount.value.length); }, 0);
      });
    }
    qsa('[data-add]').forEach(function (el) {
      el.addEventListener('click', function () {
        var cur = Number(digits(f.amountRaw) || 0);
        var next = String(cur + Number(el.getAttribute('data-add')));
        f.amountRaw = next;
        if (amount) amount.value = commaDigits(next);
        clearFormError();
      });
    });
    var clr = document.querySelector('[data-clr-amount]');
    if (clr) clr.addEventListener('click', function () {
      f.amountRaw = '';
      if (amount) amount.value = '';
      clearFormError();
    });

    var seg = $('segType');
    if (seg) {
      qsa('[data-type]', seg).forEach(function (el) {
        el.addEventListener('click', function () {
          f.type = el.getAttribute('data-type');
          if (f.type === '입금' && EXPENSE_CATS.indexOf(f.category) >= 0) f.category = '기타수입';
          render();
        });
      });
    }

    var merchant = $('inMerchant');
    if (merchant) merchant.addEventListener('input', function () { f.merchant = merchant.value; clearFormError(); });
    var date = $('inDate');
    if (date) date.addEventListener('change', function () { f.date = date.value || todayISO(); });
    var time = $('inTime');
    if (time) time.addEventListener('change', function () { f.time = time.value || nowHM(); });
    var note = $('inNote');
    if (note) note.addEventListener('input', function () { f.note = note.value; });

    qsa('[data-cat-sel]').forEach(function (el) {
      el.addEventListener('click', function () {
        f.category = el.getAttribute('data-cat-sel');
        qsa('[data-cat-sel]').forEach(function (b) { b.classList.toggle('is-on', b === el); });
        clearFormError();
      });
    });

    qsa('[data-method]').forEach(function (el) {
      el.addEventListener('click', function () {
        f.method = el.getAttribute('data-method');
        qsa('[data-method]').forEach(function (b) { b.classList.toggle('is-on', b === el); });
        var custom = $('inMethodCustom');
        if (custom) {
          custom.style.display = f.method === '__custom' ? '' : 'none';
          if (f.method === '__custom') custom.focus();
        }
      });
    });
    var customIn = $('inMethodCustom');
    if (customIn) customIn.addEventListener('input', function () { f.methodCustom = customIn.value; clearFormError(); });

    var sw = $('swWedding');
    if (sw) {
      sw.addEventListener('click', function () {
        f.isWedding = !f.isWedding;
        if (f.isWedding && !f.category) f.category = '기타지출';
        render();
      });
    }

    var save = $('btnSave');
    if (save) save.addEventListener('click', saveTransaction);
  }

  /* ── 내역 수정 · 삭제 ─────────────────────────────────────────────────── */
  var edit = null; // 수정 중인 내역 상태

  function stripWeddingNote(note) {
    return String(note == null ? '' : note)
      .replace(/#결혼준비/g, ' ')
      .replace(/#제외/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[·,\-:;|]+ ?/, '')
      .trim();
  }

  function txByRow(row) {
    var tx = (state.data && state.data.transactions) || [];
    for (var i = 0; i < tx.length; i++) {
      if (Number(tx[i].row) === Number(row)) return tx[i];
    }
    return null;
  }

  function openEditSheet(row) {
    var t = txByRow(row);
    if (!t) {
      toast('그 내역을 찾지 못했어요. ↻ 새로고침 후 다시 시도해 주세요.');
      return;
    }
    var m = String(t.method || '');
    var known = METHODS.indexOf(m) >= 0;
    edit = {
      row: Number(t.row),
      date: String(t.date || '').slice(0, 10) || todayISO(),
      time: String(t.time || '') || nowHM(),
      type: t.type === '입금' ? '입금' : '출금',
      merchant: String(t.merchant || ''),
      amountRaw: String(Math.abs(Math.round(n(t.amount))) || ''),
      method: known ? m : (m ? '__custom' : METHODS[0]),
      methodCustom: known ? '' : m,
      category: String(t.category || ''),
      note: stripWeddingNote(t.note),
      isWedding: isWeddingTx(t),
      expectedMerchant: String(t.merchant || ''),
      expectedAmount: Math.abs(Math.round(n(t.amount))),
      busy: false
    };
    renderEditSheet();
  }

  function editSheetHTML() {
    var e = edit;
    var html = '';

    html += '<h2 class="sheet__title">내역 수정</h2>';
    html += '<p class="sheet__sub">시트1 <b>' + e.row + '행</b>을 고칩니다. 저장하면 구글 시트에 바로 반영됩니다.</p>';
    html += '<div id="editError" class="formerr" hidden></div>';

    html += '<div class="amount-box amount-box--sheet">' +
      '<label class="amount-box__label" for="edAmount">금액</label>' +
      '<input id="edAmount" class="amount-input" type="text" inputmode="numeric" autocomplete="off" ' +
      'placeholder="0" value="' + esc(commaDigits(e.amountRaw)) + '">' +
      '<div class="amount-quick">' +
      '<button type="button" data-ed-add="10000">+1만</button>' +
      '<button type="button" data-ed-add="50000">+5만</button>' +
      '<button type="button" data-ed-add="100000">+10만</button>' +
      '<button type="button" data-ed-clr>지우기</button>' +
      '</div></div>';

    html += '<div class="segmented" id="edSeg">' +
      '<button type="button" data-ed-type="출금" class="' + (e.type === '출금' ? 'is-on' : '') + '">출금</button>' +
      '<button type="button" data-ed-type="입금" class="' + (e.type === '입금' ? 'is-on' : '') + '">입금</button>' +
      '</div>';

    html += '<label class="field"><span class="field__label">사용처</span>' +
      '<input id="edMerchant" class="input" type="text" placeholder="예) 스타벅스 전주점" autocomplete="off" ' +
      'value="' + esc(e.merchant) + '"></label>';

    html += '<div class="row2">' +
      '<label class="field"><span class="field__label">날짜</span>' +
      '<input id="edDate" class="input" type="date" value="' + esc(e.date) + '"></label>' +
      '<label class="field"><span class="field__label">시각</span>' +
      '<input id="edTime" class="input" type="time" value="' + esc(e.time) + '"></label>' +
      '</div>';

    html += '<div class="field" style="margin-bottom:6px"><span class="field__label">카테고리</span>' +
      '<div class="chips" id="edCats">';
    CATEGORIES.forEach(function (c) {
      html += '<button class="chip' + (e.category === c ? ' is-on' : '') + '" type="button" data-ed-cat="' +
        esc(c) + '">' + (CAT_ICON[c] || '') + ' ' + esc(c) + '</button>';
    });
    html += '</div></div>';

    html += '<div class="field" style="margin:16px 0 0"><span class="field__label">결제수단</span>' +
      '<div class="chips" id="edMethods">';
    METHODS.forEach(function (m) {
      html += '<button class="chip' + (e.method === m ? ' is-on' : '') + '" type="button" data-ed-method="' +
        esc(m) + '">' + esc(m) + '</button>';
    });
    html += '<button class="chip' + (e.method === '__custom' ? ' is-on' : '') +
      '" type="button" data-ed-method="__custom">직접입력</button>';
    html += '</div>';
    html += '<input id="edMethodCustom" class="input" type="text" placeholder="결제수단 이름" autocomplete="off" ' +
      'style="margin-top:9px;' + (e.method === '__custom' ? '' : 'display:none') + '" value="' + esc(e.methodCustom) + '">';
    html += '</div>';

    html += '<div class="switchrow" style="margin-top:18px">' +
      '<div><div class="switchrow__t">💍 결혼준비 지출</div>' +
      '<div class="switchrow__d">생활비 집계에서 빼고 결혼준비로 따로 모읍니다</div></div>' +
      '<button class="switch' + (e.isWedding ? ' is-on' : '') + '" id="edWedding" type="button" role="switch" ' +
      'aria-checked="' + (e.isWedding ? 'true' : 'false') + '" aria-label="결혼준비 지출로 기록"></button>' +
      '</div>';

    html += '<div class="note-preview"' + (e.isWedding ? '' : ' hidden') + '>비고에 <code>' + WEDDING_TAG +
      '</code> 가 자동으로 붙습니다.</div>';

    html += '<label class="field" style="margin:16px 0 4px"><span class="field__label">비고 (선택)</span>' +
      '<input id="edNote" class="input" type="text" placeholder="메모" autocomplete="off" value="' + esc(e.note) + '"></label>';

    html += '<div class="sheet__foot">' +
      '<button class="btn btn--primary btn--block" id="edSave" type="button"><span class="btn__label">저장</span></button>' +
      '<button class="btn btn--danger btn--block" id="edDelete" type="button"><span class="btn__label">삭제</span></button>' +
      '</div>';
    html += '<p class="sheet__note">삭제는 되돌릴 수 없습니다. 시트1의 ' + e.row + '행이 지워지고 아래 행이 한 칸씩 올라옵니다.</p>';
    return html;
  }

  function renderEditSheet() {
    if (!edit) return;
    openSheet(editSheetHTML());
    bindEditSheet();
  }

  function showEditError(msg) {
    var box = $('editError');
    if (!box) { toast(msg); return; }
    box.hidden = false;
    box.textContent = msg;
    try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }
  function clearEditError() {
    var box = $('editError');
    if (box) { box.hidden = true; box.textContent = ''; }
  }

  function setEditBusy(on, label) {
    if (edit) edit.busy = !!on;
    var save = $('edSave');
    if (save) {
      save.disabled = !!on;
      var lbl = save.querySelector('.btn__label');
      if (lbl) lbl.textContent = on ? (label || '저장하는 중…') : '저장';
    }
    var del = $('edDelete');
    if (del) del.disabled = !!on;
  }

  function bindEditSheet() {
    var e = edit;
    if (!e) return;

    var amount = $('edAmount');
    if (amount) {
      amount.addEventListener('input', function () {
        var d = digits(amount.value).replace(/^0+(?=\d)/, '');
        e.amountRaw = d;
        amount.value = commaDigits(d);
        clearEditError();
      });
      amount.addEventListener('focus', function () {
        setTimeout(function () { try { amount.setSelectionRange(amount.value.length, amount.value.length); } catch (err) {} }, 0);
      });
    }
    qsa('[data-ed-add]').forEach(function (el) {
      el.addEventListener('click', function () {
        var cur = Number(digits(e.amountRaw) || 0);
        var next = String(cur + Number(el.getAttribute('data-ed-add')));
        e.amountRaw = next;
        if (amount) amount.value = commaDigits(next);
        clearEditError();
      });
    });
    var clr = document.querySelector('[data-ed-clr]');
    if (clr) clr.addEventListener('click', function () {
      e.amountRaw = '';
      if (amount) amount.value = '';
      clearEditError();
    });

    qsa('[data-ed-type]').forEach(function (el) {
      el.addEventListener('click', function () {
        e.type = el.getAttribute('data-ed-type') === '입금' ? '입금' : '출금';
        qsa('[data-ed-type]').forEach(function (b) { b.classList.toggle('is-on', b === el); });
        clearEditError();
      });
    });

    var merchant = $('edMerchant');
    if (merchant) merchant.addEventListener('input', function () { e.merchant = merchant.value; clearEditError(); });
    var date = $('edDate');
    if (date) date.addEventListener('change', function () { e.date = date.value || e.date; });
    var time = $('edTime');
    if (time) time.addEventListener('change', function () { e.time = time.value || e.time; });
    var note = $('edNote');
    if (note) note.addEventListener('input', function () { e.note = note.value; });

    qsa('[data-ed-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        e.category = el.getAttribute('data-ed-cat');
        qsa('[data-ed-cat]').forEach(function (b) { b.classList.toggle('is-on', b === el); });
        clearEditError();
      });
    });

    qsa('[data-ed-method]').forEach(function (el) {
      el.addEventListener('click', function () {
        e.method = el.getAttribute('data-ed-method');
        qsa('[data-ed-method]').forEach(function (b) { b.classList.toggle('is-on', b === el); });
        var custom = $('edMethodCustom');
        if (custom) {
          custom.style.display = e.method === '__custom' ? '' : 'none';
          if (e.method === '__custom') { try { custom.focus(); } catch (err) {} }
        }
      });
    });
    var customIn = $('edMethodCustom');
    if (customIn) customIn.addEventListener('input', function () { e.methodCustom = customIn.value; clearEditError(); });

    var sw = $('edWedding');
    if (sw) {
      sw.addEventListener('click', function () {
        e.isWedding = !e.isWedding;
        sw.classList.toggle('is-on', e.isWedding);
        sw.setAttribute('aria-checked', e.isWedding ? 'true' : 'false');
        var prev = $('sheetBody').querySelector('.note-preview');
        if (prev) prev.hidden = !e.isWedding;
      });
    }

    var save = $('edSave');
    if (save) save.addEventListener('click', saveEdit);
    var del = $('edDelete');
    if (del) del.addEventListener('click', deleteEdit);
  }

  // 저장/삭제 뒤 최신 데이터를 다시 받아 화면(목록·대시보드)에 즉시 반영합니다.
  async function syncNow() {
    var data = await apiGet();
    state.data = data;
    state.syncedAt = Date.now();
    state.offline = false;
    saveCache(data);
    clearBanner();
    render();
    return data;
  }

  async function saveEdit() {
    var e = edit;
    if (!e || e.busy) return;
    clearEditError();

    var amount = Number(digits(e.amountRaw) || 0);
    var method = e.method === '__custom' ? String(e.methodCustom || '').trim() : e.method;

    if (!String(e.merchant || '').trim()) return showEditError('사용처를 입력해 주세요.');
    if (!(amount > 0)) return showEditError('금액을 입력해 주세요.');
    if (!e.category) return showEditError('카테고리를 선택해 주세요.');
    if (!method) return showEditError('결제수단을 입력해 주세요.');

    var payload = {
      action: 'update',
      row: e.row,
      date: e.date,
      time: e.time || nowHM(),
      merchant: String(e.merchant).trim(),
      type: e.type,
      amount: amount,
      method: method,
      category: e.category,
      note: String(e.note || '').trim(),
      isWedding: !!e.isWedding
    };

    setEditBusy(true, '저장하는 중…');
    var err = null;
    try { await apiPost(payload); } catch (x) { err = x; }

    if (err && err.code === 'PIN_MISMATCH') {
      setEditBusy(false); closeSheet();
      showLock('PIN이 바뀐 것 같습니다. 다시 연결해 주세요.');
      return;
    }
    if (err && err.code === 'UNKNOWN_ACTION') {
      setEditBusy(false);
      showEditError('시트 쪽 백엔드가 수정 기능을 아직 모릅니다. Apps Script에 새 Code.gs를 붙여넣고 [배포 → 새 버전]으로 다시 배포해 주세요.');
      return;
    }
    // 서버가 이유를 들어 거절한 경우는 재조회 없이 그대로 안내합니다.
    if (err && err.code && err.code !== 'NETWORK' && err.code !== 'BAD_RESPONSE') {
      setEditBusy(false);
      showEditError(err.message || '저장하지 못했습니다.');
      return;
    }

    var data = null;
    try { data = await syncNow(); } catch (x2) { data = null; }
    setEditBusy(false);

    if (!data) {
      showEditError('저장은 됐는지 확인하지 못했어요. ↻ 새로고침으로 확인해 주세요.' +
        (err && err.message ? ' (' + err.message + ')' : ''));
      return;
    }

    var landed = txByRow(payload.row);
    var okLanded = !!landed &&
      String(landed.merchant) === payload.merchant &&
      Math.round(n(landed.amount)) === Math.round(payload.amount) &&
      String(landed.date || '').slice(0, 10) === String(payload.date).slice(0, 10) &&
      String(landed.type || '') === payload.type;

    if (!okLanded) {
      showEditError('시트에 반영된 것을 확인하지 못했어요. ↻ 새로고침 후 다시 시도해 주세요.' +
        (err && err.message ? ' (' + err.message + ')' : ''));
      return;
    }

    closeSheet();
    toast('수정했어요');
  }

  async function deleteEdit() {
    var e = edit;
    if (!e || e.busy) return;
    clearEditError();

    var label = (e.expectedMerchant || '이 내역') + ' ' + money(e.expectedAmount);
    if (!window.confirm('이 내역을 삭제할까요?\n\n' + label + '\n\n삭제하면 되돌릴 수 없습니다.')) return;

    var payload = { action: 'delete', row: e.row, expectedMerchant: e.expectedMerchant };

    setEditBusy(true, '삭제하는 중…');
    var err = null;
    try { await apiPost(payload); } catch (x) { err = x; }

    if (err && err.code === 'PIN_MISMATCH') {
      setEditBusy(false); closeSheet();
      showLock('PIN이 바뀐 것 같습니다. 다시 연결해 주세요.');
      return;
    }
    if (err && err.code === 'UNKNOWN_ACTION') {
      setEditBusy(false);
      showEditError('시트 쪽 백엔드가 삭제 기능을 아직 모릅니다. Apps Script에 새 Code.gs를 붙여넣고 [배포 → 새 버전]으로 다시 배포해 주세요.');
      return;
    }
    if (err && err.code && err.code !== 'NETWORK' && err.code !== 'BAD_RESPONSE') {
      setEditBusy(false);
      showEditError(err.message || '삭제하지 못했습니다.');
      return;
    }

    var data = null;
    try { data = await syncNow(); } catch (x2) { data = null; }
    setEditBusy(false);

    if (!data) {
      showEditError('삭제는 됐는지 확인하지 못했어요. ↻ 새로고침으로 확인해 주세요.' +
        (err && err.message ? ' (' + err.message + ')' : ''));
      return;
    }

    var still = (data.transactions || []).some(function (t) {
      return Number(t.row) === payload.row &&
        String(t.merchant || '') === String(payload.expectedMerchant || '') &&
        Math.round(n(t.amount)) === Math.round(e.expectedAmount);
    });

    if (still) {
      showEditError('삭제가 반영되지 않았어요. 새로고침 후 다시 시도해 주세요.');
      return;
    }

    closeSheet();
    toast('삭제했어요');
  }

  function switchTab(tab) {
    if (state.tab === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    state.tab = tab;
    lsSet(LS.tab, tab);
    render();
    window.scrollTo(0, 0);
  }

  /* ── 토스트 / 시트 ────────────────────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 2200);
  }

  function openSheet(html) {
    $('sheetBody').innerHTML = html;
    $('sheet').hidden = false;
    $('sheetBackdrop').hidden = false;
  }
  function closeSheet() {
    $('sheet').hidden = true;
    $('sheetBackdrop').hidden = true;
    edit = null;
  }

  function openSettings() {
    var d = new Date(state.syncedAt || Date.now());
    var masked = state.url.replace(/^(https:\/\/script\.google\.com\/macros\/s\/)([^/]+)/, function (m, a, b) {
      return a + b.slice(0, 6) + '…' + b.slice(-4);
    });
    var html = '<h2 class="sheet__title">연결 설정</h2>' +
      '<p class="sheet__sub">URL과 PIN은 이 기기에만 저장되고, 가계부 데이터는 구글 시트에만 있습니다.</p>' +
      '<div class="sheet__row"><span>웹 앱 URL</span><code>' + esc(masked) + '</code></div>' +
      '<div class="sheet__row"><span>PIN</span><code>••••</code></div>' +
      '<div class="sheet__row"><span>마지막 동기화</span><code>' +
        pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' · ' + (d.getMonth() + 1) + '/' + d.getDate() + '</code></div>' +
      '<div class="sheet__row"><span>불러온 거래</span><code>' +
        ((state.data && state.data.transactions || []).length) + '건</code></div>' +
      '<div class="sheet__actions">' +
      '<button class="btn btn--ghost" type="button" data-act="refresh">지금 새로고침</button>' +
      '<button class="btn btn--ghost" type="button" data-act="url">URL · PIN 다시 입력</button>' +
      '<button class="btn btn--danger" type="button" data-act="logout">연결 해제</button>' +
      '</div>' +
      '<p class="sheet__note">📱 홈 화면에 앱으로 추가: iPhone은 공유 → <b>홈 화면에 추가</b>, ' +
      'Android는 Chrome 메뉴 → <b>앱 설치</b>.<br>시트를 직접 고친 뒤에는 오른쪽 위 ↻ 를 눌러 주세요.</p>';
    openSheet(html);

    qsa('[data-act]', $('sheetBody')).forEach(function (el) {
      el.addEventListener('click', function () {
        var act = el.getAttribute('data-act');
        if (act === 'refresh') { closeSheet(); refresh(); }
        if (act === 'url') { closeSheet(); showLock(''); }
        if (act === 'logout') {
          if (!window.confirm('이 기기에서 URL과 PIN, 저장된 캐시를 지웁니다. 시트 데이터는 그대로 남습니다.')) return;
          lsDel(LS.url); lsDel(LS.pin); lsDel(LS.cache); lsDel(LS.tab);
          state.url = ''; state.pin = ''; state.data = null; state.syncedAt = null;
          state.saved = null; state.form = null; state.filter = { q: '', cat: '', wedding: 'exclude' };
          closeSheet();
          showLock('연결을 해제했습니다.');
        }
      });
    });
  }

  /* ── 부트스트랩 ───────────────────────────────────────────────────────── */
  function bindGlobal() {
    $('lockForm').addEventListener('submit', function (e) {
      e.preventDefault();
      connect($('inUrl').value, $('inPin').value.replace(/\D/g, ''));
    });
    $('inPin').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
    $('inUrl').addEventListener('input', function () { setLockError(''); });

    qsa('.tab').forEach(function (el) {
      el.addEventListener('click', function () { switchTab(el.getAttribute('data-tab')); });
    });
    $('btnRefresh').addEventListener('click', function () { refresh(); });
    $('btnSettings').addEventListener('click', openSettings);
    $('sheetBackdrop').addEventListener('click', closeSheet);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.url && Date.now() - (state.syncedAt || 0) > 60000) {
        refresh({ silent: true });
      }
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  function boot() {
    bindGlobal();
    registerSW();
    var url = lsGet(LS.url);
    var pin = lsGet(LS.pin);

    if (url && pin) {
      state.url = url;
      state.pin = pin;
      var cache = loadCache();
      if (cache) {
        state.data = cache.data;
        state.syncedAt = cache.at;
      }
      if (!state.form) resetForm(true);
      enterApp();
      refresh({ silent: true });
    } else {
      showLock('');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 테스트/디버그용 최소 노출
  window.__pocketLedger = {
    state: state,
    refresh: refresh,
    switchTab: switchTab,
    isWeddingTx: isWeddingTx,
    isSeparateTx: isSeparateTx,
    noteTags: noteTags,
    deriveSeparate: deriveSeparate,
    separateView: separateView,
    txMatches: txMatches,
    views: { home: homeHTML, list: listHTML, plan: planHTML }
  };
})();
