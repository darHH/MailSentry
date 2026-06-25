# MailSentry

A Chrome extension that lives inside Gmail and makes email scams impossible to miss at the exact moment a payment decision is made. Fully client-side — email content never leaves the device.

**New here? See [`../SETUP.md`](../SETUP.md) for full step-by-step setup.** See `../CONTEXT.md` for the project brief and `../TODO.md` for the task list.

## Load unpacked (demo)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `mailsentry/` directory
5. On first run, the consent/onboarding screen appears — read and accept
6. (Optional) Open the popup → settings → paste a Google Safe Browsing API key to enable live link scanning

> API keys are optional for the core demo. Link/QR checks run stubbed until a key is entered.

## Running the unit tests

The Phase 1 utils ship with zero-dependency assert tests (plain JS, run in Node or the browser console):

```bash
node mailsentry/utils/levenshtein.test.js
node mailsentry/utils/domainCheck.test.js
node mailsentry/utils/urgency.test.js
node mailsentry/utils/risk.test.js
node mailsentry/utils/attachmentCheck.test.js
```

## Project status

Phase 0 (scaffold) + Phase 1 (pure utils) + Phase 2 (extension shell) done. Phase 3 (Gmail integration) next. See `../TODO.md`.
