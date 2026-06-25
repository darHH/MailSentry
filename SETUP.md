# MailSentry — Setup

How to run the extension in Chrome after pulling this repo. ~5 minutes.

MailSentry is a Chrome extension that flags scam/impersonation emails inside Gmail. It runs fully client-side — email content never leaves your machine.

---

## 1. Load the extension

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`mailsentry/`** folder inside this repo (not the repo root)
5. MailSentry appears in your extensions list. Pin it for easy access (puzzle-piece icon → pin).

On first install a **consent screen** opens in a new tab — read it and click **Enable MailSentry**.

> Open Gmail (`mail.google.com`) and open any email — a green or red MailSentry banner appears above the message.

---

## 2. (Optional) Turn on link scanning

Without a key, MailSentry still checks sender, urgency, and attachments — only the link/QR scan is off. To enable it you need your **own** free Google Safe Browsing key (keys are per-user; none ships in this repo).

1. Go to <https://console.cloud.google.com>
2. Create/select a project → **APIs & Services** → enable **Safe Browsing API**
3. **Credentials** → **Create credentials** → **API key** → copy it
4. (Recommended) Restrict the key to the Safe Browsing API
5. In Chrome, click the **MailSentry icon** → paste the key into **Link scanning** → **Save**

The status strip flips to **Link scan: live**.

> ⚠️ The key is stored locally in the browser only. **Never commit it.** `.env` is gitignored for this reason.

---

## 3. Set up your contacts

Click the **MailSentry icon** to open the popup.

- **Trusted contacts** — add people/companies you deal with. MailSentry warns you when a scammer uses a look-alike address.
  - `@acme.com` → the whole company domain (flags `@acrne.com`)
  - `jo@gmail.com` → one exact person (flags `jp@gmail.com`)
- **Strict mode** (optional, default off) — flag **every** sender not on its list. Same `@domain` / `email` format. Use only if you email a fixed set of suppliers.

5 demo domains are seeded on install; remove them and add your own.

---

## 4. Verify it works

Open an email in Gmail:
- **Green banner** = no scam indicators found.
- **Red banner** = flagged. It auto-expands a plain-language "Why flagged?" list showing each check.

To see a red flag: add a trusted contact (e.g. `@yourbank.com`), then open an email from a look-alike of it.

---

## Updating after code changes

After editing any file in `mailsentry/`, go to `chrome://extensions` and click the **↻ reload** icon on the MailSentry card. The banner also de-duplicates per email — switch to another email and back to re-scan.

---

## Running the unit tests (optional)

Pure-logic checks, zero dependencies — needs only Node.js:

```bash
for t in mailsentry/utils/*.test.js; do node "$t"; done
```

Expect all suites to report `0 failed`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| No banner in Gmail | Reload the extension (`chrome://extensions` → ↻); refresh the Gmail tab. |
| Banner shows old result | Open a different email and back (it caches per sender+subject). |
| Link scan says "off" | Add a Safe Browsing key in the popup (step 2). |
| Look-alike not flagged | Confirm the address is in **Trusted contacts** (popup), then reload the extension. |
| Selectors broke after a Gmail update | Gmail DOM selectors live in one block (`BRITTLE ZONE`) in `mailsentry/content.js`. |

See `CONTEXT.md` for how it works and `TODO.md` for project status.
