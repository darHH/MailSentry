# SentryDomain — Project Context

> **Session ritual:** Start every session by reading `CONTEXT.md` (this file) and `TODO.md`.
> CONTEXT.md = the *why* and *what* (self-contained brief + living state). TODO.md = the *do* (phased task list).
> Update the **Current Status** section at the bottom of this file at the end of every session.

---

## 1. One-liner & problem framing

**SentryDomain is a Chrome extension that lives inside Gmail and makes email scams impossible to miss at the exact moment a payment decision is made.**

The scenario it defends:
- **Who:** the sole finance/ops person at a Singapore SME — no IT department, runs invoices over Gmail.
- **Moment:** Friday 4pm, an "urgent" email from a *known supplier* asks to update bank details before Monday's payment run.
- **Why it fails:** the email looks completely normal; the attack lives in a one-character domain difference (e.g. `acme-supplies.com` vs `acrne-supplies.com`) that a human can't spot under time pressure.
- **Root cause:** perception failure + urgency pressure at the decision moment. No tool exists *there*.
- **Wedge:** make the mismatch impossible to miss at the one moment it matters — before the payment is touched.

> **This isn't a detection problem. It's a perception problem.** SME finance staff aren't failing to detect fraud — they're succeeding at reading a convincing email. The fix is intercepting at the exact moment a human misses what a machine catches in a millisecond.

---

## 2. How it works

A Chrome extension that lives inside Gmail — no new tab, no dashboard.

1. Parses **sender domain, body text, links, attachments, and QR codes** from every opened email.
2. Runs **five independent checks** and combines them into one **composite risk score** (0–1).
3. Injects a **red/green banner** directly into the Gmail UI *before* the user acts.
4. **One-click Verify** surfaces the supplier's on-file phone number for an out-of-band call.
5. **Fully client-side** — no email content leaves the device (only URLs go to the Safe Browsing API).

The five checks:

| Check | What it does | Weight |
|---|---|---|
| Sender/Domain | Composite of 3 sub-signals (see below); `domainScore = max` of the three | 0.40 |
| Urgency | Weighted keyword density in subject + body (fraud psychology) | 0.25 |
| Link safety | Google Safe Browsing result on extracted URLs (max across all links) | 0.20 |
| Attachment | Binary: attachment present on a payment-instruction email → 0.5, else 0 | 0.10 |
| QR code | Decoded QR URL passed through the same link scanner | 0.05 |

**Sender/Domain sub-signals** (the 0.40 weight is the *max* of these — any one firing high flags the email):

1. **Lookalike (Levenshtein).** Fuzzy-match sender domain against known-vendor domains; a near-match (1–2 char diff) = lookalike attack (e.g. `acme.com` vs `acrne.com`).
2. **Display-name vs email mismatch.** Compare the sender's *display name* against its *actual email address*. If the display name claims a known vendor/brand but the address domain is unrelated (e.g. `"Acme Supplies" <random123@gmail.com>`), flag. Catches the case where the address itself isn't a lookalike — the attacker just sets a convincing display name on a throwaway inbox.
3. **Allowlist mode (optional, user toggle).** When enabled, *only* senders matching a whitelisted **domain suffix** (e.g. `@acme.com`, `@*.acme.com`) **or** an explicit whitelisted **email address** pass. Any sender outside the allowlist scores high. This is a strict opt-in mode for finance users who only ever correspond with a known set of suppliers — flips the model from "flag the suspicious" to "flag everything not pre-approved."

> Allowlist mode and the seeded vendor whitelist are stored in `chrome.storage.local` and managed from the popup. Allowlist mode defaults **off** (lookalike + display-name checks always run regardless).

---

## 3. Privacy & legal model

**What is read from Gmail (locally):**
- Sender email address and domain
- Subject line
- Body text (urgency keyword scan only — not stored, not transmitted)
- URLs in the body
- Attachment presence and type
- QR code images (decoded to extract URL)

