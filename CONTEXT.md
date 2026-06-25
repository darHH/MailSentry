# MailSentry — Project Context

> **Session ritual:** Start every session by reading `CONTEXT.md` (this file) and `TODO.md`.
> CONTEXT.md = the *why* and *what* (self-contained brief + living state). TODO.md = the *do* (phased task list).
> Update the **Current Status** section at the bottom of this file at the end of every session.

---

## 1. One-liner & problem framing

**MailSentry is a Chrome extension that lives inside Gmail and makes email scams impossible to miss at the exact moment a payment decision is made.**

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

1. **Lookalike (Levenshtein), adaptive granularity.** Fuzzy-match the sender against known vendors; a 1–2 char near-match = lookalike attack. Granularity depends on how the vendor is stored:
   - Vendor stored as a **domain** (`acme-supplies.com`) → compare *registrable domains* → catches lookalike-domain BEC (`acme.com` vs `acrne.com`). This is the primary B2B threat.
   - Vendor stored as a **full email** (`wnaya@rocketmail.com`, in the email or domain field) → compare *whole addresses* → catches *username* impersonation on shared/freemail domains (`wnaya@` vs `wnayar@rocketmail.com`).
   - Rationale: B2B fraud spoofs the company (domain); local-parts vary legitimately (`billing@`/`accounts@`), so domain-only is right there. Personal/freemail contacts share a domain and their identity is the local-part, so those need address-level. `domainCheck.vendorIdentity()` decides per vendor; an exact match (domain or address) is treated as the real sender → safe.
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
• MailSentry reads your Gmail emails (sender, subject, body, links, attachments) to check for scam indicators
• Email content is processed locally on your device — it never leaves your machine
• URLs found in emails are sent to Google Safe Browsing for safety checking
• Optional: if GPT-4o is enabled, sender domain pairs are sent to OpenAI (no email content)

[ ] I understand and agree  →  [Enable MailSentry]
```
Plus a link to a privacy policy page (a simple GitHub Pages doc is fine for the hackathon).

---

## 4. Tech stack

No backend. No auth. No database. Everything client-side except URL reputation lookups.

| Layer | Choice + reason |
|---|---|
| Extension shell | Chrome Extension **MV3**. Load unpacked for demo — zero deployment friction. |
| Language | **Vanilla JS.** No build step, instant reload, easy to debug live. |
| Styling | Polished banner UI. **Decision #1 RESOLVED — Tailwind CDN does NOT work under MV3 CSP.** Inline scoped CSS inside a Shadow DOM. Onboarding/popup already use inline `<style>`. |
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
        client: { clientId: 'mailsentry', clientVersion: '1.0' },
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
mailsentry/
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

1. ~~**Banner styling.**~~ **RESOLVED (2026-06-25):** inline scoped CSS inside a Shadow DOM. Tailwind CDN is blocked by MV3 content-script CSP, so the banner injects a Shadow root with self-contained styles to avoid Gmail CSS collisions. Locked before Phase 3.
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

**Last updated:** 2026-06-25 (build session 1)

- ✅ Project scoped. CONTEXT.md + TODO.md created.
- ✅ **Phase 0 scaffold done** — `mailsentry/` file tree, MV3 `manifest.json` (storage/activeTab/scripting + `*://*.mail.google.com/*`, content scripts in dependency order, popup, onboarding as options_page), root `.gitignore` (key/secret excludes), `README.md` (load-unpacked + test instructions), `demo/seed.json` (5 SG vendors).
- ✅ **Phase 1 pure utils ALL done + tested** (71 asserts, 0 fail): `levenshtein.js` (10), `domainCheck.js` (20 — lookalike + display-name mismatch + allowlist mode), `urgency.js` (8 — weighted keyword scorer, subject ×1.5, saturates at weight 8), `risk.js` (16 — composite 0.40/0.25/0.20/0.10/0.05, threshold ≥0.3), `attachmentCheck.js` (8), `linkScanner.js` (8 — stub-first, injected fetch), `qrExtractor.js` (9 — stub-first, tainted-canvas guarded).
- ✅ **Open decision #1 RESOLVED** → Shadow DOM + inline scoped CSS.
- ✅ **Safe Browsing key acquired** (user). Entered via popup → `chrome.storage.local.settings.safeBrowsingKey`, read by `linkScanner`. Never committed. OpenAI key (stretch) still optional/unset.
- ✅ **Phase 2 extension shell done** — `background.js` (idempotent `onInstalled` seed of vendors/allowlist/settings from `demo/seed.json`, opens onboarding on first install), `onboarding.html`+`onboarding.js` (consent screen, exact §3 copy, checkbox-gated Enable, persists `settings.consentAccepted`), `popup.html`+`popup.js` (vendor whitelist add/remove, allowlist-mode toggle + suffix/email managers, Safe Browsing + OpenAI key settings — all persisted to `chrome.storage.local`). All JS passes `node --check`; manifest + seed valid JSON.
- ✅ **Phase 3 Gmail integration code-complete** — `content.js`: all Gmail selectors isolated in one `SELECTORS` + `get*` helper "BRITTLE ZONE" block; orchestrator runs all 5 checks → `risk.compositeScore` (async for Safe Browsing); Shadow-DOM banner (red ≥0.3 / green) with `risk %`, a **plain-language "Why flagged?" breakdown** (one human sentence per check via `buildChecks()` — no jargon/percentages; problems first, then not-scanned, then passed; auto-opens when red; shows a "Main reason" = highest-contributing problem), and Verify button (matches sender to vendor by exact/lookalike/display-name → surfaces on-file phone). SPA-aware: `MutationObserver` + `hashchange`, debounced 350ms, dedupes by sender+subject. Orchestration verified offline (attack→red 70%, clean→green 0%).
- ⬜ **Phase 3 LIVE TUNING pending** — selectors (`h2.hP`, `span.gD[email]`, `div.a3s`, `span.aV3`) are best-effort; need confirming against real Gmail. If banner doesn't show, adjust the BRITTLE ZONE only.
- ⬜ Open decision #2 (demo mode) still deferred.

**Storage schema (set by background.js):** `vendors:[{name,domain,phone}]`, `allowlist:{enabled,suffixes[],emails[]}`, `settings:{safeBrowsingKey,openaiKey,consentAccepted}`. Content-script orchestrator (Phase 3) should read these and pass `vendors`/`allowlist` into `domainScore()` and `settings.safeBrowsingKey` into `linkScore()`.

**Util module pattern:** each util is a UMD-ish IIFE — attaches to a `Mail*` global (for content-script use) AND `module.exports` (for Node tests). Tests are zero-dep `*.test.js` plain asserts; run `node mailsentry/utils/<name>.test.js` or loop all with `for t in *.test.js; do node "$t"; done`. Network/DOM modules take injectable `fetch`/`jsQR`/`document` for testability.

**Next step:** **Live-test Phase 3 in Gmail.** Reload the unpacked extension (folder is `mailsentry/`), enter the Safe Browsing key in the popup, open an email. If the banner appears → tune thresholds / seed a lookalike test email (Phase 5). If it does NOT appear → open DevTools console on Gmail, check for `[MailSentry]` warnings, and fix selectors in the `content.js` BRITTLE ZONE (likely `span.gD[email]` or `div.a3s`). After that: Phase 5 demo prep (2 test emails: one clean, one lookalike attack) + resolve open decision #2.

> When you finish a work session, update this section: what got done, what's in progress, and the single clearest "next step."
