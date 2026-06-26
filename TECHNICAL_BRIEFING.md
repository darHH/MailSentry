# MailSentry — Technical Briefing for Judges

A read-through to prep before the demo, so you can field any technical question.

---

## What it is, in one sentence

A **Chrome MV3 extension that runs entirely client-side inside Gmail**, scoring every opened email with five independent checks and showing a red/green banner *before* the user acts on it.

---

## Why technical choices were made

- **Chrome extension, not a web app or proxy** → the fix has to appear *inside* the existing Gmail workflow, at the moment of perception failure. A separate dashboard never gets opened.
- **Client-side, no backend** → no PDPA/GDPR/Gmail-ToS exposure, no server cost, no inbox-trust ask. The privacy story is the legal moat. **Only URLs leave the device** (to Google Safe Browsing) — never email content.
- **Vanilla JS, no build step** → instant reload, fewer demo-day failure modes, easy to debug live in front of judges.
- **No LLM** → `buildChecks()` already produces a plain-English row per check deterministically. An LLM would (1) duplicate the output, (2) require POSTing email content to a third party (kills the privacy pitch), (3) add a latency/outage failure mode on demo day.

---

## Architecture (one breath)

```
manifest.json (MV3, host_permissions: *.mail.google.com)
  ├─ background.js (service worker — seeds chrome.storage on install)
  ├─ content.js (orchestrator, injected into Gmail) ──┐
  │                                                    │ uses
  │                                                    ▼
  └─ utils/  ─ levenshtein.js, domainCheck.js, urgency.js,
                linkScanner.js, attachmentCheck.js, qrExtractor.js, risk.js
  ├─ popup.html/.js (vendor whitelist + allowlist + Safe Browsing key)
  └─ onboarding.html/.js + privacy.html (first-run consent)
```

Each util is a **UMD-style IIFE** — attaches to `self.Mail*` for the content script and `module.exports` for Node tests. Lets us run a 71-assert pure-JS test suite (`node *.test.js`) without a test framework.

---

## The five checks (and the scoring model)

| Check | What it does | Weight |
|---|---|---|
| **Sender/Domain** | Max of three sub-signals: Levenshtein lookalike, display-name↔email mismatch, allowlist-mode violation | **0.55** |
| **Urgency** | Weighted keyword scorer over subject (×1.5) + body, saturates at weight 8 | **0.30** |
| **Attachment** | Binary: attachment present **AND** payment context in the email → 0.5 | **0.15** |
| **Link safety** | Google Safe Browsing v4 — **ground-truth override** | hit → composite 1.0 |
| **QR code** | jsQR decodes images, URL goes through the same Safe Browsing scanner | hit → composite 1.0 |

```js
const override   = linkScore >= 1.0 || qrScore >= 1.0;
const weighted   = domain*0.55 + urgency*0.30 + attachment*0.15;
const composite  = override ? 1.0 : weighted;
// composite >= 0.3 → red banner, else green
```

**Why a two-tier model:** Safe Browsing's blocklist has near-zero false-positive rate — a confirmed phishing URL shouldn't be vote-able down by heuristics. So it's a hard override, not just another weight.

---

## The sender/domain sub-signals — the heart of the BEC defence

This is the bit worth understanding deeply, because BEC (Business Email Compromise) is the threat we actually catch.

1. **Lookalike via Levenshtein**, *adaptive granularity*:
   - Vendor stored as a **domain** (`@acme-supplies.com`) → compare *registrable domains* → catches `acme.com` vs `acrne.com`.
   - Vendor stored as a **full email** (`wnaya@rocketmail.com`) → compare *whole addresses* → catches username typo-squat on shared/freemail domains (`wnaya@` vs `wnayar@`).
   - Why adaptive: B2B fraud spoofs the company (domain); freemail contacts share a domain and identity is the local-part.
   - **Distance 1–2 → flagged. Distance 0 (exact match) → safe.**

2. **Display-name vs email mismatch.** Display name claims a vendor brand but the address domain is unrelated. Brand tokens are derived from the vendor's **own domain** (`brandTokens('acme-supplies.com')` → `['acme','supplies']`) — no separate "vendor name" field needed. Catches `"Acme Supplies" <random123@gmail.com>` where the address itself isn't a lookalike.

3. **Allowlist mode (opt-in toggle).** When on, *only* senders matching an allowlist entry pass; everything else flagged. Flips the model from "flag suspicious" to "flag everything not pre-approved" — strict mode for finance users with a small known counterparty list.

