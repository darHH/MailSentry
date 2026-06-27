// popup.js — whitelist manager + allowlist-mode controls + API key settings.
// All state persists to chrome.storage.local. No build step, vanilla DOM.
//
// Unified entry format (vendors + allowlist): "@acme.com" = domain (and its
// subdomains), "jo@acme.com" = exact email.

const $ = (id) => document.getElementById(id);

async function getState() {
  const s = await chrome.storage.local.get(['vendors', 'allowlist', 'settings']);
  const vendors = s.vendors || [];
  const allowlist = s.allowlist || {};
  // Strict mode now reuses the trusted-contacts list. Fold any legacy
  // allowlist entries (old separate list) into vendors, then drop them.
  const legacy = [].concat(allowlist.entries || [], allowlist.emails || [], allowlist.suffixes || []);
  if (legacy.length) {
    const have = new Set(vendors.map(vendorEntry));
    for (const e of legacy) {
      const entry = String(e).trim().toLowerCase();
      if (entry && !have.has(entry)) { vendors.push({ entry }); have.add(entry); }
    }
  }
  const enabled = typeof allowlist.enabled === 'boolean' ? allowlist.enabled : false;
  return {
    vendors,
    allowlist: { enabled },
    settings: s.settings || { safeBrowsingKey: '', exaApiKey: '', consentAccepted: false },
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

// ---- Strict mode (just a toggle; uses the trusted-contacts list above) ----
function renderAllowlist(allowlist) {
  const on = !!allowlist.enabled;
  $('allowToggle').checked = on;
  $('strictWarn').classList.toggle('show', on);
  const pill = $('strictPill');
  pill.classList.toggle('on', on);
  pill.classList.toggle('off', !on);
  $('strictText').textContent = on ? 'Strict mode: ON' : 'Strict mode: OFF';
}

const toggleAllow = async () => {
  const { allowlist } = await getState();
  allowlist.enabled = $('allowToggle').checked;
  await chrome.storage.local.set({ allowlist });
  renderAllowlist(allowlist);
};

// ---- API keys + live status ----
function renderKeyStatus(settings) {
  const hasKey = !!(settings.safeBrowsingKey || '').trim();
  const pill = $('scanPill');
  pill.classList.toggle('on', hasKey);
  pill.classList.toggle('off', !hasKey);
  $('scanText').textContent = hasKey ? 'Link scan: ON' : 'Link scan: OFF';
  const ks = $('keyState');
  ks.classList.toggle('live', hasKey);
  ks.classList.toggle('off', !hasKey);
  ks.innerHTML = hasKey
    ? 'Link scanning is <b>ON.</b> <br/> Links in emails are checked against Google Safe Browsing.'
    : 'Link scanning is <b>OFF.</b> <br/> No key yet — links aren’t scanned.';
}

async function saveKeys() {
  const { settings } = await getState();
  settings.safeBrowsingKey = $('sbKey').value.trim();
  await chrome.storage.local.set({ settings });
  renderKeyStatus(settings);
  $('keysSaved').textContent = 'Saved ✓';
  setTimeout(() => ($('keysSaved').textContent = ''), 1500);
}

function renderExaStatus(settings) {
  const hasKey = !!(settings.exaApiKey || '').trim();
  const pill = $('exaPill');
  pill.classList.toggle('on', hasKey);
  pill.classList.toggle('off', !hasKey);
  $('exaText').textContent = hasKey ? 'Exa web-check: ON' : 'Exa web-check: OFF';
  const ks = $('exaKeyState');
  ks.classList.toggle('live', hasKey);
  ks.classList.toggle('off', !hasKey);
  ks.innerHTML = hasKey
    ? 'Exa web-check is <b>ON.</b> <br/> Unknown senders are checked against the live web.'
    : 'Exa web-check is <b>OFF.</b> <br/> No key yet — unknown senders aren’t web-checked.';
}

async function saveExa() {
  const { settings } = await getState();
  settings.exaApiKey = $('exaKey').value.trim();
  await chrome.storage.local.set({ settings });
  renderExaStatus(settings);
  $('exaSaved').textContent = 'Saved ✓';
  setTimeout(() => ($('exaSaved').textContent = ''), 1500);
}

// ---- Init ----
(async () => {
  const state = await getState();
  // Persist the migrated shape (folds legacy allowlist entries into vendors,
  // drops the old separate list) so content.js and storage stay in sync.
  await chrome.storage.local.set({ vendors: state.vendors, allowlist: state.allowlist });
  renderVendors(state.vendors);
  renderAllowlist(state.allowlist);
  $('sbKey').value = state.settings.safeBrowsingKey || '';
  renderKeyStatus(state.settings);
  $('exaKey').value = state.settings.exaApiKey || '';
  renderExaStatus(state.settings);

  $('addVendor').addEventListener('click', addVendor);
  $('allowToggle').addEventListener('change', toggleAllow);
  $('saveKeys').addEventListener('click', saveKeys);
  $('saveExa').addEventListener('click', saveExa);
})();
