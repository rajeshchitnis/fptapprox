/* Editors' page: review pending submissions (GitHub issues) and approve or reject them. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var C = FPT.CONFIG, API = 'https://api.github.com/repos/' + C.owner + '/' + C.repo;
  var TOKEN_KEY = 'fptapprox-editor-token';
  var token = FPT.store.get(TOKEN_KEY) || '';
  var me = null, canWrite = false, data = null, issues = {};

  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(path.indexOf('http') === 0 ? path : API + path, {
      method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store'
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error(j && j.message ? j.message : 'GitHub returned ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ---------- sign-in ---------- */
  var TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

  function renderAuth(msg) {
    var b = $('#auth-body');
    if (me && canWrite) {
      b.innerHTML = '<div class="signed-in"><img class="avatar" alt="" src="' + FPT.esc(me.avatar_url) + '"><span>Signed in as <b>' + FPT.esc(me.login) + '</b>. You can approve and reject submissions.</span>' +
        '<button type="button" class="btn btn-small" id="signout">Sign out on this device</button></div>';
      return;
    }
    b.innerHTML = (msg ? '<div class="notice ' + (msg.type || 'err') + '"><p>' + msg.text + '</p></div>' : '') +
      '<p class="fieldset-help">Anyone can see pending submissions. To approve or reject them, sign in with a GitHub access token for an account that can manage <b>' + FPT.esc(C.owner + '/' + C.repo) + '</b>. The token is kept only in this browser.</p>' +
      '<details' + (token ? '' : ' open') + '><summary><b>How to get a token (once, about a minute)</b></summary><ol class="steps">' +
      '<li>Open <a href="' + TOKEN_URL + '" target="_blank" rel="noopener">GitHub → New fine-grained token</a> while signed in to GitHub.</li>' +
      '<li>Name it <i>fptapprox editor</i>. Choose an expiration (1 year is fine).</li>' +
      '<li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick <b>' + FPT.esc(C.repo) + '</b>.</li>' +
      '<li>Under <b>Permissions → Repository permissions</b>, set <b>Issues</b> to <b>Read and write</b>.</li>' +
      '<li>Click <b>Generate token</b>, copy it, and paste it below.</li></ol></details>' +
      '<div class="field" style="margin-top:1rem"><label for="token">Access token</label><div class="inline-group">' +
      '<input id="token" type="password" autocomplete="off" placeholder="github_pat_…" value="' + FPT.esc(token) + '"><button type="button" class="btn btn-primary" id="signin">Sign in</button></div></div>';
  }

  function verify() {
    if (!token) { me = null; canWrite = false; renderAuth(); return Promise.resolve(); }
    return api('https://api.github.com/user').then(function (u) {
      me = u;
      return api('').then(function (repo) {
        var p = repo.permissions;
        // a missing permissions block means GitHub didn't report it; let GitHub decide on each action
        canWrite = !p || !!(p.admin || p.maintain || p.push || p.triage);
        if (!canWrite) throw new Error('The account ' + u.login + ' can view this repository but cannot manage its issues. Ask the repository owner to add it as a collaborator.');
      });
    }).then(function () { renderAuth(); }).catch(function (e) {
      me = null; canWrite = false;
      renderAuth({ text: e.status === 401 ? 'GitHub did not accept that token. It may have expired or been copied incompletely. Create a new one with the steps below.' : FPT.esc(e.message) });
    });
  }

  /* ---------- rendering a submission ---------- */
  function previewHtml(sub, opts) {
    opts = opts || {};
    var v = FPTApply.validate(sub, data);
    var h = '';
    if (v.errors.length) h += '<div class="notice err"><p><b>Can\'t be published yet.</b> Fix these by editing the issue on GitHub (the JSON block), or reject it with a note:</p><ul>' + v.errors.map(function (e) { return '<li>' + FPT.esc(e) + '</li>'; }).join('') + '</ul></div>';
    if (v.warnings.length) h += '<div class="notice warn"><p><b>Check before approving:</b></p><ul>' + v.warnings.map(function (e) { return '<li>' + FPT.esc(e) + '</li>'; }).join('') + '</ul></div>';
    var p = sub.paper || {};
    h += '<dl class="kv">' +
      '<dt>Paper</dt><dd>' + FPT.rich(p.title || '', null) + (p.url ? ' <a href="' + FPT.esc(p.url) + '" target="_blank" rel="noopener">Open the paper</a>' : '') + '</dd>' +
      '<dt>Authors</dt><dd>' + FPT.esc((p.authors || []).join(', ')) + '</dd>' +
      '<dt>Venue</dt><dd>' + FPT.esc([p.venue, p.year].filter(Boolean).join(', ')) + '</dd>' +
      (sub.submitter && (sub.submitter.name || sub.submitter.affiliation) ? '<dt>Submitted by</dt><dd>' + FPT.esc([sub.submitter.name, sub.submitter.affiliation].filter(Boolean).join(', ')) + (opts.login ? ' (GitHub: ' + FPT.esc(opts.login) + ')' : '') + '</dd>' : (opts.login ? '<dt>Submitted by</dt><dd>GitHub user ' + FPT.esc(opts.login) + '</dd>' : '')) +
      (sub.comments ? '<dt>Note</dt><dd>' + FPT.esc(sub.comments) + '</dd>' : '') +
      '</dl>';
    if (!v.errors.length) {
      var res = FPTApply.applySubmission(data, sub, { issue: opts.issue });
      var prob = FPTApply.findProblem(res.data, res.problemId);
      var n = sub.results.length, mark = [];
      for (var i = prob.results.length - n; i < prob.results.length; i++) mark.push(i);
      h += '<div><p class="fieldset-help" style="margin:0 0 0.5rem">' + (res.isNewProblem ? '<b>New problem.</b> ' : '<b>Adds to an existing problem.</b> ') +
        (res.isNewRef ? 'New reference [' + FPT.esc(res.refKey) + '].' : 'Cites existing reference [' + FPT.esc(res.refKey) + '].') + ' Proposed results are outlined.</p>' +
        FPT.renderProblem(prob, res.data, { preview: true, mark: mark, base: 'index.html' }) + '</div>';
    }
    return { html: h, ok: !v.errors.length };
  }

  function issueCard(issue) {
    var sub, err;
    try { sub = FPTApply.extractSubmission(issue.body); } catch (e) { err = e.message; }
    var labels = (issue.labels || []).map(function (l) { return l.name; });
    var publishing = labels.indexOf('approved') >= 0;
    var h = '<article class="sub-item" id="issue-' + issue.number + '"><header><h3>' + FPT.esc(issue.title.replace(/^\[Submission\]\s*/, '')) + '</h3>' +
      '<span class="meta">#' + issue.number + ', ' + FPT.esc(FPT.fmtDate(issue.created_at.slice(0, 10))) + ', by ' + FPT.esc(issue.user.login) + '</span>' +
      '<span class="spacer" style="flex:1"></span><a class="meta" href="' + FPT.esc(issue.html_url) + '" target="_blank" rel="noopener">Open on GitHub</a></header><div class="body">';
    var ok = false;
    if (err) h += '<div class="notice err"><p>' + FPT.esc(err) + '</p><p>The submission text may have been edited by hand. Open it on GitHub to fix the JSON block, or reject it.</p></div>';
    else { var pv = previewHtml(sub, { issue: issue.number, login: issue.user.login }); h += pv.html; ok = pv.ok; }
    h += '</div><div class="decision" data-issue="' + issue.number + '">';
    if (publishing) {
      h += '<span>Approved. Publishing now; this usually takes 1–2 minutes. <a href="' + C.repoUrl + '/actions" target="_blank" rel="noopener">Watch progress</a></span>';
    } else {
      var dis = canWrite ? '' : ' disabled title="Sign in above to approve"';
      h += '<button type="button" class="btn btn-approve" data-act="approve"' + (ok ? dis : ' disabled title="Fix the problems listed above first"') + '>Approve and publish</button>' +
        '<button type="button" class="btn" data-act="ask"' + dis + '>Ask the submitter</button>' +
        '<button type="button" class="btn btn-reject" data-act="reject"' + dis + '>Reject</button>' +
        '<span class="spacer"></span><a class="btn btn-small" href="' + FPT.esc(issue.html_url) + '" target="_blank" rel="noopener">Edit on GitHub</a>';
    }
    h += '</div></article>';
    return h;
  }

  function loadPending() {
    var el = $('#pending');
    return api('/issues?state=open&per_page=100&sort=created&direction=asc').then(function (list) {
      list = list.filter(function (i) { return !i.pull_request && /^\[Submission\]/i.test(i.title); });
      issues = {}; list.forEach(function (i) { issues[i.number] = i; });
      $('#t-pending').textContent = 'Pending (' + list.length + ')';
      if (!list.length) {
        el.innerHTML = '<div class="empty-state"><h3>Nothing to review</h3><p>New submissions appear here as soon as they are sent. Emailed submissions can be added from the <b>Add an emailed submission</b> tab.</p></div>';
        return;
      }
      el.innerHTML = list.map(issueCard).join('');
      FPT.typeset(el);
    }).catch(function (e) {
      el.innerHTML = '<div class="notice err"><p>Couldn\'t load submissions from GitHub: ' + FPT.esc(e.message) + '</p>' +
        (e.status === 403 ? '<p>GitHub limits anonymous requests to 60 an hour. Signing in raises the limit.</p>' : '') + '</div>';
    });
  }

  function loadDone() {
    var el = $('#done');
    api('/issues?state=closed&per_page=30&sort=updated&direction=desc').then(function (list) {
      list = list.filter(function (i) { return !i.pull_request && /^\[Submission\]/i.test(i.title); });
      if (!list.length) { el.innerHTML = '<p class="fieldset-help">No handled submissions yet.</p>'; return; }
      el.innerHTML = '<ul class="refs">' + list.map(function (i) {
        var names = (i.labels || []).map(function (l) { return l.name; });
        var st = names.indexOf('published') >= 0 ? 'Published' : names.indexOf('rejected') >= 0 ? 'Rejected' : 'Closed';
        return '<li class="ref"><span class="key">' + st + '</span><div><a href="' + FPT.esc(i.html_url) + '" target="_blank" rel="noopener">' + FPT.esc(i.title.replace(/^\[Submission\]\s*/, '')) + '</a><div class="links"><span>#' + i.number + ', closed ' + FPT.esc(FPT.fmtDate((i.closed_at || '').slice(0, 10))) + '</span></div></div></li>';
      }).join('') + '</ul>';
    }).catch(function (e) { el.innerHTML = '<div class="notice err"><p>' + FPT.esc(e.message) + '</p></div>'; });
  }

  /* ---------- actions ---------- */
  function approve(n, btnRow) {
    btnRow.innerHTML = '<span>Approving…</span>';
    return api('/issues/' + n + '/labels', { method: 'POST', body: { labels: ['approved'] } }).then(function () {
      btnRow.innerHTML = '<span><b>Approved.</b> Publishing now; the entry appears on the site in 1–2 minutes and the submitter is notified. <a href="' + C.repoUrl + '/actions" target="_blank" rel="noopener">Watch progress</a></span>';
    }).catch(function (e) { btnRow.innerHTML = '<span class="notice err">Approval failed: ' + FPT.esc(e.message) + '</span>'; });
  }

  function openForm(row, kind) {
    var n = row.getAttribute('data-issue');
    var reject = kind === 'reject';
    row.innerHTML = '<div style="flex:1;min-width:16rem"><label class="label" for="msg-' + n + '"><b>' + (reject ? 'Reason for rejecting (sent to the submitter)' : 'Your question (posted on the submission; the submitter is notified)') + '</b></label>' +
      '<textarea id="msg-' + n + '" style="margin-top:0.4rem">' + (reject ? 'Thanks for the submission. We are not adding it because ' : '') + '</textarea>' +
      '<div style="display:flex;gap:0.5rem;margin-top:0.5rem"><button type="button" class="btn ' + (reject ? 'btn-reject' : 'btn-primary') + '" data-act="' + (reject ? 'reject-send' : 'ask-send') + '">' + (reject ? 'Reject and notify' : 'Post question') + '</button>' +
      '<button type="button" class="btn" data-act="cancel">Cancel</button></div></div>';
    $('textarea', row).focus();
  }

  function sendMessage(row, reject) {
    var n = row.getAttribute('data-issue');
    var text = $('textarea', row).value.trim();
    if (!text) { $('textarea', row).focus(); return; }
    row.innerHTML = '<span>Sending…</span>';
    var p = api('/issues/' + n + '/comments', { method: 'POST', body: { body: text } });
    if (reject) p = p.then(function () { return api('/issues/' + n + '/labels', { method: 'POST', body: { labels: ['rejected'] } }); })
      .then(function () { return api('/issues/' + n, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } }); });
    p.then(function () {
      row.innerHTML = '<span>' + (reject ? '<b>Rejected.</b> The submitter has been notified.' : '<b>Question posted.</b> The submission stays here until you decide.') + '</span>';
    }).catch(function (e) { row.innerHTML = '<span class="notice err">Failed: ' + FPT.esc(e.message) + '</span>'; });
  }

  /* ---------- emailed submissions ---------- */
  var emailSub = null;
  function parseEmail() {
    var out = $('#email-out'), text = $('#email-text').value;
    try { emailSub = FPTApply.extractSubmission(text); }
    catch (e) { emailSub = null; out.innerHTML = '<div class="notice err"><p>' + FPT.esc(e.message) + '</p><p>Make sure you pasted the whole email, including the part between <code>```json</code> and <code>```</code>.</p></div>'; return; }
    var pv = previewHtml(emailSub);
    out.innerHTML = '<div class="sub-item"><div class="body">' + pv.html + '</div><div class="decision">' +
      '<button type="button" class="btn btn-approve" id="email-publish"' + (pv.ok && canWrite ? '' : ' disabled') + '>Publish</button>' +
      '<span class="fieldset-help" style="margin:0">' + (canWrite ? 'This records the submission on GitHub and publishes it.' : 'Sign in above to publish.') + '</span></div></div>';
    FPT.typeset(out);
  }

  function publishEmail() {
    var row = $('#email-out .decision');
    row.innerHTML = '<span>Publishing…</span>';
    var name = emailSub.problem.id ? (FPTApply.findProblem(data, emailSub.problem.id) || {}).name : emailSub.problem.name;
    var title = '[Submission] ' + FPTApply.plain(name || '') + ': ' + FPTApply.plain(emailSub.paper.title).slice(0, 70);
    var body = 'Received by email and added by an editor.\n\n<details><summary>Submission data</summary>\n\n```json\n' + JSON.stringify(emailSub, null, 2) + '\n```\n</details>';
    api('/issues', { method: 'POST', body: { title: title, body: body } }).then(function (iss) {
      return api('/issues/' + iss.number + '/labels', { method: 'POST', body: { labels: ['approved'] } }).then(function () { return iss; });
    }).then(function (iss) {
      row.innerHTML = '<span><b>Publishing.</b> Recorded as <a href="' + FPT.esc(iss.html_url) + '" target="_blank" rel="noopener">#' + iss.number + '</a>; the entry appears on the site in 1–2 minutes.</span>';
      $('#email-text').value = '';
    }).catch(function (e) { row.innerHTML = '<span class="notice err">Failed: ' + FPT.esc(e.message) + '</span>'; });
  }

  /* ---------- wiring ---------- */
  function selectTab(id) {
    $$('.tabs [role=tab]').forEach(function (t) {
      var on = t.id === id; t.setAttribute('aria-selected', String(on));
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    if (id === 't-done') loadDone();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#repo-link').href = C.repoUrl;
    $('#actions-link').href = C.repoUrl + '/actions';
    $('#edit-link').href = C.repoUrl + '/edit/' + C.branch + '/data/compendium.json';
    renderAuth();

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'signin') {
        token = $('#token').value.trim();
        FPT.store.set(TOKEN_KEY, token);
        verify().then(loadPending);
      }
      if (t.id === 'signout') { token = ''; FPT.store.del(TOKEN_KEY); me = null; canWrite = false; renderAuth(); loadPending(); }
      if (t.closest('.tabs [role=tab]')) selectTab(t.closest('[role=tab]').id);
      if (t.id === 'email-parse') parseEmail();
      if (t.id === 'email-publish') publishEmail();
      var act = t.getAttribute && t.getAttribute('data-act');
      if (!act) return;
      var row = t.closest('.decision'), n = row && row.getAttribute('data-issue');
      if (act === 'approve') approve(n, row);
      if (act === 'reject' || act === 'ask') openForm(row, act);
      if (act === 'reject-send') sendMessage(row, true);
      if (act === 'ask-send') sendMessage(row, false);
      if (act === 'cancel') loadPending();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'token') $('#signin').click(); });

    FPT.loadData().then(function (d) { data = d; return verify(); }).then(loadPending)
      .catch(function (e) { $('#pending').innerHTML = '<div class="notice err"><p>' + FPT.esc(e.message) + '</p></div>'; });
  });
})();