**What leaves the device:**

| Data | Destination & why |
|---|---|
| Extracted URLs (body + QR) | Google Safe Browsing API — check against known phishing/malware. **URL only, no email context.** |
| Sender domain pair (suspicious vs known) — *optional* | OpenAI GPT-4o — **only if the AI explanation feature is enabled.** Domain string only, no email content. |
| Nothing else | All other processing (Levenshtein, urgency, attachment) is local. Email content never leaves the device. |

**Why client-side is the legal superpower:**
- Never store/transmit/process email content on a server → eliminates PDPA, GDPR, and Gmail ToS exposure.
- Only external calls are URL reputation (Safe Browsing) + optional domain-pair explanation (GPT-4o) — both minimal, non-identifying.
- Pitch line: *"We designed client-side processing specifically so an SME never has to trust us with their inbox."*
- Post-hackathon: publish privacy policy page, complete Chrome Web Store data disclosure, PDPA registration if commercialising.

**Consent screen (required — fires on first install, also a demo trust moment).** One screen, one checkbox, one confirm button. Exact copy:

```
• SentryDomain reads your Gmail emails (sender, subject, body, links, attachments) to check for scam indicators
• Email content is processed locally on your device — it never leaves your machine
• URLs found in emails are sent to Google Safe Browsing for safety checking
• Optional: if GPT-4o is enabled, sender domain pairs are sent to OpenAI (no email content)

[ ] I understand and agree  →  [Enable SentryDomain]
```
Plus a link to a privacy policy page (a simple GitHub Pages doc is fine for the hackathon).

---

## 4. Tech stack

No backend. No auth. No database. Everything client-side except URL reputation lookups.

| Layer | Choice + reason |
|---|---|
| Extension shell | Chrome Extension **MV3**. Load unpacked for demo — zero deployment friction. |
| Language | **Vanilla JS.** No build step, instant reload, easy to debug live. |
| Styling | Polished banner UI. **See open decision #1 — Tailwind CDN does NOT work under MV3 CSP.** Leaning toward inline scoped CSS inside a Shadow DOM. |
| Sender/Domain check | **Levenshtein distance** (~20 lines) for lookalike, plus display-name↔email mismatch and optional allowlist mode. Composed in `domainCheck.js`; unit-test all three before touching Gmail DOM. |
| Urgency scoring | Keyword list + weighted sum. Judges understand it without an ML explanation. |
| Link safety | **Google Safe Browsing Lookup API v4** — free, fast, no rate-limit issues for demo. |
| Attachment check | Parse email DOM for attachment indicators. Binary risk signal. |
| QR extraction | **jsQR** (pure JS, ~50KB, no backend) — scans `<img>` tags, decodes QR, extracts URL → link scanner. |
| Composite score | `risk.js` — weighted formula → single 0–1 score shown in banner. |
| Whitelist storage | `chrome.storage.local`, JSON. 5 seeded vendors for demo. Also holds allowlist-mode toggle + allowed domain suffixes + allowed emails. |
| AI layer (stretch) | OpenAI **GPT-4o** — one call per flagged email, domain pair only, plain-English explanation. Core works without it. |
| Demo data | 2 hardcoded test emails (one clean, one lookalike). |

---

## 5. Composite score formula

```js
// All scores normalised 0–1. Weights sum to 1.0.
const compositeScore = (
  domainScore     * 0.40 +   // max of: lookalike (Levenshtein) | display-name↔email mismatch | allowlist-mode violation
  urgencyScore    * 0.25 +   // Weighted keyword density in subject + body
  linkScore       * 0.20 +   // Google Safe Browsing result on extracted URLs (max across all links)
  attachmentScore * 0.10 +   // Binary: attachment present on payment-instruction email → 0.5, else 0
  qrScore         * 0.05     // Extracted QR URL passed through same link scanner
);

// Threshold: score >= 0.3 → red banner. Below → green check.
// Show score and per-signal breakdown in banner tooltip.
```