**Unified entry format** for both vendors and allowlist (one parser: `parseScopeEntry`):
- `@acme.com` → domain entry
- `jo@acme.com` → exact email
- `acme.com` → bare domain (treated as domain entry)

---

## How Gmail integration actually works

- **One single "BRITTLE ZONE"** in `content.js` holds every Gmail selector (`h2.hP` subject, `span.gD[email]` sender, `div.a3s` body, `span.aV3` attachments). If Gmail re-skins, only one block breaks.
- Gmail is a SPA, so we use a `MutationObserver` on `document.body` plus a `hashchange` listener, **debounced to 350ms**, and dedupe by `sender+subject` so we don't re-scan the same email on every DOM tick.
- Banner is injected via **Shadow DOM with inline scoped CSS**. Why Shadow DOM: (a) Gmail's stylesheets bleed into anything injected into its DOM, (b) MV3's content-script CSP blocks remote CDN scripts so Tailwind CDN won't load — Shadow DOM + inline CSS sidesteps both.

---

## Privacy / data handling

| Data | Where it goes |
|---|---|
| Sender, subject, body, links, attachment names, images | Read locally, never transmitted |
| Body text (for urgency scan) | Never stored, never transmitted |
| **URLs found in body or decoded from QR** | Sent to **Google Safe Browsing v4** — URL only, no email context |

Consent screen on first install (one checkbox, one button) lists exactly what's read and what leaves the device. Links to the bundled `privacy.html`.

---

## Likely judge questions and crisp answers

- **"How do you avoid false positives?"** Two layers. Heuristic side has a saturation cap on urgency, requires *payment context* before flagging attachments, and uses distance ≥1 on Levenshtein (distance 0 = safe). Override layer relies on Google Safe Browsing's blocklist, which is curated and near-zero FP.
- **"Why Levenshtein and not something fancier?"** ~20 lines, no dependency, judges understand it without an ML explanation, and 1-2 char edit distance is exactly the shape of the BEC attack — `acme` → `acrne`.
- **"What if Gmail changes the DOM?"** All selectors are in one "BRITTLE ZONE" block in `content.js`. One file to patch, no cascade.
- **"What about the Safe Browsing API key being client-side?"** Restrict by API + HTTP referrer in Google Cloud Console. Acceptable for demo; for production we'd proxy through a tiny edge function purely to hide the key.
- **"Why not OAuth into Gmail directly?"** Gmail API would mean a backend, OAuth scopes, content leaving the device, and a much harder PDPA/GDPR story. The content-script approach reads the same data the user is *already looking at*, on their machine.
- **"How big is the trust surface?"** Three permissions: `storage`, `activeTab`, `scripting`. One host: `*.mail.google.com`. One outbound URL: `safebrowsing.googleapis.com`. That's it.
- **"How would this scale to other webmail (Outlook, etc.)?"** Only `content.js` is Gmail-coupled; the seven utils are pure functions that take parsed inputs. Adding Outlook = new content script with its own selector map, same utils.
- **"Tests?"** 71 zero-dependency assertion tests across the utils (`node mailsentry/utils/*.test.js`), all passing. Network/DOM modules accept injectable `fetch`/`jsQR`/`document` so they're testable offline.
- **"What's the link/QR situation if no API key?"** Stub-first: linkScanner returns `{stubbed: true}` and the banner says "X link(s) not scanned — add a key in settings". The rest of the pipeline still runs end-to-end. Invalid-key responses are distinguished from no-key ("key rejected — re-enter in settings") so we never show a misleading green when the key is bad.
- **"What's NOT done yet?"** QR is stub-first — jsQR isn't bundled (post-hackathon). One known detection gap: a legitimate-domain account compromise (a real `accounts@acme.com` that's been hacked) won't be caught by lookalike or name-mismatch — the email *is* genuinely from the vendor's domain.

---

## Numbers worth memorising

- **5** checks, **3** sender sub-signals, **0** backend services, **1** external API (Safe Browsing).
- Weights: **0.55 / 0.30 / 0.15** (domain / urgency / attachment), red threshold **0.30**.
- **71** passing unit tests, **350ms** debounce on Gmail DOM changes, **~50KB** jsQR footprint.
- Lookalike trigger band: **edit distance 1–2**. Distance 0 = exact = safe.
