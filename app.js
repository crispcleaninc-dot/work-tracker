/* Work Tracker — home-screen app for the Running To-Do List.
   No task data lives in this code. Everything loads from the Apps Script
   relay after the PIN is checked there. */
(function () {
  'use strict';

  var CFG = window.WT_CONFIG || {};
  var AREAS = ['Urgent', 'Legal, housing and money', 'Tax clients', 'Apps and builds', 'Spec only', 'Content and ideas'];
  var state = { pin: '', items: [], tab: 'upcoming', who: 'all', q: '', editing: null, lastLoad: 0 };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- storage (only if "keep me signed in") ---------- */
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ---------- relay ---------- */
  function call(payload) {
    if (!CFG.RELAY_URL) return Promise.reject(new Error('The app is not connected yet (RELAY_URL missing in config.js).'));
    payload.pin = state.pin;
    return fetch(CFG.RELAY_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { var e = new Error(res.error || 'Something went wrong'); e.res = res; throw e; }
      return res;
    });
  }

  /* ---------- sign-in ---------- */
  function showLock(msg) {
    $('main').hidden = true; $('lock').hidden = false;
    $('pinMsg').textContent = msg || ''; $('pin').value = ''; setTimeout(function () { $('pin').focus(); }, 50);
  }
  $('pinForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    state.pin = $('pin').value.trim();
    $('pinMsg').textContent = 'Checking…';
    load(true).then(function () {
      if ($('remember').checked) store('wt_pin', state.pin); else store('wt_pin', null);
    });
  });

  function load(fromLock) {
    $('summary').textContent = 'Loading…';
    return call({ action: 'list' }).then(function (res) {
      state.items = res.items || [];
      state.lastLoad = Date.now();
      if (read('wt_pin')) store('wt_cache', JSON.stringify(state.items));
      $('lock').hidden = true; $('main').hidden = false;
      render();
    }).catch(function (err) {
      if (err.res && (err.res.badPin || err.res.locked)) { store('wt_pin', null); store('wt_cache', null); showLock(err.message); return; }
      if (fromLock) { $('pinMsg').textContent = err.message; return; }
      var cached = read('wt_cache');
      if (cached) { state.items = JSON.parse(cached); render(); toast('Offline — showing your last saved list.'); }
      else toast(err.message);
    });
  }

  /* ---------- helpers ---------- */
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parseDue(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
    return isNaN(d) ? null : d;
  }
  function parseNoted(s) {
    if (!s) return null;
    var d = new Date(s + ' ' + new Date().getFullYear());
    if (isNaN(d)) return null;
    if (d > new Date(Date.now() + 864e5)) d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  function fmtDue(d) {
    var t = today(), diff = Math.round((d - t) / 864e5);
    var label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (diff < 0) return { cls: 'over', text: 'Overdue · ' + label };
    if (diff === 0) return { cls: 'today', text: 'Today' };
    if (diff === 1) return { cls: 'today', text: 'Tomorrow' };
    return { cls: 'due', text: label };
  }
  function isNew(it) { var d = parseNoted(it.noted); return d && (Date.now() - d) < 7 * 864e5; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? u : ''; }

  function filtered() {
    var q = state.q.toLowerCase();
    return state.items.filter(function (it) {
      if (state.tab === 'done' ? !it.done : it.done) return false;
      if (state.who === 'You' && it.waiting !== 'You') return false;
      if (state.who === 'Claude' && it.waiting !== 'Claude') return false;
      if (state.who === 'other' && (it.waiting === 'You' || it.waiting === 'Claude')) return false;
      if (state.tab === 'new' && !isNew(it)) return false;
      if (q && (it.task + ' ' + it.project + ' ' + it.category).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------- render ---------- */
  function itemHtml(it) {
    var tags = [];
    if (it.project) tags.push('<span class="tag proj">' + esc(it.project) + '</span>');
    var d = parseDue(it.due);
    if (d && !it.done) { var f = fmtDue(d); tags.push('<span class="tag ' + f.cls + '">' + esc(f.text) + '</span>'); }
    if (it.waiting) tags.push('<span class="tag' + (it.waiting === 'Claude' ? ' claude' : '') + '">On ' + esc(it.waiting === 'You' ? 'me' : it.waiting) + '</span>');
    if (isNew(it) && !it.done) tags.push('<span class="tag new">New</span>');
    if (it.done && it.doneOn) tags.push('<span class="tag">Done ' + esc(it.doneOn) + '</span>');
    var link = safeUrl(it.link) ? ' <a class="link" href="' + esc(it.link) + '" target="_blank" rel="noopener">Open link</a>' : '';
    return '<div class="item' + (it.done ? ' done' : '') + '" data-id="' + esc(it.id) + '">' +
      '<button class="box" data-act="toggle" aria-label="' + (it.done ? 'Mark not done' : 'Mark done') + '">' + (it.done ? '&#10003;' : '') + '</button>' +
      '<div class="body" data-act="edit"><p class="t">' + esc(it.task) + '</p><div class="meta">' + tags.join('') + link + '</div></div></div>';
  }

  function render() {
    var items = filtered();
    var open = state.items.filter(function (i) { return !i.done; });
    var overdue = open.filter(function (i) { var d = parseDue(i.due); return d && d < today(); }).length;
    var mine = open.filter(function (i) { return i.waiting === 'You'; }).length;
    $('summary').textContent = open.length + ' open · ' + mine + ' on me' + (overdue ? ' · ' + overdue + ' overdue' : '');
    var html = '';
    if (!items.length) html = '<p class="empty">' + (state.tab === 'done' ? 'Nothing checked off yet.' : 'Nothing here. Nice.') + '</p>';
    else if (state.tab === 'upcoming') html = renderUpcoming(items);
    else if (state.tab === 'groups') html = renderGroups(items);
    else html = items.map(itemHtml).join('');
    $('list').innerHTML = html;
    fillProjects();
  }

  function renderUpcoming(items) {
    var dated = items.filter(function (i) { return parseDue(i.due); })
      .sort(function (a, b) { return parseDue(a.due) - parseDue(b.due); });
    var t = today(), wk = new Date(t.getTime() + 7 * 864e5);
    var buckets = [['Overdue', function (d) { return d < t; }], ['This week', function (d) { return d >= t && d <= wk; }],
                   ['Later', function (d) { return d > wk; }]];
    var html = '';
    buckets.forEach(function (b) {
      var list = dated.filter(function (i) { return b[1](parseDue(i.due)); });
      if (list.length) html += '<p class="sublabel">' + b[0] + ' (' + list.length + ')</p>' + list.map(itemHtml).join('');
    });
    var urgent = items.filter(function (i) { return !parseDue(i.due) && i.category === 'Urgent'; });
    if (urgent.length) html += '<p class="sublabel">Urgent, no date</p>' + urgent.map(itemHtml).join('');
    if (!html) html = '<p class="empty">No dated items. See "By area" for everything.</p>';
    return html;
  }

  function renderGroups(items) {
    var byArea = {};
    items.forEach(function (i) { var a = i.category || 'Apps and builds'; (byArea[a] = byArea[a] || []).push(i); });
    var order = AREAS.concat(Object.keys(byArea).filter(function (a) { return AREAS.indexOf(a) < 0; }));
    var openState = JSON.parse(read('wt_open') || '{}');
    return order.filter(function (a) { return byArea[a]; }).map(function (a) {
      var byProj = {};
      byArea[a].forEach(function (i) { var p = i.project || 'General'; (byProj[p] = byProj[p] || []).push(i); });
      var inner = Object.keys(byProj).sort().map(function (p) {
        return '<p class="sublabel">' + esc(p) + '</p>' + byProj[p].map(itemHtml).join('');
      }).join('');
      var isOpen = openState[a] !== false;
      return '<details class="group" data-area="' + esc(a) + '"' + (isOpen ? ' open' : '') + '><summary>' + esc(a) +
        ' <span class="count">' + byArea[a].length + '</span></summary>' + inner + '</details>';
    }).join('');
  }

  function fillProjects() {
    var seen = {}, opts = '';
    state.items.forEach(function (i) { if (i.project && !seen[i.project]) { seen[i.project] = 1; opts += '<option value="' + esc(i.project) + '">'; } });
    $('projects').innerHTML = opts;
    var cats = AREAS.slice();
    state.items.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); });
    $('fCategory').innerHTML = cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  }

  /* ---------- actions ---------- */
  function byId(id) { for (var i = 0; i < state.items.length; i++) if (String(state.items[i].id) === String(id)) return state.items[i]; return null; }

  function toggle(it) {
    var was = it.done; it.done = !was; render();
    call({ action: 'toggle', id: it.id, row: it.row, done: it.done }).then(function () {
      toast(it.done ? 'Checked off' : 'Moved back to open', function () { toggle(it); });
    }).catch(function (err) { it.done = was; render(); toast(err.message); });
  }

  function openEditor(it) {
    state.editing = it || null;
    $('sheetTitle').textContent = it ? 'Edit task' : 'Add a task';
    $('fTask').value = it ? it.task : '';
    $('fProject').value = it ? it.project : '';
    $('fCategory').value = it ? (it.category || 'Apps and builds') : (state.tab === 'groups' ? 'Apps and builds' : 'Urgent');
    var d = it && parseDue(it.due);
    $('fDue').value = d ? d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) : '';
    $('fWaiting').value = it ? (it.waiting || 'You') : 'You';
    $('fLink').value = it ? (it.link || '') : '';
    $('fMeta').textContent = it ? [it.noted && 'Noted ' + it.noted, it.source, it.updated && 'Updated ' + it.updated].filter(Boolean).join(' · ') : '';
    $('sheet').hidden = false;
    setTimeout(function () { $('fTask').focus(); }, 50);
  }

  $('itemForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var p = { task: $('fTask').value.trim(), project: $('fProject').value.trim(), category: $('fCategory').value,
              due: $('fDue').value, waiting: $('fWaiting').value, link: $('fLink').value.trim() };
    var it = state.editing;
    $('sheet').hidden = true;
    var req = it ? call(Object.assign({ action: 'edit', id: it.id, row: it.row }, p)) : call(Object.assign({ action: 'add' }, p));
    req.then(function (res) { toast(res.duplicate ? 'Already on your list' : 'Saved'); return load(); })
       .catch(function (err) { toast(err.message); });
  });

  $('list').addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el || ev.target.closest('a')) return;
    var it = byId(el.closest('.item').getAttribute('data-id')); if (!it) return;
    if (el.getAttribute('data-act') === 'toggle') toggle(it); else openEditor(it);
  });
  $('list').addEventListener('toggle', function (ev) {
    var d = ev.target; if (!d.matches || !d.matches('details.group')) return;
    var o = JSON.parse(read('wt_open') || '{}'); o[d.getAttribute('data-area')] = d.open; store('wt_open', JSON.stringify(o));
  }, true);

  $('tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    state.tab = b.getAttribute('data-tab');
    Array.prototype.forEach.call($('tabs').children, function (x) { x.classList.toggle('on', x === b); });
    render(); window.scrollTo(0, 0);
  });
  $('filters').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    state.who = b.getAttribute('data-who');
    Array.prototype.forEach.call($('filters').children, function (x) { x.classList.toggle('on', x === b); });
    render();
  });
  $('search').addEventListener('input', function (ev) { state.q = ev.target.value; render(); });
  $('addBtn').addEventListener('click', function () { openEditor(null); });
  $('cancelBtn').addEventListener('click', function () { $('sheet').hidden = true; });
  $('sheet').addEventListener('click', function (ev) { if (ev.target === $('sheet')) $('sheet').hidden = true; });
  $('refreshBtn').addEventListener('click', function () { load(); });
  $('menuBtn').addEventListener('click', function () { $('menu').hidden = false; });
  $('closeMenu').addEventListener('click', function () { $('menu').hidden = true; });
  $('menu').addEventListener('click', function (ev) { if (ev.target === $('menu')) $('menu').hidden = true; });
  $('sheetLink').href = CFG.SHEET_URL || '#';
  $('signOut').addEventListener('click', function () {
    store('wt_pin', null); store('wt_cache', null); state.pin = ''; state.items = []; $('menu').hidden = true; showLock('Signed out.');
  });
  $('installHelp').addEventListener('click', function () {
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; return; }
    alert(/iphone|ipad/i.test(navigator.userAgent)
      ? 'In Safari: tap the Share button, then "Add to Home Screen".'
      : 'In Chrome: tap the ⋮ menu, then "Add to Home screen" or "Install app".');
  });

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg, undo) {
    var t = $('toast'); clearTimeout(toastTimer);
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
    t.hidden = false;
    if (undo) t.querySelector('button').onclick = function () { t.hidden = true; undo(); };
    toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  /* ---------- install + refresh ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.pin && Date.now() - state.lastLoad > 60000) load();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

  /* ---------- start ---------- */
  var saved = read('wt_pin');
  if (saved) { state.pin = saved; $('main').hidden = false; var c = read('wt_cache'); if (c) { state.items = JSON.parse(c); render(); } load(); }
  else showLock();
})();
