# MailSentry — Setup

How to run the extension in Chrome after pulling this repo. ~5 minutes.

MailSentry is a Chrome extension that flags scam/impersonation emails inside Gmail. It runs fully client-side — email content never leaves your machine.

## 1. Load the extension

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`mailsentry/`** folder inside this repo (not the repo root)
5. MailSentry appears in your extensions list. Pin it for easy access (puzzle-piece icon → pin).

On first install a **consent screen** opens in a new tab — read it and click **Enable MailSentry**.

> Open Gmail (`mail.google.com`) and open any email — a green or red MailSentry banner appears above the message.

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

Done!
