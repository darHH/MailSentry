# MailSentry

> A Chrome extension that lives inside Gmail and makes email scams impossible to miss at the moment a payment decision is made. Fully client-side — email content never leaves your machine.

---

## The problem

Picture a sole finance/ops person at a small business — no IT department, runs invoices over Gmail. Friday 4pm. An "urgent" email arrives from a *known supplier* asking to update bank details before Monday's payment run.

The email looks completely normal. The attack lives in a one-character domain difference (e.g. `acme-supplies.com` vs `acrne-supplies.com`) that a human can't spot under time pressure.

> **This isn't a detection problem. It's a perception problem.** Finance staff aren't failing to detect fraud — they're succeeding at reading a convincing email. The fix is intercepting at the exact moment a human misses what a machine catches in a millisecond.

MailSentry flags the email *inside Gmail*, right above the message, with a plain-language reason — so the warning lands at the exact moment the decision is made.

## What it checks

Five signals, computed locally inside the browser:

| Signal | What it catches |
|---|---|
| **Sender / domain** | Levenshtein lookalikes of your saved vendors, display-name vs address mismatch, optional strict allowlist mode |
| **Urgency wording** | Weighted scam-keyword scoring of subject and body ("wire transfer", "act now", "final notice", etc.) |
| **Links** | Every URL in the body is checked against Google Safe Browsing |
| **Attachments** | Attachment present on a payment-instruction email → flagged |
| **QR codes** | Decoded QR URLs run through the same Safe Browsing check *(decoder currently stubbed — see [`TODO.md`](./TODO.md))* |

A Safe Browsing match on any link or QR forces a red verdict (Google's blocklist has near-zero false positives, so it overrides the heuristics). Otherwise a weighted sum of the three heuristic signals (domain 0.55, urgency 0.30, attachment 0.15) decides red vs green at a 0.30 threshold.

The banner shows the verdict, the single biggest reason, and a per-check breakdown in plain English — no jargon, no percentages.

## Privacy

- **No backend.** No MailSentry server. No analytics. No accounts. No telemetry.
- **The only data that ever leaves your device** is URLs extracted from the email body and from QR codes — sent to the **Google Safe Browsing API** for reputation lookup (URL only, no email context). Requires you to provide your own Safe Browsing key in the popup; without a key, no URLs are sent.
- Everything else (sender comparison, urgency keyword scan, attachment heuristic, QR decode) happens locally in your browser and never leaves the machine.
- Full data flow in [`mailsentry/privacy.html`](./mailsentry/privacy.html) (bundled in the extension).

## Install

```
1. chrome://extensions
2. Toggle "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the mailsentry/ folder (not the repo root)
5. First-run consent screen opens — accept it
6. (Optional) Open the popup → paste a Google Safe Browsing API key to enable live link scanning
```

Full step-by-step with screenshots-in-prose in [`SETUP.md`](./SETUP.md).

## Repo layout

```
.
├── mailsentry/         the Chrome extension (load-unpacked target)
│   ├── manifest.json   MV3, content scripts, icons, web_accessible_resources
│   ├── background.js   onInstalled seed of vendors/allowlist/settings
│   ├── content.js      Gmail DOM scrape + orchestrator + Shadow-DOM banner
│   ├── popup.html/js   whitelist manager, allowlist toggle, Safe Browsing key
│   ├── onboarding.html consent screen (first install)
│   ├── privacy.html    bundled privacy policy
│   ├── icons/          Twemoji shield, 16/32/48/128 px
│   └── utils/          pure-JS scoring modules + zero-dep unit tests
├── CONTEXT.md          full project brief, decisions, current state
├── TODO.md             phased task list
└── SETUP.md            Chrome setup walkthrough
```

## Tests

Each `utils/*.js` module ships with a zero-dependency `*.test.js` runnable in Node:

```bash
for t in mailsentry/utils/*.test.js; do node "$t"; done
```

103+ assertions across 7 suites, no framework, no install step.

## Status

Phase 0–4 done. Phase 5 (demo prep — 2 test emails, judge-ready README section, rehearsal) outstanding. See [`TODO.md`](./TODO.md) for the live list and what was deliberately skipped (LLM explain layer, heuristic content check, import/export trusted contacts, jsQR wire-up) with reasoning recorded in-line.
