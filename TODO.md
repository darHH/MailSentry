# MailSentry — TODO

> **How to work this file (read this first):**
> 1. Read `CONTEXT.md` for full project context before doing anything.
> 2. Find the **first unchecked `[ ]` task** in this file and build it.
> 3. When done, **check it off** (`[x]`) here.
> 4. **Update `CONTEXT.md`** wherever the work changed something (architecture, decisions, file structure, and the "Current status / where we left off" section at the bottom).
> 5. If anything is unclear or ambiguous, **stop and ask clarifying questions — one at a time** — before building.
>
> Phases are ordered by dependency: utils (Phase 1) have no Gmail dependency and can be built/tested in isolation before the brittle Gmail integration (Phase 3).

---

## Phase 0 — Scaffold & prerequisites

- [x] Create the `mailsentry/` file tree per CONTEXT.md §6 (empty stub files OK)
- [x] `manifest.json` (MV3): permissions `storage`, `activeTab`, `scripting`; host permission `*://*.mail.google.com/*`; register `content.js`, `background.js`, popup, onboarding
- [x] `.gitignore` — exclude any local key/config file (never commit API keys)
- [x] `README.md` skeleton — load-unpacked instructions placeholder
- [x] **Acquire Google Safe Browsing API key** — DONE by user (paste into popup → stored in `chrome.storage.local`, read by `linkScanner`). Never committed.
- [x] ~~*(stretch)* Acquire OpenAI API key for the GPT-4o layer *(USER task)*~~ — no longer needed (LLM layer removed 2026-06-26)
- [x] **OPEN DECISION #1 — banner styling:** RESOLVED → inline scoped CSS inside Shadow DOM (Tailwind CDN blocked by MV3 CSP). (CONTEXT §8)
- [ ] **OPEN DECISION #2 — demo mode:** deferred by user; revisit before Phase 5. (CONTEXT §8)

## Phase 1 — Pure utils (no Gmail dependency; each gets a lightweight test)

> Testing = plain JS asserts runnable in node/browser console. No framework.

- [x] `utils/levenshtein.js` — domain fuzzy-match helper (~20 lines) **+ test** — *do this first per spec*
- [x] `utils/domainCheck.js` — composes the 0.40 sender/domain score as `max` of three sub-signals **+ test**:
  - [x] Lookalike: Levenshtein vs known-vendor domains
  - [x] Display-name vs email mismatch: parse `"Name" <addr@domain>`, flag when display name claims a known vendor/brand but the address domain is unrelated
  - [x] Allowlist mode (optional toggle): if enabled, only senders matching a unified allowlist entry pass (`@acme.com` = domain+subdomains, `jo@acme.com` = exact email); everything else scores high. Default off. Same `parseScopeEntry()` format as vendors.
- [x] `utils/urgency.js` — keyword list + weighted scorer (subject + body) **+ test**
- [x] `utils/risk.js` — composite formula (0.40/0.25/0.20/0.10/0.05; threshold ≥ 0.3 → red) **+ test** (CONTEXT §5)
- [x] `utils/attachmentCheck.js` — binary signal as a pure function (attachment on payment-instruction email → 0.5) **+ test**
- [x] `utils/linkScanner.js` — Safe Browsing call. **Built stub-first** (no key → stubbed 0); real key wires in once acquired **+ test (injected fetch)**
- [x] `utils/qrExtractor.js` — jsQR decode `<img>` → URL → linkScanner. **Built stub-first** (no jsQR → stubbed); tainted-canvas guarded **+ test (injected jsQR/DOM)**
- [x] `demo/seed.json` — 5 vendors `{ entry }` (placeholder data)

## Phase 2 — Extension shell (works without Gmail)

- [x] `background.js` — seed `chrome.storage.local` with `seed.json` vendors on install (idempotent; opens onboarding on first install)
- [x] `onboarding.html` / `onboarding.js` — first-run consent screen (one checkbox, one confirm; exact copy in CONTEXT §3) + privacy policy link. *This is a demo trust moment.*
- [x] `popup.html` / `popup.js` — whitelist manager (view/add/remove vendors) + API key settings (Safe Browsing)
  - [x] Allowlist-mode controls: on/off toggle + single unified entry list (`@domain` or `email`), persisted to `chrome.storage.local`

