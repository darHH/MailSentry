// onboarding.js — first-run consent. Gate the Enable button on the checkbox,
// persist consent to chrome.storage.local.settings.consentAccepted.

const agree = document.getElementById('agree');
const enable = document.getElementById('enable');
const done = document.getElementById('done');

agree.addEventListener('change', () => {
  enable.disabled = !agree.checked;
});

enable.addEventListener('click', async () => {
  if (!agree.checked) return;
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings.consentAccepted = true;
  await chrome.storage.local.set({ settings });
  enable.disabled = true;
  agree.disabled = true;
  done.style.display = 'block';
});

// Reflect prior consent if the page is reopened.
(async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (settings.consentAccepted) {
    agree.checked = true;
    agree.disabled = true;
    enable.disabled = true;
    done.style.display = 'block';
  }
})();
