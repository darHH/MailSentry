// background.js — MV3 service worker.
// On install: seed chrome.storage.local with demo vendors + default settings,
// then open the onboarding/consent screen. Idempotent: never clobbers existing
// user data (only fills in missing keys).
//
// Also relays Exa calls: content scripts can't fetch api.exa.ai (no CORS header),
// but the service worker can via the api.exa.ai host permission. See onMessage.

// Pull in the Exa module here so fetchExa runs in the worker (CORS-bypassed).
// require is undefined in the worker → exaCheck reads its deps off self.Mail*,
// so levenshtein + domainCheck must be imported first.
importScripts('utils/levenshtein.js', 'utils/domainCheck.js', 'utils/exaCheck.js');

const DEFAULTS = {
  vendors: [],            // [{ entry }]  entry: '@acme.com' (domain) or 'jo@acme.com' (email)
  allowlist: {            // strict mode: flag every sender not in trusted contacts
    enabled: false,       // toggle only — the approved list IS `vendors` above
  },
  settings: {
    safeBrowsingKey: '',  // entered via popup; empty → link/QR run stub-first
    exaApiKey: '',        // entered via popup; empty → Exa sender web-check stubbed
    consentAccepted: false,
  },
};

async function seedStorage() {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULTS));

  // Load seed vendors from the bundled JSON only if none stored yet.
  let vendors = existing.vendors;
  if (!Array.isArray(vendors) || vendors.length === 0) {
    try {
      const url = chrome.runtime.getURL('demo/seed.json');
      const res = await fetch(url);
      const data = await res.json();
      vendors = Array.isArray(data.vendors) ? data.vendors : [];
    } catch (e) {
      vendors = [];
    }
  }

  const toSet = {
    vendors,
    allowlist: existing.allowlist || DEFAULTS.allowlist,
    settings: { ...DEFAULTS.settings, ...(existing.settings || {}) },
  };
  await chrome.storage.local.set(toSet);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await seedStorage();
  if (details.reason === 'install') {
    // first-run consent screen (also the demo trust moment)
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// Exa relay (content script → worker → api.exa.ai). The worker reads the key
// from storage itself, so the key never rides through the content-script context.
// Always resolves (never throws) so the caller degrades gracefully.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'exaFetch') return;
  (async () => {
    try {
      const { settings } = await chrome.storage.local.get('settings');
      const key = (settings && settings.exaApiKey) || '';
      const out = await self.MailExaCheck.fetchExa(msg.senderDomain, key);
      sendResponse(out);
    } catch (e) {
      sendResponse({ response: null, stubbed: true, error: String(e) });
    }
  })();
  return true; // keep the channel open for the async sendResponse
});
