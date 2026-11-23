# FPT Approximation Compendium

A community-maintained list of parameterized (FPT) approximation algorithms and lower bounds.

**Live site:** https://rajeshchitnis.github.io/fptapprox/

## How it works

| Page | What it does |
| --- | --- |
| `index.html` | Browse: search, filter by tags and status, permalinks, references, BibTeX export |
| `submit.html` | Submission form with a live preview. Sends a pre-filled GitHub issue, or an email to fptapprox@gmail.com |
| `admin.html` | Editors' page: preview each pending submission, then approve, ask a question, or reject |
| `about.html` | Scope, how review works, editor guide |
| `legacy/` | The original 2019 list from fptapprox.github.io, unchanged |

All content is in **`data/compendium.json`**. When an editor approves a submission, the workflow
`.github/workflows/publish-submission.yml` merges it into that file, commits it, comments on the
issue and closes it. Approval works from the editors' page, or by adding the `approved` label to the issue on GitHub.

`scripts/apply-submission.js` runs the merge; `assets/apply.js` holds the validation and merge logic. The same file runs in the submission form, the editors'
preview and the workflow, so the previews always match what gets published.

## One-time setup

1. **Turn on GitHub Pages:** go to *Settings → Pages → Build and deployment*, set *Source* to **Deploy from a branch**,
   choose `main` and `/ (root)`, then click **Save**.
2. **Editors:** each editor creates a fine-grained token (the editors' page explains how) with *Issues: Read and write*
   on this repository. To add another editor, add their GitHub account under *Settings → Collaborators*.

If publishing ever fails with a permissions error, go to *Settings → Actions → General → Workflow permissions*,
choose **Read and write permissions**, then click **Save**.

## Editing entries by hand

Edit `data/compendium.json` on GitHub. Inside the JSON, backslashes are doubled (`\\(k\\)`).
Useful problem fields: `name`, `short` (abbreviation), `definition`, `parameter`, `tags`, `tight: true`,
and `results` (each with `type` set to `algorithm`, `lower-bound`, `special-case` or `note`, plus `statement` and `refs`).
