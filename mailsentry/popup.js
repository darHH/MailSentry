// popup.js — whitelist manager + allowlist-mode controls + API key settings.
// All state persists to chrome.storage.local. No build step, vanilla DOM.

const $ = (id) => document.getElementById(id);

async function getState() {
  const s = await chrome.storage.local.get(['vendors', 'allowlist', 'settings']);
  return {
    vendors: s.vendors || [],
    allowlist: s.allowlist || { enabled: false, suffixes: [], emails: [] },
    settings: s.settings || { safeBrowsingKey: '', openaiKey: '', consentAccepted: false },
  };
}

// ---- Vendors ----
function renderVendors(vendors) {
  const ul = $('vendorList');
  ul.innerHTML = '';
  if (vendors.length === 0) ul.innerHTML = '<li><span class="muted">No vendors yet.</span></li>';
  vendors.forEach((v, i) => {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const b = document.createElement('b');
    b.textContent = v.name || v.domain;
    const span = document.createElement('span');
    span.textContent = v.email || v.domain;
    meta.append(b, span);
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
  const name = $('vName').value.trim();
  const domain = $('vDomain').value.trim().toLowerCase();
  if (!domain) return;
  const { vendors } = await getState();
  vendors.push({ name: name || domain, domain });
  await chrome.storage.local.set({ vendors });
  $('vName').value = $('vDomain').value = '';
  renderVendors(vendors);
}

async function removeVendor(i) {
  const { vendors } = await getState();
  vendors.splice(i, 1);
  await chrome.storage.local.set({ vendors });
  renderVendors(vendors);
}

// ---- Allowlist mode ----
function renderList(ulId, items, onRemove) {
  const ul = $(ulId);
  ul.innerHTML = '';
  items.forEach((item, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = item;
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '×';
    del.addEventListener('click', () => onRemove(i));
    li.append(span, del);
    ul.appendChild(li);
  });
}

function renderAllowlist(allowlist) {
  $('allowToggle').checked = !!allowlist.enabled;
  renderList('suffixList', allowlist.suffixes, removeSuffix);
  renderList('emailList', allowlist.emails, removeEmail);
}

async function saveAllowlist(mutate) {
  const { allowlist } = await getState();
  mutate(allowlist);
  await chrome.storage.local.set({ allowlist });
  renderAllowlist(allowlist);
}

const toggleAllow = () => saveAllowlist((a) => { a.enabled = $('allowToggle').checked; });
const addSuffix = () => {
  const v = $('suffixInput').value.trim().toLowerCase();
  if (!v) return;
  $('suffixInput').value = '';
  saveAllowlist((a) => { if (!a.suffixes.includes(v)) a.suffixes.push(v); });
};
const removeSuffix = (i) => saveAllowlist((a) => a.suffixes.splice(i, 1));
const addEmail = () => {
  const v = $('emailInput').value.trim().toLowerCase();
  if (!v) return;
  $('emailInput').value = '';
  saveAllowlist((a) => { if (!a.emails.includes(v)) a.emails.push(v); });
};
const removeEmail = (i) => saveAllowlist((a) => a.emails.splice(i, 1));

// ---- API keys ----
async function saveKeys() {
  const { settings } = await getState();
  settings.safeBrowsingKey = $('sbKey').value.trim();
  settings.openaiKey = $('oaKey').value.trim();
  await chrome.storage.local.set({ settings });
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

  $('addVendor').addEventListener('click', addVendor);
  $('allowToggle').addEventListener('change', toggleAllow);
  $('addSuffix').addEventListener('click', addSuffix);
  $('addEmail').addEventListener('click', addEmail);
  $('saveKeys').addEventListener('click', saveKeys);
})();
