/* Shared rendering for the FPT Approximation Compendium. */
(function () {
  'use strict';

  var CONFIG = {
    owner: 'rajeshchitnis',
    repo: 'fptapprox',
    branch: 'main',
    siteUrl: 'https://rajeshchitnis.github.io/fptapprox/',
    email: 'fptapprox@gmail.com',
    dataUrl: 'data/compendium.json'
  };
  CONFIG.repoUrl = 'https://github.com/' + CONFIG.owner + '/' + CONFIG.repo;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Short plain-text citation used in tooltips. */
  function refText(r) {
    if (!r) return '';
    return FPTApply.plain(authorList(r.authors) + ': ' + r.title + '. ' + (r.venue || '') + (r.year && String(r.venue || '').indexOf(String(r.year)) < 0 ? ' (' + r.year + ')' : ''));
  }

  function authorList(a) {
    a = a || [];
    if (a.length <= 2) return a.join(' and ');
    return a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
  }

  function cite(key, data, base) {
    var r = data.references[key];
    if (!r) return '<span class="cite">[' + esc(key) + ']</span>';
    return '<a class="cite" data-ref="' + esc(key) + '" href="' + esc(base || '') + '#ref-' + esc(key) + '" title="' + esc(refText(r)) + '">[' + esc(key) + ']</a>';
  }

  /**
   * Render text that may contain \( LaTeX \), a few inline HTML tags, and [KEY] citations.
   * Everything else is escaped, so submitted text can never inject markup.
   */
  function rich(s, data, base) {
    var out = esc(s);
    out = out.replace(/&lt;(\/?)(i|b|em|strong|sub|sup)&gt;/g, '<$1$2>');
    if (data) {
      out = out.replace(/\[([A-Za-z][A-Za-z+]*\d{2}[a-z]?)\]/g, function (m, k) {
        return data.references[k] ? cite(k, data, base) : m;
      });
    }
    return out;
  }

  function typeset(el) {
    if (!el || typeof renderMathInElement !== 'function') return;
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$', right: '$', display: false }
        ],
        ignoredClasses: ['no-math'],
        throwOnError: false
      });
    } catch (e) { /* leave raw TeX visible */ }
  }

  function statusOf(p) {
    var hasU = p.results.some(function (r) { return r.type === 'algorithm'; });
    var hasL = p.results.some(function (r) { return r.type === 'lower-bound'; });
    if (hasU && hasL && p.tight) return { key: 'tight', label: 'Tight', glyph: '<i class="u"></i><i class="l"></i>', help: 'The best algorithm matches the lower bound.' };
    if (hasU && hasL) return { key: 'gap', label: 'Gap remains', glyph: '<i class="u"></i><i class="l"></i>', help: 'Upper and lower bounds are known but do not match.' };
    if (hasU) return { key: 'no-lower', label: 'No lower bound known', glyph: '<i class="u"></i><i class="none"></i>', help: 'An FPT approximation is known, but no hardness of approximation.' };
    if (hasL) return { key: 'no-upper', label: 'No algorithm known', glyph: '<i class="none"></i><i class="l"></i>', help: 'Hardness is known, but no FPT approximation algorithm.' };
    return { key: 'open', label: 'Open', glyph: '<i class="none"></i><i class="none"></i>', help: 'No results recorded yet.' };
  }

  var STATUS_ORDER = ['tight', 'gap', 'no-lower', 'no-upper', 'open'];
  var STATUS_LABELS = { 'tight': 'Tight', 'gap': 'Gap remains', 'no-lower': 'No lower bound known', 'no-upper': 'No algorithm known', 'open': 'Open' };

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00Z');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  /**
   * Render one problem entry.
   * opts.base: prefix for citation links (e.g. 'index.html' on other pages)
   * opts.mark: array of result indices to highlight as proposed
   * opts.preview: hide actions that make no sense in a preview
   */
  function renderProblem(p, data, opts) {
    opts = opts || {};
    var base = opts.base || '';
    var mark = opts.mark || [];
    var st = statusOf(p);
    var upper = [], lower = [], extra = [];
    p.results.forEach(function (r, i) {
      var cls = mark.indexOf(i) >= 0 ? ' class="is-proposed"' : '';
      var refs = (r.refs || []).map(function (k) { return cite(k, data, base); }).join(' ');
      var badge = mark.indexOf(i) >= 0 ? '<span class="new-badge">proposed</span>' : (isRecent(r.added) ? '<span class="new-badge" title="Added ' + esc(fmtDate(r.added)) + '">new</span>' : '');
      var body = rich(r.statement, data, base) + (refs ? ' ' + refs : '') + badge;
      if (r.type === 'algorithm') upper.push('<li' + cls + '>' + body + '</li>');
      else if (r.type === 'lower-bound') lower.push('<li' + cls + '>' + body + '</li>');
      else extra.push({ r: r, html: body, cls: cls });
    });

    var name = rich(p.name, null) + (p.short ? ' <span class="abbr">(' + esc(p.short) + ')</span>' : '');
    var h = '';
    h += '<article class="problem" id="' + esc(p.id) + '" data-id="' + esc(p.id) + '">';
    h += '<div class="problem-head">';
    h += '<h3>' + (opts.preview ? name : '<a href="#' + esc(p.id) + '">' + name + '</a>') + '</h3>';
    h += '<span class="status ' + st.key + '" title="' + esc(st.help) + '"><span class="glyph" aria-hidden="true">' + st.glyph + '</span>' + esc(st.label) + '</span>';
    h += '<span class="spacer"></span>';
    if (!opts.preview) h += '<button class="permalink" type="button" data-copy-link="' + esc(p.id) + '" title="Copy a link to this problem">Copy link</button>';
    h += '</div>';
    if (p.parameter) h += '<p class="param"><b>Parameter:</b> ' + rich(p.parameter, data, base) + '</p>';
    h += '<p class="definition">' + rich(p.definition, data, base) + '</p>';
    h += '<div class="bounds">';
    h += '<section class="bound upper"><h4>Algorithm</h4>' + (upper.length ? '<ul>' + upper.join('') + '</ul>' : '<p class="empty">No FPT approximation known.</p>') + '</section>';
    h += '<section class="bound lower"><h4>Lower bound</h4>' + (lower.length ? '<ul>' + lower.join('') + '</ul>' : '<p class="empty">No lower bound known.</p>') + '</section>';
    h += '</div>';

    var notes = extra.filter(function (x) { return x.r.type === 'note'; });
    var specials = extra.filter(function (x) { return x.r.type === 'special-case'; });
    if (notes.length || specials.length) {
      h += '<div class="extra">';
      notes.forEach(function (x) { h += '<div class="item"' + x.cls + '><h5>Note</h5>' + x.html + '</div>'; });
      if (specials.length) {
        var open = opts.preview || specials.some(function (x) { return x.cls; });
        h += '<details class="special"' + (open ? ' open' : '') + '><summary>Special cases (' + specials.length + ')</summary><div class="extra">';
        specials.forEach(function (x) { h += '<div class="item"' + x.cls + '><h5>' + rich(x.r.title || 'Special case', data, base) + '</h5>' + x.html + '</div>'; });
        h += '</div></details>';
      }
      h += '</div>';
    }

    h += '<div class="problem-foot">';
    h += '<div class="tags">' + (p.tags || []).map(function (t) { return '<button type="button" class="tag" data-tag="' + esc(t) + '" title="Show all problems tagged ' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>';
    h += '<span class="spacer"></span>';
    if (p.updated) h += '<span class="meta">Updated ' + esc(fmtDate(p.updated)) + '</span>';
    if (!opts.preview) h += '<a href="submit.html?problem=' + encodeURIComponent(p.id) + '">Add a result</a>';
    h += '</div>';
    h += '</article>';
    return h;
  }

  function isRecent(iso) {
    if (!iso) return false;
    var d = new Date(iso + 'T00:00:00Z');
    return !isNaN(d) && (Date.now() - d.getTime()) < 1000 * 60 * 60 * 24 * 60;
  }

  function renderRef(key, r, data, citedBy) {
    var links = [];
    if (r.url) links.push('<a href="' + esc(r.url) + '" rel="noopener">Paper</a>');
    if (r.arxiv && !(r.url || '').match(/arxiv\.org/)) links.push('<a href="https://arxiv.org/abs/' + esc(r.arxiv) + '" rel="noopener">arXiv</a>');
    links.push('<a href="https://dblp.org/search?q=' + encodeURIComponent(FPTApply.plain(r.title)) + '" rel="noopener">Find on DBLP</a>');
    if (citedBy && citedBy.length) links.push('<span>Cited for: ' + citedBy.map(function (p) { return '<a href="#' + esc(p.id) + '">' + rich(p.short || p.name, null) + '</a>'; }).join(', ') + '</span>');
    return '<li class="ref" id="ref-' + esc(key) + '"><span class="key">[' + esc(key) + ']</span><div>' +
      esc(authorList(r.authors)) + '. <span class="title">' + rich(r.title, null) + '.</span> ' + esc(r.venue || '') +
      (r.year && String(r.venue || '').indexOf(String(r.year)) < 0 ? ', ' + esc(r.year) : '') + '.' +
      '<div class="links">' + links.join('') + '</div></div></li>';
  }

  function bibtex(data) {
    return Object.keys(data.references).sort().map(function (k) {
      var r = data.references[k];
      var title = String(r.title).replace(/\\\(|\\\)/g, '$');
      var f = ['  author = {' + (r.authors || []).join(' and ') + '}', '  title = {' + title + '}', '  howpublished = {' + (r.venue || '') + '}', '  year = {' + (r.year || '') + '}'];
      if (r.url) f.push('  url = {' + r.url + '}');
      if (r.arxiv) f.push('  eprint = {' + r.arxiv + '}', '  archivePrefix = {arXiv}');
      return '@misc{' + k + ',\n' + f.join(',\n') + '\n}';
    }).join('\n\n') + '\n';
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  var toastTimer;
  function toast(msg) {
    var t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  function loadData() {
    return fetch(CONFIG.dataUrl, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Could not load the compendium data (HTTP ' + r.status + ').');
      return r.json();
    });
  }

  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  window.FPT = {
    CONFIG: CONFIG, esc: esc, rich: rich, typeset: typeset, statusOf: statusOf,
    STATUS_ORDER: STATUS_ORDER, STATUS_LABELS: STATUS_LABELS,
    renderProblem: renderProblem, renderRef: renderRef, authorList: authorList, refText: refText,
    bibtex: bibtex, download: download, toast: toast, copyText: copyText, loadData: loadData,
    fmtDate: fmtDate, store: store
  };
})();
