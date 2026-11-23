/* Submission form: builds a submission, previews it, and sends it via GitHub or email. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DRAFT_KEY = 'fptapprox-submission-draft';
  var data, tags = [], touchedTags = {}, rowSeq = 0;

  /* ---------- results rows ---------- */
  function addResult(r) {
    r = r || {};
    var node = $('#result-tpl').content.firstElementChild.cloneNode(true);
    var n = ++rowSeq;
    $$('input[type=radio]', node).forEach(function (inp) {
      inp.name = 'rtype-' + n;
      inp.checked = inp.value === (r.type || 'algorithm');
    });
    var st = $('.r-statement', node), ti = $('.r-title', node);
    st.id = 'r-st-' + n; st.previousElementSibling.htmlFor = st.id;
    ti.id = 'r-ti-' + n; ti.closest('.field').querySelector('label').htmlFor = ti.id;
    st.value = r.statement || '';
    ti.value = r.title || '';
    $('#results').appendChild(node);
    syncRow(node);
    return node;
  }

  var PLACEHOLDERS = {
    'algorithm': '2-approximation in \\(2^{O(k)}\\cdot n^{O(1)}\\) time',
    'lower-bound': 'No \\((2-\\epsilon)\\)-approximation in \\(f(k)\\cdot n^{O(1)}\\) time (for any function \\(f\\)) under Gap-ETH',
    'special-case': 'On planar graphs, there is a \\((1+\\epsilon)\\)-approximation in …',
    'note': 'Any remark that is not itself a bound, e.g. the problem is FPT exactly.'
  };

  function rowType(row) { var c = $('input[type=radio]:checked', row); return c ? c.value : 'algorithm'; }

  function syncRow(row) {
    var t = rowType(row);
    row.setAttribute('data-type', t);
    $('.r-title-field', row).hidden = t !== 'special-case';
    $('.r-statement', row).placeholder = PLACEHOLDERS[t];
    var rows = $$('.result-row');
    rows.forEach(function (r) { $('.remove', r).hidden = rows.length < 2; });
  }

  /* ---------- tags ---------- */
  function renderTagPicker() {
    var groups = JSON.parse(JSON.stringify(data.tagGroups));
    var custom = tags.filter(function (t) { return !Object.keys(groups).some(function (g) { return groups[g].indexOf(t) >= 0; }); });
    if (custom.length) groups['Your new tags'] = custom;
    var h = '';
    Object.keys(groups).forEach(function (g) {
      h += '<h3>' + FPT.esc(g) + '</h3><div class="chips">' + groups[g].map(function (t) {
        return '<button type="button" class="chip" data-pick-tag="' + FPT.esc(t) + '" aria-pressed="' + (tags.indexOf(t) >= 0) + '">' + FPT.esc(t) + '</button>';
      }).join('') + '</div>';
    });
    $('#tag-picker').innerHTML = h;
  }

  function allKnownTags() {
    var out = [];
    Object.keys(data.tagGroups).forEach(function (g) { out = out.concat(data.tagGroups[g]); });
    return out;
  }

  /** Select tags whose names appear in the text (e.g. "Gap-ETH"), unless the user has toggled them. */
  function autoTags() {
    var text = $$('.r-statement').map(function (t) { return t.value; }).join(' ') + ' ' + $('#pr-def').value;
    var changed = false;
    allKnownTags().forEach(function (t) {
      if (touchedTags[t]) return;
      var re = new RegExp('(^|[^A-Za-z-])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Za-z-])', 'i');
      if (t === 'ETH') re = /(^|[^A-Za-z-])ETH($|[^A-Za-z-])/;
      var has = re.test(text), on = tags.indexOf(t) >= 0;
      if (has && !on) { tags.push(t); changed = true; }
      if (!has && on && !touchedTags[t] && autoTags.added[t]) { tags.splice(tags.indexOf(t), 1); changed = true; }
      if (has) autoTags.added[t] = true;
    });
    if (changed) renderTagPicker();
  }
  autoTags.added = {};

  /* ---------- collect ---------- */
  function mode() { return $('input[name=pmode]:checked').value; }

  function collect() {
    var existing = mode() === 'existing';
    return {
      version: 1,
      paper: {
        title: $('#p-title').value.trim(),
        authors: $('#p-authors').value.split(/\s*(?:,|;|\band\b)\s*/).map(function (a) { return a.trim(); }).filter(Boolean),
        venue: $('#p-venue').value.trim(),
        year: Number($('#p-year').value) || null,
        url: $('#p-url').value.trim()
      },
      problem: existing ? { id: $('#pr-id').value } : {
        id: '',
        name: $('#pr-name').value.trim(),
        short: $('#pr-short').value.trim(),
        definition: $('#pr-def').value.trim(),
        parameter: $('#pr-param').value.trim()
      },
      results: $$('.result-row').map(function (row) {
        var r = { type: rowType(row), statement: $('.r-statement', row).value.trim() };
        if (r.type === 'special-case' && $('.r-title', row).value.trim()) r.title = $('.r-title', row).value.trim();
        return r;
      }),
      tags: tags.slice(),
      submitter: { name: $('#s-name').value.trim(), affiliation: $('#s-aff').value.trim() },
      comments: $('#s-comments').value.trim()
    };
  }

  /* ---------- preview ---------- */
  function preview() {
    var sub = collect();
    var d = JSON.parse(JSON.stringify(data));
    var paper = {
      title: sub.paper.title || 'Paper title', authors: sub.paper.authors.length ? sub.paper.authors : ['Author'],
      venue: sub.paper.venue || 'Venue', year: sub.paper.year || new Date().getFullYear(), url: sub.paper.url
    };
    var key = FPTApply.findExistingRef(sub.paper.title ? paper : { title: '' }, d.references) || FPTApply.makeRefKey(paper, d.references);
    var isNewRef = !d.references[key];
    if (isNewRef) d.references[key] = paper;

    var p, mark = [];
    if (sub.problem.id) {
      p = FPTApply.findProblem(d, sub.problem.id);
    } else {
      p = { id: 'preview', name: sub.problem.name || 'Problem name', short: sub.problem.short || undefined,
        definition: sub.problem.definition || '<i>The definition will appear here.</i>', parameter: sub.problem.parameter, tags: [], results: [] };
    }
    if (!p) { $('#preview').innerHTML = ''; return; }
    sub.results.forEach(function (r) {
      mark.push(p.results.length);
      p.results.push({ type: r.type, title: r.title || (r.type === 'special-case' ? 'Special case' : undefined),
        statement: r.statement || '<i>Your statement will appear here.</i>', refs: [key] });
    });
    sub.tags.forEach(function (t) { if (p.tags.indexOf(t) < 0) p.tags.push(t); });

    var el = $('#preview');
    el.innerHTML = FPT.renderProblem(p, d, { preview: true, mark: mark, base: 'index.html' });
    FPT.typeset(el);
    $('#ref-preview').innerHTML = isNewRef
      ? 'The paper will be cited as <b>[' + FPT.esc(key) + ']</b>: ' + FPT.esc(FPT.refText(paper)) + '. Editors may adjust the key.'
      : 'This paper is already in the compendium as <b>[' + FPT.esc(key) + ']</b>, so the new results will cite it.';
    FPT.typeset($('#ref-preview'));
  }

  /* ---------- drafts ---------- */
  var saveTimer;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var ok = FPT.store.set(DRAFT_KEY, { mode: mode(), sub: collect(), touched: touchedTags, saved: Date.now() });
      if (ok) $('#draft-state').textContent = 'Draft saved on this device.';
    }, 400);
  }

  function restore(draft) {
    var s = draft.sub;
    $('#p-url').value = s.paper.url || '';
    $('#p-title').value = s.paper.title || '';
    $('#p-authors').value = (s.paper.authors || []).join(', ');
    $('#p-venue').value = s.paper.venue || '';
    $('#p-year').value = s.paper.year || '';
    setMode(draft.mode || 'existing');
    if (s.problem.id) $('#pr-id').value = s.problem.id;
    $('#pr-name').value = s.problem.name || '';
    $('#pr-short').value = s.problem.short || '';
    $('#pr-def').value = s.problem.definition || '';
    $('#pr-param').value = s.problem.parameter || '';
    $('#results').innerHTML = '';
    (s.results && s.results.length ? s.results : [{}]).forEach(addResult);
    tags = (s.tags || []).slice();
    touchedTags = draft.touched || {};
    $('#s-name').value = (s.submitter || {}).name || '';
    $('#s-aff').value = (s.submitter || {}).affiliation || '';
    $('#s-comments').value = s.comments || '';
  }

  function setMode(m) {
    $$('input[name=pmode]').forEach(function (r) { r.checked = r.value === m; });
    $('#pm-existing').hidden = m !== 'existing';
    $('#pm-new').hidden = m !== 'new';
  }

  /* ---------- sending ---------- */
  function problemLabel(sub) {
    if (sub.problem.id) { var p = FPTApply.findProblem(data, sub.problem.id); return p ? FPTApply.plain(p.short || p.name) : sub.problem.id; }
    return FPTApply.plain(sub.problem.short || sub.problem.name) + ' (new problem)';
  }

  function issueTitle(sub) {
    var t = FPTApply.plain(sub.paper.title);
    if (t.length > 70) t = t.slice(0, 67) + '…';
    return '[Submission] ' + problemLabel(sub) + ': ' + t;
  }

  function issueBody(sub) {
    var L = [];
    L.push('### Paper');
    L.push('**' + sub.paper.title + '**  ');
    L.push(sub.paper.authors.join(', ') + '  ');
    L.push((sub.paper.venue ? sub.paper.venue + ', ' : '') + (sub.paper.year || '') + '  ');
    L.push(sub.paper.url);
    L.push('');
    L.push('### Problem');
    if (sub.problem.id) {
      var p = FPTApply.findProblem(data, sub.problem.id);
      L.push('Existing problem: **' + (p ? FPTApply.plain(p.name) : sub.problem.id) + '** (`' + sub.problem.id + '`)');
    } else {
      L.push('New problem: **' + sub.problem.name + '**' + (sub.problem.short ? ' (' + sub.problem.short + ')' : ''));
      L.push('');
      L.push('Definition: ' + sub.problem.definition);
      if (sub.problem.parameter) L.push('', 'Parameter: ' + sub.problem.parameter);
    }
    L.push('');
    L.push('### Results');
    sub.results.forEach(function (r) {
      L.push('- **' + FPTApply.RESULT_TYPES[r.type] + (r.title ? ' (' + r.title + ')' : '') + ':** ' + r.statement);
    });
    L.push('');
    if (sub.tags.length) { L.push('### Tags', sub.tags.join(', '), ''); }
    if (sub.submitter.name || sub.submitter.affiliation) {
      L.push('### Submitted by', [sub.submitter.name, sub.submitter.affiliation].filter(Boolean).join(', '), '');
    }
    if (sub.comments) { L.push('### Note to the editors', sub.comments, ''); }
    L.push('---');
    L.push('Editors: review this on the [editors page](' + FPT.CONFIG.siteUrl + 'admin.html). To fix a typo before approving, edit the JSON below.');
    L.push('');
    L.push('<details><summary>Submission data</summary>');
    L.push('');
    L.push('```json');
    L.push(JSON.stringify(sub, null, 2));
    L.push('```');
    L.push('</details>');
    return L.join('\n');
  }

  var errorsShown = false;
  function check(quiet) {
    var sub = collect();
    var v = FPTApply.validate(sub, data);
    var box = $('#problems');
    if (v.errors.length) {
      box.innerHTML = '<div class="notice err" tabindex="-1"><p><b>A few things are missing before you can send this:</b></p><ul>' +
        v.errors.map(function (e) { return '<li>' + FPT.esc(e) + '</li>'; }).join('') + '</ul></div>';
      errorsShown = true;
      if (!quiet) box.firstChild.focus();
      return null;
    }
    errorsShown = false;
    box.innerHTML = v.warnings.length ? '<div class="notice warn"><p><b>Worth a second look (you can still send it):</b></p><ul>' +
      v.warnings.map(function (e) { return '<li>' + FPT.esc(e) + '</li>'; }).join('') + '</ul></div>' : '';
    return sub;
  }

  function afterSend(how) {
    $('#draft-state').innerHTML = (how === 'github'
      ? 'GitHub opened in a new tab. Click <b>Create</b> there to finish.'
      : 'Your mail app should have opened with the submission. Press send there.') +
      ' Once it has gone through, you can <button type="button" class="btn-link" id="clear-form">clear this form</button>.';
  }

  function sendGitHub() {
    var sub = check(); if (!sub) return;
    var body = issueBody(sub), title = issueTitle(sub);
    var url = FPT.CONFIG.repoUrl + '/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
    if (url.length > 7500) {
      FPT.copyText(body).then(function () {
        window.open(FPT.CONFIG.repoUrl + '/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent('Paste the submission here (it is on your clipboard).'), '_blank', 'noopener');
        FPT.toast('Submission copied. Paste it into the GitHub form.');
      });
    } else {
      window.open(url, '_blank', 'noopener');
    }
    afterSend('github');
  }

  function sendMail() {
    var sub = check(); if (!sub) return;
    var body = issueBody(sub), subject = issueTitle(sub);
    var href = 'mailto:' + FPT.CONFIG.email + '?subject=' + encodeURIComponent(subject) + '&body=';
    if ((href + encodeURIComponent(body)).length > 1900) {
      FPT.copyText(body).then(function () { FPT.toast('Submission copied. Paste it into the email.'); }, function () {});
      location.href = href + encodeURIComponent('Paste the submission here (it is on your clipboard).\n\n');
    } else {
      location.href = href + encodeURIComponent(body);
    }
    afterSend('email');
  }

  /* ---------- paper lookup ---------- */
  function lookup() {
    var url = $('#p-url').value.trim(), status = $('#lookup-status');
    var doi, m;
    if ((m = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/i.exec(url)) || (m = /^(?:arxiv:)?([0-9]{4}\.[0-9]{4,5})(v\d+)?$/i.exec(url))) doi = '10.48550/arXiv.' + m[1];
    else if ((m = /(10\.\d{4,9}\/[^\s?#"<>]+)/.exec(url))) doi = decodeURIComponent(m[1]).replace(/[.,;]+$/, '');
    if (!doi) { status.textContent = 'Automatic filling works for arXiv and DOI links. For other links, fill in the fields by hand.'; return; }
    status.textContent = 'Looking up the paper…';
    fetch('https://doi.org/' + doi, { headers: { Accept: 'application/vnd.citationstyles.csl+json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (c) {
        if (c.title) $('#p-title').value = Array.isArray(c.title) ? c.title[0] : c.title;
        if (c.author) $('#p-authors').value = c.author.map(function (a) { return a.literal || [a.given, a.family].filter(Boolean).join(' '); }).join(', ');
        var y = c.issued && c.issued['date-parts'] && c.issued['date-parts'][0] && c.issued['date-parts'][0][0];
        if (y) $('#p-year').value = y;
        var venue = c['container-title'] || c['event-title'] || (c.event && c.event.name) || (/arxiv/i.test(doi) ? 'arXiv preprint' : '');
        if (Array.isArray(venue)) venue = venue[0];
        if (venue && !$('#p-venue').value) $('#p-venue').value = venue;
        status.textContent = 'Filled in from ' + (/arxiv/i.test(doi) ? 'arXiv' : 'the DOI record') + '. Check the details below.';
        preview(); saveDraft();
      })
      .catch(function () { status.textContent = 'Couldn\'t look that up automatically. Please fill in the fields by hand.'; });
  }

  /* ---------- wiring ---------- */
  function bind() {
    var form = $('#form');
    form.addEventListener('input', function (e) {
      if (e.target.classList.contains('r-statement') || e.target.id === 'pr-def') autoTags();
      preview(); saveDraft();
      if (errorsShown) check(true);
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'pmode') setMode(e.target.value);
      var row = e.target.closest('.result-row');
      if (row) syncRow(row);
      preview(); saveDraft();
    });
    form.addEventListener('click', function (e) {
      var t = e.target;
      if (t.classList.contains('remove')) { t.closest('.result-row').remove(); $$('.result-row').forEach(syncRow); preview(); saveDraft(); }
      var chip = t.closest('[data-pick-tag]');
      if (chip) {
        var tag = chip.getAttribute('data-pick-tag');
        touchedTags[tag] = true;
        var i = tags.indexOf(tag); if (i >= 0) tags.splice(i, 1); else tags.push(tag);
        renderTagPicker(); preview(); saveDraft();
        var again = $('[data-pick-tag="' + CSS.escape(tag) + '"]'); if (again) again.focus();
      }
      if (t.id === 'clear-form' || t.id === 'discard') {
        FPT.store.del(DRAFT_KEY); location.href = 'submit.html';
      }
    });
    $('#add-result').addEventListener('click', function () {
      var row = addResult({ type: $$('.result-row').length === 1 && rowType($('.result-row')) === 'algorithm' ? 'lower-bound' : 'algorithm' });
      $('.r-statement', row).focus(); preview(); saveDraft();
    });
    function addCustomTag() {
      var v = $('#new-tag').value.trim(); if (!v) return;
      if (tags.indexOf(v) < 0) tags.push(v);
      touchedTags[v] = true;
      $('#new-tag').value = ''; renderTagPicker(); preview(); saveDraft();
    }
    $('#add-tag').addEventListener('click', addCustomTag);
    $('#new-tag').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } });
    $('#lookup').addEventListener('click', lookup);
    $('#p-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
    $('#send-gh').addEventListener('click', sendGitHub);
    $('#send-mail').addEventListener('click', sendMail);
    $('#copy').addEventListener('click', function () {
      var sub = check(); if (!sub) return;
      FPT.copyText(issueBody(sub)).then(function () { FPT.toast('Submission copied'); }, function () { FPT.toast('Copying failed. Use Send by email instead.'); });
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    FPT.loadData().then(function (d) {
      data = d;
      var opts = data.problems.slice().sort(function (a, b) { return FPTApply.plain(a.name).localeCompare(FPTApply.plain(b.name)); })
        .map(function (p) { return '<option value="' + FPT.esc(p.id) + '">' + FPT.esc(FPTApply.plain(p.name) + (p.short && p.short !== FPTApply.plain(p.name) ? ' (' + p.short + ')' : '')) + '</option>'; });
      $('#pr-id').innerHTML = opts.join('');

      var want = new URLSearchParams(location.search).get('problem');
      var draft = FPT.store.get(DRAFT_KEY);
      if (draft && draft.sub && !want) { restore(draft); $('#restored').hidden = false; }
      else {
        addResult();
        if (want && FPTApply.findProblem(data, want)) { setMode('existing'); $('#pr-id').value = want; }
        else if (want === 'new') setMode('new');
      }
      renderTagPicker();
      bind();
      preview();
    }).catch(function (err) {
      $('#preview').innerHTML = '<div class="notice err"><p>' + FPT.esc(err.message) + '</p></div>';
    });
  });

  // exposed for the editors' page and tests
  window.FPTSubmit = { issueBody: function (s) { return issueBody(s); } };
})();
