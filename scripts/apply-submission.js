// Merges an approved submission (a GitHub issue) into data/compendium.json.
// Run by .github/workflows/publish-submission.yml. Uses the same logic as the
// editors' preview (assets/apply.js), so what was previewed is what gets published.
'use strict';
const fs = require('fs');
const path = require('path');
const FPTApply = require('../assets/apply.js');

const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data', 'compendium.json');
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;

function out(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<__EOF__\n${value}\n__EOF__\n`);
}

function fail(msg) {
  fs.writeFileSync(path.join(root, '.publish-error.md'),
    `Publishing failed: ${msg}\n\nFix the submission (edit the JSON block in this issue), then add the \`approved\` label again, or use the editors' page.`);
  console.error(msg);
  process.exit(1);
}

let sub;
try { sub = FPTApply.extractSubmission(issue.body || ''); } catch (e) { fail(e.message); }

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const res = FPTApply.applySubmission(data, sub, { issue: issue.number, date: new Date().toISOString().slice(0, 10) });
if (res.errors && res.errors.length) fail(res.errors.join(' '));

fs.writeFileSync(dataPath, JSON.stringify(res.data, null, 2) + '\n');

const site = process.env.SITE_URL || '';
const problem = FPTApply.findProblem(res.data, res.problemId);
const msg = [
  `Published, thank you! This is now part of the compendium${site ? `: ${site}#${res.problemId}` : '.'}`,
  '',
  `- Problem: **${FPTApply.plain(problem.name)}**${res.isNewProblem ? ' (new)' : ''}`,
  `- Cited as **[${res.refKey}]**${res.isNewRef ? ' (new reference)' : ''}`,
  `- Results added: ${sub.results.length}`,
  '',
  'The site can take a minute or two to show the change.'
].join('\n');
fs.writeFileSync(path.join(root, '.publish-success.md'), msg);
out('problem_id', res.problemId);
out('ref_key', res.refKey);
console.log(msg);
