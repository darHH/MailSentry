// popup.js — whitelist manager + allowlist-mode controls + API key settings.
// All state persists to chrome.storage.local. No build step, vanilla DOM.
//
// Unified entry format (vendors + allowlist): "@acme.com" = domain (and its
// subdomains), "jo@acme.com" = exact email.

const $ = (id) => document.getElementById(id);

async function getState() {
  const s = await chrome.storage.local.get(['vendors', 'allowlist', 'settings']);
  const allowlist = s.allowlist || {};
  // migrate legacy {suffixes, emails} → unified {entries}
  if (!Array.isArray(allowlist.entries)) {
    allowlist.entries = [].concat(allowlist.emails || [], allowlist.suffixes || []);
  }
  if (typeof allowlist.enabled !== 'boolean') allowlist.enabled = false;
  return {
    vendors: s.vendors || [],
    allowlist: { enabled: allowlist.enabled, entries: allowlist.entries },
    settings: s.settings || { safeBrowsingKey: '', openaiKey: '', consentAccepted: false },
  };
}

// the canonical entry string for a vendor (handles legacy domain/email/name fields)
const vendorEntry = (v) => v.entry || v.domain || v.email || v.name || '';

// ---- Trusted contacts ----
function renderVendors(vendors) {
  const ul = $('vendorList');
  ul.innerHTML = '';
  if (vendors.length === 0) ul.innerHTML = '<li><span class="muted">No trusted contacts yet.</span></li>';
  vendors.forEach((v, i) => {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const b = document.createElement('b');
    b.textContent = vendorEntry(v);
    meta.append(b);
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '×';
    del.title = 'Remove';
    del.addEventListener('click', () => removeVendor(i));
    li.append(meta, del);
    ul.appendChild(li);
  });
}

async function addVendor() {
  const entry = $('vEntry').value.trim().toLowerCase();
  if (!entry) return;
  const { vendors } = await getState();
  vendors.push({ entry });
  await chrome.storage.local.set({ vendors });
  $('vEntry').value = '';
  renderVendors(vendors);
}

async function removeVendor(i) {
  const { vendors } = await getState();
  vendors.splice(i, 1);
  await chrome.storage.local.set({ vendors });
  renderVendors(vendors);
}

// ---- Allowlist mode (single unified entries list) ----
function renderAllowlist(allowlist) {
  $('allowToggle').checked = !!allowlist.enabled;
  $('strictWarn').classList.toggle('show', !!allowlist.enabled);
  const ul = $('allowList');
  ul.innerHTML = '';
  if (allowlist.entries.length === 0) ul.innerHTML = '<li><span class="muted">Nothing allowed yet.</span></li>';
  allowlist.entries.forEach((item, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = item;
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '×';
    del.addEventListener('click', () => removeEntry(i));
    li.append(span, del);
    ul.appendChild(li);
  });
}

async function saveAllowlist(mutate) {
  const { allowlist } = await getState();
  mutate(allowlist);
  await chrome.storage.local.set({ allowlist });
  renderAllowlist(allowlist);
}

const toggleAllow = () => saveAllowlist((a) => { a.enabled = $('allowToggle').checked; });
const addEntry = () => {
  const v = $('allowInput').value.trim().toLowerCase();
  if (!v) return;
  $('allowInput').value = '';
  saveAllowlist((a) => { if (!a.entries.includes(v)) a.entries.push(v); });
};
const removeEntry = (i) => saveAllowlist((a) => a.entries.splice(i, 1));

// ---- API keys + live status ----
function renderKeyStatus(settings) {
  const hasKey = !!(settings.safeBrowsingKey || '').trim();
  const pill = $('scanPill');
  pill.classList.toggle('on', hasKey);
  pill.classList.toggle('off', !hasKey);
  $('scanText').textContent = hasKey ? 'Link scan: live' : 'Link scan: off';
  $('keyState').innerHTML = hasKey
    ? '<b>Live.</b> Links in emails are checked against Google Safe Browsing.'
    : '<b>Off.</b> No key yet — links aren’t scanned. Sender, urgency and attachment checks still run.';
}

async function saveKeys() {
  const { settings } = await getState();
  settings.safeBrowsingKey = $('sbKey').value.trim();
  settings.openaiKey = $('oaKey').value.trim();
  await chrome.storage.local.set({ settings });
  renderKeyStatus(settings);
  $('keysSaved').textContent = 'Saved ✓';
  setTimeout(() => ($('keysSaved').textContent = ''), 1500);
}

// ---- Init ----
(async () => {
  const state = await getState();
  renderVendors(state.vendors);
  renderAllowlist(state.allowlist);
  $('sbKey').value = state.settings.safeBrowsingKey || '';
  $('oaKey').value = state.settings.openaiKey || '';
  renderKeyStatus(state.settings);

  $('addVendor').addEventListener('click', addVendor);
  $('allowToggle').addEventListener('change', toggleAllow);
  $('addAllow').addEventListener('click', addEntry);
  $('saveKeys').addEventListener('click', saveKeys);
})();