## Phase 3 — Gmail integration (the brittle part — isolate it)

> Depends on Phase 1 utils + open decision #1. Keep all DOM selectors behind small helper fns so a Gmail update breaks only one file.

- [x] `content.js` DOM parser: extract sender/domain, subject, body text, body links, attachment indicators, `<img>` tags (for QR) — all selectors isolated in `SELECTORS` + `get*` helpers (one BRITTLE ZONE block)
- [x] Orchestrator: run all 5 checks → compute composite via `risk.js` (verified offline: attack→red 70%, clean→green 0%)
- [x] Banner injection: red (≥ 0.3) / green check, with score + per-signal breakdown tooltip (`<details>` table)
- [x] ~~One-click **Verify** button~~ — REMOVED by user. Impersonation info (real contact being mimicked) now surfaced inline in the breakdown via `matchVendor()`; no separate button.
- [x] Scoped styling (Shadow DOM / inline CSS) to avoid Gmail CSS collisions
- [x] **LIVE TUNING (needs real Gmail):** confirm Gmail selectors (`h2.hP`, `span.gD[email]`, `div.a3s`, `span.aV3`) resolve on your account; adjust BRITTLE ZONE if banner doesn't appear — user confirmed banner renders on real Gmail; no selector changes needed

## Phase 4 — Stretch (only after core is solid)

- [x] ~~`utils/openai.js` — GPT-4o `explain()` — domain pair only, plain-English explanation, one call per flagged email~~ — **SKIPPED (2026-06-26):** `buildChecks()` in `content.js` already produces a plain-English sentence per check (deterministic, no hallucination risk). Adding an LLM layer would (1) duplicate existing explanations, (2) weaken the privacy pitch by POSTing email content to a third party, (3) introduce a demo-day failure mode (rate limits, flaky wifi, revoked key). No added user value for a hackathon. Revisit only if an AI-specific prize/track requires it.
- [x] Privacy policy page + link it from onboarding — bundled as `mailsentry/privacy.html` (extension-local instead of GitHub Pages, so it works offline and can't 404 mid-demo); `onboarding.html` "Privacy policy" link now points to it
- [ ] Demo fallback mode (depends on open decision #2)

## Phase 5 — Demo prep

- [ ] Create 2 test emails: one clean, one lookalike-domain attack
- [ ] README: full setup instructions for judges (load unpacked, enter key, open test email)
- [ ] Rehearse the flow incl. consent-screen trust moment
- [ ] Finalise open decision #2 (demo mode) and lock the demo script

---

## Ideas / future improvements (not scheduled)

- [ ] **Wire up real jsQR decode.** QR scanning is currently stubbed (`qrExtractor.js` returns `stubbed: true` because no `jsQR` global is bundled). Drop `jsQR.js` into `utils/`, register it in the manifest before `qrExtractor.js`, and the existing canvas + URL-extract + `linkScore` pipeline takes over. ~50KB, MIT, no deps. Closes the gap where MailSentry advertises QR scanning in the banner but doesn't actually do it. CORS-tainted images are already handled (silently skipped).
- [x] ~~**Heuristic content check for scam intent.**~~ — **SKIPPED (2026-06-26):** `urgency.js` already covers obvious scam wording (bank details, wire transfer, act now, account suspended, gift card, etc.). Adding another check that fires on the same emails has diminishing returns; each new heuristic also risks false positives, which are more embarrassing in a demo than catching a 6th attack; and the check is invisible (just nudges the composite score on already-flagged emails — no demo moment). Revisit post-hackathon if real-user mail samples expose a missed pattern.
- [x] ~~**Import / export trusted contacts + allowlist.**~~ — **SKIPPED (2026-06-26):** power-user feature with no demo moment. The pitch doesn't have a "designed for teams" angle, so judges won't see it unless we add scope to the demo flow. Could be revisited post-hackathon if MailSentry continues as a real product.
