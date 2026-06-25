# SentryDomain — TODO

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

- [ ] Create the `sentryDomain/` file tree per CONTEXT.md §6 (empty stub files OK)
- [ ] `manifest.json` (MV3): permissions `storage`, `activeTab`, `scripting`; host permission `*://*.mail.google.com/*`; register `content.js`, `background.js`, popup, onboarding
- [ ] `.gitignore` — exclude any local key/config file (never commit API keys)
- [ ] `README.md` skeleton — load-unpacked instructions placeholder
- [ ] **Acquire Google Safe Browsing API key** — console.cloud.google.com → enable Safe Browsing API → create key → restrict by API + referrer
- [ ] *(stretch)* Acquire OpenAI API key for the GPT-4o layer
- [ ] **OPEN DECISION #1 — banner styling:** confirm inline scoped CSS + Shadow DOM (Tailwind CDN is blocked by MV3 CSP). Decide before Phase 3. (CONTEXT §8)
- [ ] **OPEN DECISION #2 — demo mode:** deferred by user; revisit before Phase 5. (CONTEXT §8)

## Phase 1 — Pure utils (no Gmail dependency; each gets a lightweight test)

> Testing = plain JS asserts runnable in node/browser console. No framework.

- [ ] `utils/levenshtein.js` — domain fuzzy-match helper (~20 lines) **+ test** — *do this first per spec*
- [ ] `utils/domainCheck.js` — composes the 0.40 sender/domain score as `max` of three sub-signals **+ test**:
- [ ] Lookalike: Levenshtein vs known-vendor domains
- [ ] Display-name vs email mismatch: parse `"Name" <addr@domain>`, flag when display name claims a known vendor/brand but the address domain is unrelated
- [ ] Allowlist mode (optional toggle): if enabled, only whitelisted domain suffixes (`@acme.com`, `@*.acme.com`) or explicit whitelisted emails pass; everything else scores high. Default off.
- [ ] `utils/urgency.js` — keyword list + weighted scorer (subject + body) **+ test**
- [ ] `utils/risk.js` — composite formula (0.40/0.25/0.20/0.10/0.05; threshold ≥ 0.3 → red) **+ test** (CONTEXT §5)
- [ ] `utils/attachmentCheck.js` — binary signal as a pure function (attachment on payment-instruction email → 0.5)
- [ ] `utils/linkScanner.js` — Safe Browsing call. **Build with a stub return first**, wire the real key once acquired
- [ ] `utils/qrExtractor.js` — integrate jsQR (~50KB), decode `<img>` → URL → linkScanner. **Stub first**
- [ ] `demo/seed.json` — 5 vendors `{ name, domain, phone }` (placeholder data)

## Phase 2 — Extension shell (works without Gmail)

- [ ] `background.js` — seed `chrome.storage.local` with `seed.json` vendors on install
- [ ] `onboarding.html` / `onboarding.js` — first-run consent screen (one checkbox, one confirm; exact copy in CONTEXT §3) + privacy policy link. *This is a demo trust moment.*
- [ ] `popup.html` / `popup.js` — whitelist manager (view/add/remove vendors) + API key settings (Safe Browsing, optional OpenAI)
- [ ] Allowlist-mode controls: on/off toggle + manage allowed domain suffixes + manage explicit allowed emails (persist to `chrome.storage.local`)

## Phase 3 — Gmail integration (the brittle part — isolate it)

> Depends on Phase 1 utils + open decision #1. Keep all DOM selectors behind small helper fns so a Gmail update breaks only one file.

- [ ] `content.js` DOM parser: extract sender/domain, subject, body text, body links, attachment indicators, `<img>` tags (for QR)
- [ ] Orchestrator: run all 5 checks → compute composite via `risk.js`
- [ ] Banner injection: red (≥ 0.3) / green check, with score + per-signal breakdown tooltip
- [ ] One-click **Verify** → look up vendor in whitelist → surface on-file phone number
- [ ] Scoped styling (Shadow DOM / inline CSS) to avoid Gmail CSS collisions

## Phase 4 — Stretch (only after core is solid)

- [ ] `utils/openai.js` — GPT-4o `explain()` — domain pair only, plain-English explanation, one call per flagged email
- [ ] Privacy policy page (GitHub Pages doc) + link it from onboarding
- [ ] Demo fallback mode (depends on open decision #2)

## Phase 5 — Demo prep

- [ ] Create 2 test emails: one clean, one lookalike-domain attack
- [ ] README: full setup instructions for judges (load unpacked, enter key, open test email)
- [ ] Rehearse the flow incl. consent-screen trust moment
- [ ] Finalise open decision #2 (demo mode) and lock the demo script