Google Safe Browsing call (free API; key at console.cloud.google.com → Safe Browsing API):

```js
const checkUrl = async (url, apiKey) => {
  const res = await fetch(
    `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'sentrydomain', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }]
        }
      })
    }
  );
  const data = await res.json();
  return data.matches && data.matches.length > 0 ? 1.0 : 0.0;
};
```

---

## 6. File structure (target)

```
sentryDomain/
  manifest.json                  permissions: storage, activeTab, scripting, *://*.mail.google.com/*
  content.js                     Gmail DOM parser + orchestrator (calls all checks, injects banner)
  background.js                  seed storage on install
  onboarding.html / onboarding.js  first-run consent screen
  popup.html / popup.js          whitelist manager + API key settings
  utils/
    levenshtein.js               domain fuzzy-match helper (pure)
    domainCheck.js               sender/domain score: lookalike + display-name mismatch + allowlist mode
    urgency.js                   keyword list + weighted scorer
    linkScanner.js               Google Safe Browsing API call
    attachmentCheck.js           DOM parse for attachments
    qrExtractor.js               jsQR decode + pass to linkScanner
    risk.js                      composite score formula
    openai.js                    GPT-4o explain() — optional/stretch
  demo/seed.json                 5 vendors: { name, domain, phone }
  README.md                      setup instructions for judges
```

---

## 7. Decisions made

| Topic | Decision |
|---|---|
| Timeline | ~1 week |
| Task structure | Modular tasks, **no owner tags** — anyone picks up any unblocked task |
| API keys | **None acquired yet** — build stub-first, wire real keys later (Phase 0 acquisition tasks) |
| GPT-4o AI layer | **Stretch only** — after the core 5 checks are solid |
| File names/location | Root: `TODO.md` + `CONTEXT.md` |
| Testing | **Lightweight, no framework** — plain JS asserts, run in node or browser console, zero deps |

---

## 8. Open decisions (resolve early — flagged in TODO Phase 0)

1. **Banner styling.** Spec said "Tailwind CDN injected into banner," but **MV3 content scripts cannot load remote CDN scripts (CSP).** Recommendation: inline scoped CSS inside a Shadow DOM. Decide before Phase 3.
2. **Demo mode.** How the demo runs during judging — *deferred by user, decide later*:
   - Real Gmail + seeded test emails (most authentic, DOM-dependent)
   - Real Gmail + hardcoded fallback toggle (resilient)
   - Fully hardcoded demo (bulletproof, less authentic)

---

## 9. Known technical risks

- **MV3 CSP vs Tailwind CDN** — remote CDN scripts blocked in content scripts. → drives open decision #1. Use inline/Shadow DOM CSS.
- **Gmail DOM brittleness** — selectors break on Gmail updates. Isolate all parsing in `content.js` behind small helper functions so breakage is contained to one file.
- **jsQR tainted canvas** — remote email images may be CORS-tainted, blocking canvas pixel reads needed for QR decode. May need an image-fetch workaround.
- **Safe Browsing key exposure** — key lives client-side. Restrict by API + referrer in the Google console. Acceptable for demo.
- **Banner CSS collisions** — Gmail's styles bleed into injected DOM. Shadow DOM mitigates.

---

## 10. Current status — where we left off

**Last updated:** 2026-06-25 (bootstrap session)

- ✅ Project scoped. CONTEXT.md + TODO.md created.
- ⬜ No code written yet. Repo contains only these two docs.
- ⬜ No API keys acquired.

**Next step:** Start **TODO Phase 0 — Scaffold & prerequisites** (file tree, `manifest.json`, `.gitignore`, README skeleton, acquire Safe Browsing key). Also resolve open decision #1 (banner styling) before Phase 3.

> When you finish a work session, update this section: what got done, what's in progress, and the single clearest "next step."
