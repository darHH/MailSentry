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
4. The banner's **plain-language breakdown** names the real saved contact a lookalike sender is impersonating, prompting an out-of-band check. *(The earlier standalone "Verify" button was removed — its info now lives in the breakdown.)*
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
   - Vendor entry is a **domain** (`@acme-supplies.com`) → compare *registrable domains* → catches lookalike-domain BEC (`acme.com` vs `acrne.com`). This is the primary B2B threat.
   - Vendor entry is a **full email** (`wnaya@rocketmail.com`) → compare *whole addresses* → catches *username* impersonation on shared/freemail domains (`wnaya@` vs `wnayar@rocketmail.com`).
   - Rationale: B2B fraud spoofs the company (domain); local-parts vary legitimately (`billing@`/`accounts@`), so domain-only is right there. Personal/freemail contacts share a domain and their identity is the local-part, so those need address-level. `domainCheck.vendorScope()` (via `parseScopeEntry()`) decides per vendor; an exact match (domain or address) is treated as the real sender → safe.
2. **Display-name vs email mismatch.** Compare the sender's *display name* against its *actual email address*. The "brand" to match against is derived from each trusted contact's **domain** (`brandTokens()`, e.g. `@acme-supplies.com` → `acme`,`supplies`) — no separate vendor name is stored. If the display name claims that brand but the address domain is unrelated (e.g. `"Acme Supplies" <random123@gmail.com>`), flag. Catches the case where the address itself isn't a lookalike — the attacker just sets a convincing display name on a throwaway inbox.
3. **Allowlist mode (optional, user toggle).** When enabled, *only* senders matching an allowlist **entry** pass; any sender outside scores high. Entries use the same unified format as vendors (see below): `@acme.com` = the whole domain (and its subdomains), `jo@acme.com` = one exact address. Strict opt-in for finance users who only correspond with a known set — flips the model from "flag the suspicious" to "flag everything not pre-approved."

> **Unified entry format (vendors + allowlist).** One text box, one rule: a string starting with `@` is a **domain** entry (`@acme.com`); a string with text before the `@` is an **exact email** entry (`jo@acme.com`); a bare string with no `@` is treated as a domain. Parsed by `domainCheck.parseScopeEntry()`. For *vendors* the entry drives lookalike granularity (domain entry → compare domains; email entry → compare whole addresses). For the *allowlist* it drives pass/fail matching (domain entry → domain or subdomain match; email entry → exact-address match).

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
| Nothing else | All other processing (Levenshtein, urgency, attachment) is local. Email content never leaves the device. |

**Why client-side is the legal superpower:**
- Never store/transmit/process email content on a server → eliminates PDPA, GDPR, and Gmail ToS exposure.
- Only external call is URL reputation (Safe Browsing) — minimal, non-identifying.
- Pitch line: *"We designed client-side processing specifically so an SME never has to trust us with their inbox."*
- Post-hackathon: publish privacy policy page, complete Chrome Web Store data disclosure, PDPA registration if commercialising.

**Consent screen (required — fires on first install, also a demo trust moment).** One screen, one checkbox, one confirm button. Exact copy:

```
• MailSentry reads your Gmail emails (sender, subject, body, links, attachments) to check for scam indicators
• Email content is processed locally on your device — it never leaves your machine
• URLs found in emails are sent to Google Safe Browsing for safety checking

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
| Whitelist storage | `chrome.storage.local`, JSON. 5 seeded vendors for demo. Also holds allowlist-mode toggle + unified allowlist `entries` list. |
| Demo data | 2 hardcoded test emails (one clean, one lookalike). |

---

## 5. Composite score formula

Two-tier model:

```js
// Ground-truth override. Google Safe Browsing's blocklist has near-zero
// false-positive rate, so a hit on either a body link OR a decoded QR URL
// forces composite = 1.0 — heuristics can't vote it down.
const safeBrowsingHit = (linkScore >= 1.0) || (qrScore >= 1.0);

// Heuristic fallback. Weighted sum of the three heuristic signals only
// (link/qr live in the override above, not in this sum). Weights sum to 1.0.
const weightedSum = (
  domainScore     * 0.55 +   // max of: lookalike (Levenshtein) | display-name↔email mismatch | allowlist-mode violation
  urgencyScore    * 0.30 +   // Weighted keyword density in subject + body
  attachmentScore * 0.15     // Binary: attachment present on payment-instruction email → 0.5, else 0
);

const composite = safeBrowsingHit ? 1.0 : weightedSum;

// Threshold: composite >= 0.3 → red banner. Below → green check.
// Banner shows the verdict + per-signal breakdown rows; the numeric risk % is
// computed internally but no longer rendered in the banner UI (implementation
// detail with no calibration story — the red/green label + reasons carry the UX).
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
  privacy.html                   bundled privacy policy page (linked from onboarding)
  popup.html / popup.js          whitelist manager + API key settings
  utils/
    levenshtein.js               domain fuzzy-match helper (pure)
    domainCheck.js               sender/domain score: lookalike + display-name mismatch + allowlist mode
    urgency.js                   keyword list + weighted scorer
    linkScanner.js               Google Safe Browsing API call
    attachmentCheck.js           DOM parse for attachments
    qrExtractor.js               jsQR decode + pass to linkScanner
    risk.js                      composite score formula
  demo/seed.json                 5 vendors: { entry }
  README.md                      setup instructions for judges
