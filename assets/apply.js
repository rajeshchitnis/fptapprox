/*
 * Shared submission logic for the FPT Approximation Compendium.
 *
 * This one file is used in three places, so the preview an editor sees is
 * exactly what gets published:
 *   - submit.html   (validates the form and builds the submission)
 *   - admin.html    (previews a pending submission merged into the data)
 *   - .github/scripts/apply-submission.js  (the GitHub Action that publishes it)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FPTApply = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RESULT_TYPES = {
    'algorithm': 'Algorithm',
    'lower-bound': 'Lower bound',
    'special-case': 'Special case',
    'note': 'Note'
  };

  var LIMITS = { short: 300, long: 4000, authors: 30, results: 10, tags: 15 };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function str(x) { return (x == null ? '' : String(x)).trim(); }

  /** Plain text version of a string that may contain \( LaTeX \) and simple HTML. */
  function plain(s) {
    return str(s)
      .replace(/<[^>]*>/g, '')
      .replace(/\\\(|\\\)/g, '')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[{}^_$]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normTitle(s) { return plain(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  function normUrl(u) {
    return str(u).toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/^(dx\.)?doi\.org\//, 'doi:')
      .replace(/arxiv\.org\/(abs|pdf)\/([0-9.]+)(v\d+)?(\.pdf)?/, 'arxiv:$2')
      .replace(/\/+$/, '');
  }

  function slugify(name) {
    var s = plain(name).toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'problem';
  }

  function lastName(full) {
    var parts = str(full).split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function initial(name) {
    var c = lastName(name).normalize('NFKD').replace(/[^A-Za-z]/g, '').charAt(0);
    return c ? c.toUpperCase() : '';
  }

  /** Citation key in the style of the original list: initials of last names + 2-digit year, e.g. CFM18. */
  function makeRefKey(paper, references) {
    var letters = (paper.authors || []).map(initial).join('');
    if (letters.length > 6) letters = letters.slice(0, 5) + '+';
    if (!letters) letters = 'X';
    var yy = String(paper.year || '').slice(-2) || 'xx';
    var base = letters + yy, key = base, i = 0;
    while (references[key]) key = base + 'abcdefghijklmnopqrstuvwxyz'.charAt(i++);
    return key;
  }

  /** Find an existing reference for the same paper (same URL or same title). */
  function findExistingRef(paper, references) {
    var u = normUrl(paper.url), t = normTitle(paper.title);
    var keys = Object.keys(references);
    for (var i = 0; i < keys.length; i++) {
      var r = references[keys[i]];
      if ((u && r.url && normUrl(r.url) === u) || (u && r.arxiv && u === 'arxiv:' + r.arxiv)) return keys[i];
      if (t && normTitle(r.title) === t) return keys[i];
    }
    return null;
  }

  function findProblem(data, id) {
    for (var i = 0; i < data.problems.length; i++) if (data.problems[i].id === id) return data.problems[i];
    return null;
  }

  function arxivId(url) {
    var m = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/i.exec(str(url));
    return m ? m[1] : undefined;
  }

  /**
   * Check a submission. Returns {errors: [...], warnings: [...]}.
   * Errors block publishing; warnings are shown to the editor.
   */
  function validate(sub, data) {
    var errors = [], warnings = [];
    if (!sub || typeof sub !== 'object') return { errors: ['The submission data could not be read.'], warnings: [] };
    var p = sub.paper || {}, pr = sub.problem || {}, results = sub.results || [];

    if (!str(p.title)) errors.push('Add the paper title.');
    if (!Array.isArray(p.authors) || !p.authors.filter(function (a) { return str(a); }).length) errors.push('Add at least one author.');
    if (!/^https?:\/\/\S+$/i.test(str(p.url))) errors.push('Add a link to the paper (starting with https://).');
    var y = Number(p.year);
    if (!y || y < 1950 || y > 2100) errors.push('Add the year the paper appeared.');
    var dupKey = data && str(p.title) ? findExistingRef(p, data.references) : null;
    if (!str(p.venue) && !dupKey) warnings.push('No venue given; it will show as "Manuscript" unless you add one.');

    var existing = str(pr.id) ? (data ? findProblem(data, str(pr.id)) : true) : null;
    if (str(pr.id) && data && !existing) errors.push('The selected problem "' + pr.id + '" is not in the compendium.');
    if (!str(pr.id)) {
      if (!str(pr.name)) errors.push('Name the problem.');
      if (!str(pr.definition)) errors.push('Define the problem.');
      if (data && str(pr.name)) {
        var n = normTitle(pr.name);
        data.problems.forEach(function (q) {
          if (normTitle(q.name) === n || (q.short && normTitle(q.short) === n)) warnings.push('A problem called "' + plain(q.name) + '" already exists. Consider attaching the result to it instead of creating a new problem.');
        });
      }
    }
    if (!Array.isArray(results) || !results.length) errors.push('Add at least one result.');
    (results || []).forEach(function (r, i) {
      var label = 'Result ' + (i + 1);
      if (!RESULT_TYPES[r.type]) errors.push(label + ': choose a result type.');
      if (!str(r.statement)) errors.push(label + ': write the result statement.');
      if (r.type === 'special-case' && !str(r.title)) warnings.push(label + ': special cases read better with a short title.');
    });
    if ((results || []).length > LIMITS.results) errors.push('A single submission can contain at most ' + LIMITS.results + ' results.');

    // length limits and unbalanced math delimiters
    var fields = [p.title, p.venue, pr.name, pr.parameter].concat((sub.tags || []));
    fields.forEach(function (f) { if (str(f).length > LIMITS.short) errors.push('"' + str(f).slice(0, 40) + '…" is too long.'); });
    [pr.definition, sub.comments].concat(results.map(function (r) { return r.statement; })).forEach(function (f) {
      if (str(f).length > LIMITS.long) errors.push('A text field is longer than ' + LIMITS.long + ' characters.');
    });
    [p.title, pr.name, pr.definition, pr.parameter].concat(results.map(function (r) { return r.statement + ' ' + (r.title || ''); })).forEach(function (f) {
      var s = str(f);
      if ((s.match(/\\\(/g) || []).length !== (s.match(/\\\)/g) || []).length) warnings.push('Unbalanced math delimiters \\( \\) in: "' + s.slice(0, 50) + '…"');
    });

    if (dupKey) warnings.push('This paper is already in the compendium as [' + dupKey + ']; the new results will cite that entry.');
    return { errors: errors, warnings: warnings };
  }

  /**
   * Merge a submission into a copy of the data.
   * Returns {data, problemId, refKey, isNewProblem, isNewRef, errors, warnings}.
   */
  function applySubmission(data, sub, opts) {
    opts = opts || {};
    var v = validate(sub, data);
    if (v.errors.length) return { data: data, errors: v.errors, warnings: v.warnings };
    var out = clone(data);
    var date = opts.date || new Date().toISOString().slice(0, 10);
    var p = sub.paper, pr = sub.problem;

    // 1. reference
    var refKey = findExistingRef(p, out.references), isNewRef = !refKey;
    if (!refKey) {
      refKey = makeRefKey(p, out.references);
      var ref = {
        authors: p.authors.map(str).filter(Boolean).slice(0, LIMITS.authors),
        title: str(p.title),
        venue: str(p.venue) || 'Manuscript',
        year: Number(p.year),
        url: str(p.url)
      };
      var ax = arxivId(p.url);
      if (ax) ref.arxiv = ax;
      out.references[refKey] = ref;
    }

    // 2. problem
    var problem, isNewProblem = false;
    if (str(pr.id)) {
      problem = findProblem(out, str(pr.id));
    } else {
      isNewProblem = true;
      var id = slugify(pr.name), base = id, i = 2;
      while (findProblem(out, id)) id = base + '-' + (i++);
      problem = { id: id, name: str(pr.name), definition: str(pr.definition), tags: [], results: [] };
      if (str(pr.short)) problem.short = str(pr.short);
      if (str(pr.parameter)) problem.parameter = str(pr.parameter);
      problem.added = date;
      out.problems.push(problem);
    }

    // 3. results
    sub.results.forEach(function (r) {
      var res = { type: r.type, statement: str(r.statement), refs: [refKey], added: date };
      if (str(r.title)) res.title = str(r.title);
      if (opts.issue) res.source = 'issue #' + opts.issue;
      problem.results.push(res);
    });
    problem.updated = date;

    // 4. tags (new tags go to an "Other" group so an editor can move them later)
    (sub.tags || []).map(str).filter(Boolean).slice(0, LIMITS.tags).forEach(function (t) {
      if (problem.tags.indexOf(t) < 0) problem.tags.push(t);
      var known = Object.keys(out.tagGroups).some(function (g) { return out.tagGroups[g].indexOf(t) >= 0; });
      if (!known) {
        out.tagGroups.Other = out.tagGroups.Other || [];
        out.tagGroups.Other.push(t);
      }
    });

    if (sub.submitter && str(sub.submitter.name)) {
      problem.contributors = problem.contributors || [];
      if (problem.contributors.indexOf(str(sub.submitter.name)) < 0) problem.contributors.push(str(sub.submitter.name));
    }
    out.meta.updated = date;
    return { data: out, problemId: problem.id, refKey: refKey, isNewProblem: isNewProblem, isNewRef: isNewRef, errors: [], warnings: v.warnings };
  }

  /** Pull the JSON block out of an issue or email body. */
  function extractSubmission(body) {
    var m = /```json\s*([\s\S]*?)```/.exec(str(body));
    if (!m) {
      var i = str(body).indexOf('{"version"');
      if (i < 0) throw new Error('No submission data found. Expected a ```json block.');
      m = [null, str(body).slice(i, str(body).lastIndexOf('}') + 1)];
    }
    try { return JSON.parse(m[1]); }
    catch (e) { throw new Error('The submission data is not valid JSON: ' + e.message); }
  }

  return {
    RESULT_TYPES: RESULT_TYPES,
    plain: plain,
    slugify: slugify,
    validate: validate,
    applySubmission: applySubmission,
    extractSubmission: extractSubmission,
    findProblem: findProblem,
    makeRefKey: makeRefKey,
    findExistingRef: findExistingRef
  };
});
