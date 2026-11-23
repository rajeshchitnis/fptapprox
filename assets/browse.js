/* Browse page: search, filters, problem list, references. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var data, index = {};
  var state = { q: '', tags: [], status: [], sort: 'name' };

  function readUrl() {
    var u = new URLSearchParams(location.search);
    state.q = u.get('q') || '';
    state.tags = u.getAll('tag');
    state.status = u.getAll('status');
    state.sort = u.get('sort') || 'name';
  }

  function writeUrl() {
    var u = new URLSearchParams();
    if (state.q) u.set('q', state.q);
    state.tags.forEach(function (t) { u.append('tag', t); });
    state.status.forEach(function (s) { u.append('status', s); });
    if (state.sort !== 'name') u.set('sort', state.sort);
    var qs = u.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function buildIndex() {
    var P = FPTApply.plain;
    data.problems.forEach(function (p) {
      var parts = [p.name, p.short, p.definition, p.parameter].concat(p.tags || []);
      p.results.forEach(function (r) {
        parts.push(r.statement, r.title, FPT_TYPE(r.type));
        (r.refs || []).forEach(function (k) {
          var ref = data.references[k];
          parts.push(k);
          if (ref) parts.push(ref.title, (ref.authors || []).join(' '), ref.venue, String(ref.year));
        });
      });
      index[p.id] = P(parts.filter(Boolean).join(' | ')).toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '');
    });
  }
  function FPT_TYPE(t) { return FPTApply.RESULT_TYPES[t] || ''; }

  function matches(p, opts) {
    opts = opts || {};
    var tags = opts.tags || state.tags, status = opts.status || state.status;
    if (state.q) {
      var text = index[p.id];
      var toks = state.q.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
      for (var i = 0; i < toks.length; i++) if (text.indexOf(toks[i]) < 0) return false;
    }
    for (var j = 0; j < tags.length; j++) if ((p.tags || []).indexOf(tags[j]) < 0) return false;
    if (status.length && status.indexOf(FPT.statusOf(p).key) < 0) return false;
    return true;
  }

  function sorted(list) {
    var key = function (p) { return FPTApply.plain(p.short || p.name).toLowerCase(); };
    var byName = function (a, b) { return FPTApply.plain(a.name).toLowerCase().localeCompare(FPTApply.plain(b.name).toLowerCase()); };
    list = list.slice();
    if (state.sort === 'updated') list.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')) || byName(a, b); });
    else if (state.sort === 'status') list.sort(function (a, b) { return FPT.STATUS_ORDER.indexOf(FPT.statusOf(a).key) - FPT.STATUS_ORDER.indexOf(FPT.statusOf(b).key) || byName(a, b); });
    else list.sort(byName);
    void key;
    return list;
  }

  function chip(label, attrs, pressed, count) {
    return '<button type="button" class="chip" aria-pressed="' + pressed + '" ' + attrs + (count === 0 && !pressed ? ' disabled' : '') + '>' +
      FPT.esc(label) + ' <span class="count">' + count + '</span></button>';
  }

  function renderFilters() {
    var h = '<h2>Status</h2><div class="chips">';
    FPT.STATUS_ORDER.forEach(function (s) {
      var n = data.problems.filter(function (p) { return matches(p, { status: [s] }); }).length;
      if (n === 0 && state.status.indexOf(s) < 0 && !data.problems.some(function (p) { return FPT.statusOf(p).key === s; })) return;
      h += chip(FPT.STATUS_LABELS[s], 'data-status="' + s + '"', state.status.indexOf(s) >= 0, n);
    });
    h += '</div>';
    var used = {};
    data.problems.forEach(function (p) { (p.tags || []).forEach(function (t) { used[t] = true; }); });
    Object.keys(data.tagGroups).forEach(function (g) {
      var tags = data.tagGroups[g].filter(function (t) { return used[t]; });
      if (!tags.length) return;
      h += '<h2>' + FPT.esc(g) + '</h2><div class="chips">';
      tags.forEach(function (t) {
        var on = state.tags.indexOf(t) >= 0;
        var n = data.problems.filter(function (p) { return matches(p, { tags: on ? state.tags : state.tags.concat([t]) }); }).length;
        h += chip(t, 'data-filter-tag="' + FPT.esc(t) + '"', on, n);
      });
      h += '</div>';
    });
    if (state.tags.length || state.status.length || state.q) h += '<div class="clear"><button type="button" class="btn btn-small" data-clear>Clear all filters</button></div>';
    h += '<div class="side-links"><a href="submit.html">Submit a new result</a><a href="about.html#how-it-works">How submissions are reviewed</a><a href="data/compendium.json" download>Download data (JSON)</a></div>';
    $('#filters-body').innerHTML = h;
  }

  function renderActive() {
    var h = '';
    state.status.forEach(function (s) { h += '<button type="button" class="chip" aria-pressed="true" data-status="' + s + '" title="Remove filter">' + FPT.esc(FPT.STATUS_LABELS[s]) + ' ✕</button>'; });
    state.tags.forEach(function (t) { h += '<button type="button" class="chip" aria-pressed="true" data-filter-tag="' + FPT.esc(t) + '" title="Remove filter">' + FPT.esc(t) + ' ✕</button>'; });
    $('#active').innerHTML = h;
  }

  function renderList() {
    var list = sorted(data.problems.filter(function (p) { return matches(p); }));
    var total = data.problems.length;
    $('#count').textContent = list.length === total ? 'Showing all ' + total + ' problems' : 'Showing ' + list.length + ' of ' + total + ' problems';
    var el = $('#list');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><h3>No problems match</h3><p>' +
        (state.q ? 'Nothing matches “' + FPT.esc(state.q) + '”' : 'Nothing matches these filters') +
        '. If you know a result that belongs here, add it and an editor will review it.</p>' +
        '<button type="button" class="btn" data-clear>Clear search and filters</button> <a class="btn btn-primary" href="submit.html">Submit a result</a></div>';
      return;
    }
    el.innerHTML = list.map(function (p) { return FPT.renderProblem(p, data); }).join('');
    FPT.typeset(el);
  }

  function renderRecent() {
    var items = [];
    data.problems.forEach(function (p) {
      var dates = {};
      p.results.forEach(function (r) { if (r.added) dates[r.added] = (dates[r.added] || []).concat([r]); });
      Object.keys(dates).forEach(function (d) { items.push({ p: p, date: d, results: dates[d] }); });
    });
    var cutoff = Date.now() - 1000 * 60 * 60 * 24 * 180;
    items = items.filter(function (x) { return new Date(x.date + 'T00:00:00Z').getTime() > cutoff; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 5);
    if (!items.length) { $('#recent').innerHTML = ''; return; }
    $('#recent').innerHTML = '<section class="recent" aria-labelledby="recent-h"><h2 id="recent-h">Recently added</h2><ul>' +
      items.map(function (x) {
        var kinds = x.results.map(function (r) { return (FPTApply.RESULT_TYPES[r.type] || '').toLowerCase(); })
          .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' and ');
        return '<li><a href="#' + FPT.esc(x.p.id) + '">' + FPT.rich(x.p.name, null) + '</a>: new ' + FPT.esc(kinds) + '<time datetime="' + x.date + '">' + FPT.esc(FPT.fmtDate(x.date)) + '</time></li>';
      }).join('') + '</ul></section>';
    FPT.typeset($('#recent'));
  }

  function renderRefs() {
    var cited = {};
    data.problems.forEach(function (p) {
      var keys = [];
      p.results.forEach(function (r) { (r.refs || []).forEach(function (k) { keys.push(k); }); });
      String(p.definition).replace(/\[([A-Za-z][A-Za-z+]*\d{2}[a-z]?)\]/g, function (m, k) { keys.push(k); });
      keys.forEach(function (k) { cited[k] = cited[k] || []; if (cited[k].indexOf(p) < 0) cited[k].push(p); });
    });
    var keys = Object.keys(data.references).sort(function (a, b) { return a.localeCompare(b); });
    $('#refs').innerHTML = keys.map(function (k) { return FPT.renderRef(k, data.references[k], data, cited[k]); }).join('');
    FPT.typeset($('#refs'));
  }

  function renderStats() {
    var results = 0;
    data.problems.forEach(function (p) { results += p.results.filter(function (r) { return r.type === 'algorithm' || r.type === 'lower-bound'; }).length; });
    $('#stats').innerHTML = '<strong>' + data.problems.length + '</strong> problems, <strong>' + results + '</strong> bounds from <strong>' +
      Object.keys(data.references).length + '</strong> papers. Last updated ' + FPT.esc(FPT.fmtDate(data.meta.updated)) + '.';
  }

  function refresh() { writeUrl(); renderFilters(); renderActive(); renderList(); }

  function toggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

  function flash(el) {
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 2400);
  }

  function focusHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el && FPTApply.findProblem(data, id)) {
      // the problem is hidden by a filter: clear filters so the link works
      state.q = ''; state.tags = []; state.status = []; $('#q').value = '';
      refresh(); el = document.getElementById(id);
    }
    if (el) { el.scrollIntoView({ block: 'start' }); flash(el); }
  }

  function bind() {
    var q = $('#q'), timer;
    q.value = state.q;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = q.value.trim(); refresh(); }, 120);
    });
    q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; state.q = ''; refresh(); } });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    });
    $('#sort').value = state.sort;
    $('#sort').addEventListener('change', function (e) { state.sort = e.target.value; refresh(); });

    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-filter-tag],[data-tag],[data-status],[data-clear],[data-copy-link],.cite');
      if (!t) return;
      if (t.hasAttribute('data-clear')) { state.q = ''; state.tags = []; state.status = []; q.value = ''; refresh(); return; }
      if (t.hasAttribute('data-filter-tag')) { toggle(state.tags, t.getAttribute('data-filter-tag')); refresh(); return; }
      if (t.hasAttribute('data-tag')) {
        var tag = t.getAttribute('data-tag');
        if (state.tags.indexOf(tag) < 0) state.tags.push(tag);
        refresh(); $('#results').scrollIntoView({ block: 'start' }); return;
      }
      if (t.hasAttribute('data-status')) { toggle(state.status, t.getAttribute('data-status')); refresh(); return; }
      if (t.hasAttribute('data-copy-link')) {
        var url = location.origin + location.pathname + '#' + t.getAttribute('data-copy-link');
        FPT.copyText(url).then(function () { FPT.toast('Link copied'); }, function () { prompt('Copy this link:', url); });
        return;
      }
      if (t.classList.contains('cite')) {
        var ref = document.getElementById('ref-' + t.getAttribute('data-ref'));
        if (ref) { e.preventDefault(); history.replaceState(null, '', '#ref-' + t.getAttribute('data-ref')); ref.scrollIntoView({ block: 'center' }); flash(ref); }
      }
    });

    var ft = $('#filters-toggle'), fl = $('#filters');
    ft.addEventListener('click', function () {
      var collapsed = fl.getAttribute('data-collapsed') === 'true';
      fl.setAttribute('data-collapsed', String(!collapsed));
      ft.setAttribute('aria-expanded', String(collapsed));
      ft.textContent = collapsed ? 'Hide filters' : 'Show filters';
    });
    $('#dl-bib').addEventListener('click', function () { FPT.download('fptapprox.bib', FPT.bibtex(data), 'application/x-bibtex'); });
    window.addEventListener('hashchange', focusHash);
  }

  document.addEventListener('DOMContentLoaded', function () {
    readUrl();
    FPT.loadData().then(function (d) {
      data = d;
      buildIndex();
      bind();
      renderStats();
      renderRecent();
      renderRefs();
      refresh();
      focusHash();
    }).catch(function (err) {
      $('#list').innerHTML = '<div class="notice err"><p>' + FPT.esc(err.message) + '</p><p>Try reloading the page. The <a href="legacy/index.html">original list</a> is also available.</p></div>';
    });
  });
})();