```

---

## 7. Decisions made

| Topic | Decision |
|---|---|
| Timeline | ~1 week |
| Task structure | Modular tasks, **no owner tags** — anyone picks up any unblocked task |
| API keys | **None acquired yet** — build stub-first, wire real keys later (Phase 0 acquisition tasks) |
| LLM explain layer | **Removed (2026-06-26)** — `buildChecks()` already produces a plain-English row per check deterministically; an LLM would duplicate output, weaken the privacy pitch (POSTing email content to a third party), and add a demo-day failure mode. |
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
- ✅ **Safe Browsing key acquired** (user). Entered via popup → `chrome.storage.local.settings.safeBrowsingKey`, read by `linkScanner`. Never committed.
- ✅ **Phase 2 extension shell done** — `background.js` (idempotent `onInstalled` seed of vendors/allowlist/settings from `demo/seed.json`, opens onboarding on first install), `onboarding.html`+`onboarding.js` (consent screen, exact §3 copy, checkbox-gated Enable, persists `settings.consentAccepted`), `popup.html`+`popup.js` (vendor whitelist add/remove with a single unified entry box, allowlist-mode toggle + single unified entry list, Safe Browsing key setting — all persisted to `chrome.storage.local`). All JS passes `node --check`; manifest + seed valid JSON.
- ✅ **Phase 3 Gmail integration code-complete** — `content.js`: all Gmail selectors isolated in one `SELECTORS` + `get*` helper "BRITTLE ZONE" block; orchestrator runs all 5 checks → `risk.compositeScore` (async for Safe Browsing); Shadow-DOM banner (red ≥0.3 / green) with `risk %`, a **plain-language "Why flagged?" breakdown** (one human sentence per check via `buildChecks()` — no jargon/percentages; problems first, then not-scanned, then passed; auto-opens when red; shows a "Main reason" = highest-contributing problem; lookalike rows name the impersonated saved contact via `matchVendor()`). No standalone Verify button (removed). SPA-aware: `MutationObserver` + `hashchange`, debounced 350ms, dedupes by sender+subject. Orchestration verified offline (attack→red 70%, clean→green 0%).
- ✅ **Phase 3 LIVE TUNING done (2026-06-26)** — selectors (`h2.hP`, `span.gD[email]`, `div.a3s`, `span.aV3`) confirmed against real Gmail; banner renders correctly. No BRITTLE ZONE changes needed.
- ⬜ Open decision #2 (demo mode) still deferred.

**Storage schema (set by background.js):** `vendors:[{entry}]` (entry = `@domain` or `email`; no name field — legacy `{name,domain}`/`{email}` still read), `allowlist:{enabled,entries[]}` (legacy `suffixes`/`emails` auto-migrated on read), `settings:{safeBrowsingKey,consentAccepted}`. Content-script orchestrator passes `vendors`/`allowlist` into `domainScore()` and `settings.safeBrowsingKey` into `linkScore()`. Entry parsing is centralised in `domainCheck.parseScopeEntry()` / `vendorScope()`.

**Util module pattern:** each util is a UMD-ish IIFE — attaches to a `Mail*` global (for content-script use) AND `module.exports` (for Node tests). Tests are zero-dep `*.test.js` plain asserts; run `node mailsentry/utils/<name>.test.js` or loop all with `for t in *.test.js; do node "$t"; done`. Network/DOM modules take injectable `fetch`/`jsQR`/`document` for testability.

**Next step:** Phase 3 fully done (live tuning confirmed 2026-06-26). **Phase 4 LLM explain layer SKIPPED (2026-06-26)** — `buildChecks()` already produces a plain-English row per check deterministically, so an LLM call would duplicate existing output, weaken the privacy pitch, and add a demo-day failure mode; all OpenAI/GPT-4o references then removed from code and docs. **Phase 4 privacy policy page DONE (2026-06-26)** — bundled as `mailsentry/privacy.html` (extension-local instead of GitHub Pages, robust offline) and wired into the onboarding "Privacy policy" link. **Risk formula reworked (2026-06-26)** — link/qr removed from the weighted sum and reframed as a Safe Browsing ground-truth override (hit → composite 1.0), heuristic weights rescaled to 0.55/0.30/0.15 (domain/urgency/attachment), and the numeric risk % removed from the visible banner UI (verdict label + breakdown rows carry the UX). **Safe Browsing error path fixed (2026-06-26)** — `linkScanner.js` no longer silently swallows 4xx/error responses as "no hit"; HTTP failures and `data.error` bodies now return `{ stubbed:true, error:<message> }`, and the banner's link row distinguishes "no key" (existing copy) from "key rejected" (new copy pointing the user back to settings). 17/17 linkScanner tests, 34/34 risk tests, 7/7 suites overall pass. Real next work: Phase 5 demo prep (2 test emails: clean + lookalike attack), resolve open decision #2 (demo fallback mode), and close the local-part-on-trusted-domain detection gap.

> When you finish a work session, update this section: what got done, what's in progress, and the single clearest "next step."
