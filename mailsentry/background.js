// background.js — MV3 service worker.
// On install: seed chrome.storage.local with demo vendors + default settings,
// then open the onboarding/consent screen. Idempotent: never clobbers existing
// user data (only fills in missing keys).

const DEFAULTS = {
  vendors: [],            // [{ name?, entry }]  entry: '@acme.com' (domain) or 'jo@acme.com' (email)
  allowlist: {            // strict opt-in "flag everything not pre-approved" mode
    enabled: false,
    entries: [],          // ['@acme.com', 'ceo@acme.com']  (same format as vendor entry)
  },
  settings: {
    safeBrowsingKey: '',  // entered via popup; empty → link/QR run stub-first
    openaiKey: '',        // stretch GPT-4o explainer
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
