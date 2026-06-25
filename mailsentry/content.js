// content.js — MailSentry Gmail integration (Phase 3).
// THE BRITTLE PART. Every Gmail DOM selector lives in SELECTORS + the get* helpers
// below, so a Gmail markup change breaks only this file (ideally only this block).
//
// Flow: detect an opened email → parse it → run the 5 checks → compute composite
// (risk.js) → inject a Shadow-DOM banner (red >=0.3 / green) with a per-signal
// breakdown + one-click Verify that surfaces the on-file vendor phone number.

(function () {
  'use strict';

  // --- util globals (attached by utils/*.js, loaded before this file) ---
  const Domain = self.MailDomainCheck;
  const Urgency = self.MailUrgency;
  const Links = self.MailLinkScanner;
  const Attach = self.MailAttachment;
  const Qr = self.MailQrExtractor;
  const Risk = self.MailRisk;
  const Lev = self.MailLevenshtein;

  const HOST_ID = 'mailsentry-banner-host';

  // ============================================================
  // BRITTLE ZONE — Gmail selectors. Update here if Gmail changes.
  // ============================================================
  const SELECTORS = {
    openEmail: 'div[role="main"]',
    subject: 'h2.hP',
    senderSpan: 'span.gD',          // has [email] and [name] attrs
    bodyText: 'div.a3s',            // message body container
    attachmentName: 'span.aV3, .aQA .aV3', // attachment filename chips
    attachmentArea: '.aZo, .aQH',
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // Returns the most-recently-rendered open message body, or null.
  function getOpenEmailEl() {
    const bodies = $all(SELECTORS.bodyText);
    return bodies.length ? bodies[bodies.length - 1] : null;
  }

  function getSubject() {
    const h = $(SELECTORS.subject);
    return h ? h.textContent.trim() : '';
  }

  // Raw "Display Name <addr@domain>" reconstructed from Gmail's sender span attrs.
  function getSenderRaw() {
    const spans = $all(SELECTORS.senderSpan).filter((s) => s.getAttribute('email'));
    if (!spans.length) return '';
    const s = spans[0];
    const email = s.getAttribute('email') || '';
    const name = s.getAttribute('name') || s.textContent.trim() || '';
    return name ? `"${name}" <${email}>` : email;
  }

  function getBodyText(bodyEl) {
    return bodyEl ? (bodyEl.innerText || bodyEl.textContent || '').trim() : '';
  }

  function getLinks(bodyEl) {
    if (!bodyEl) return [];
    const urls = $all('a[href]', bodyEl)
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && /^https?:\/\//i.test(h));
    return Array.from(new Set(urls));
  }

  function getImages(bodyEl) {
    return bodyEl ? $all('img', bodyEl) : [];
  }

  function getAttachmentNames() {
    return $all(SELECTORS.attachmentName)
      .map((el) => el.textContent.trim())
      .filter(Boolean);
  }
  // ============================================================
  // END BRITTLE ZONE
  // ============================================================

  function loadState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['vendors', 'allowlist', 'settings'], (s) => {
        resolve({
          vendors: s.vendors || [],
          allowlist: s.allowlist || { enabled: false, suffixes: [], emails: [] },
          settings: s.settings || {},
        });
      });
    });
  }

  // Find the real vendor the sender is impersonating / matching, for Verify.
  function matchVendor(parsed, vendors) {
    const root = Domain.rootDomain(parsed.domain);
    let exact = null, near = null, nearDist = 99;
    for (const v of vendors) {
      const vroot = Domain.rootDomain(v.domain);
      if (!vroot) continue;
      if (root && root === vroot) { exact = v; break; }
      const d = Lev.levenshtein(root, vroot);
      if (d <= 2 && d < nearDist) { near = v; nearDist = d; }
    }
    if (exact) return { vendor: exact, kind: 'exact' };
    if (near) return { vendor: near, kind: 'lookalike' };
    // display-name claims a vendor brand?
    const nameToks = new Set(
      (parsed.displayName || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
    );
    for (const v of vendors) {
      const vToks = v.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      if (vToks.length && vToks.every((t) => nameToks.has(t))) return { vendor: v, kind: 'name' };
    }
    return null;
  }

  // Run all five checks → composite. Returns { result, parsed, signals }.
  async function analyze(email, state) {
    const parsedRes = Domain.domainScore(email.senderRaw, {
      vendors: state.vendors,
      allowlist: state.allowlist,
    });
    const urgency = Urgency.urgencyScore(email.subject, email.body);
    const attach = Attach.attachmentScore({
      hasAttachment: email.attachmentNames.length > 0,
      attachmentNames: email.attachmentNames,
      subject: email.subject,
      body: email.body,
    });

    const apiKey = state.settings.safeBrowsingKey || '';
    const link = await Links.linkScore(email.links, apiKey);

    // QR: decode body images → URLs → same scanner. Stubbed until jsQR bundled.
    const qrDecode = Qr.decode(email.images);
    const qr = qrDecode.urls.length
      ? await Links.linkScore(qrDecode.urls, apiKey)
      : { score: 0, stubbed: !apiKey };

    const result = Risk.compositeScore({
      domain: parsedRes.score,
      urgency: urgency.score,
      link: link.score,
      attachment: attach.score,
      qr: qr.score,
    });

    return {
      result,
      parsed: parsedRes.parsed,
      raw: { domain: parsedRes, urgency, link, attach, qr },
    };
  }

  // ---- Banner (Shadow DOM, inline scoped CSS — decision #1) ----
  function removeBanner() {
    const old = document.getElementById(HOST_ID);
    if (old) old.remove();
  }

  function pct(n) { return Math.round(n * 100); }

  function renderBanner(emailEl, analysis, state) {
    removeBanner();
    const { result, parsed, raw } = analysis;
    const isRed = result.level === 'red';

    const host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });

    const vendorMatch = matchVendor(parsed, state.vendors);

    const breakdownRows = [
      ['Sender / domain', raw.domain.score, result.breakdown.domain],
      ['Urgency', raw.urgency.score, result.breakdown.urgency],
      ['Link safety', raw.link.score, result.breakdown.link],
      ['Attachment', raw.attach.score, result.breakdown.attachment],
      ['QR code', raw.qr.score, result.breakdown.qr],
    ].map(([label, sub, contrib]) =>
      `<tr><td>${label}</td><td>${pct(sub)}%</td><td>+${pct(contrib)}</td></tr>`
    ).join('');

    const stubbedNote = raw.link.stubbed
      ? '<div class="note">Link scan in stub mode — add a Safe Browsing key in the popup to enable.</div>'
      : '';

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          border-radius: 10px; padding: 12px 14px; margin: 8px 0 4px;
          border: 1px solid ${isRed ? '#fca5a5' : '#a7f3d0'};
          background: ${isRed ? '#fef2f2' : '#f0fdf4'};
          color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,.06);
        }
        .top { display: flex; align-items: center; gap: 10px; }
        .icon { font-size: 20px; }
        .title { font-weight: 700; font-size: 14px; color: ${isRed ? '#b91c1c' : '#047857'}; }
        .score { margin-left: auto; font-size: 12px; color: #6b7280; }
        .msg { font-size: 13px; margin: 6px 0 0; line-height: 1.45; }
        details { margin-top: 8px; }
        summary { cursor: pointer; font-size: 12px; color: #2563eb; }
        table { border-collapse: collapse; margin-top: 6px; font-size: 12px; width: 100%; }
        td { padding: 2px 8px 2px 0; color: #374151; }
        td:nth-child(2), td:nth-child(3) { text-align: right; color: #6b7280; }
        .verify {
          margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        button {
          background: #2563eb; color: #fff; border: none; border-radius: 7px;
          padding: 7px 12px; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .phone {
          display: none; font-size: 13px; font-weight: 600; color: #111827;
          background: #fff; border: 1px solid #d1d5db; border-radius: 7px; padding: 6px 10px;
        }
        .phone b { color: #2563eb; }
        .note { font-size: 11px; color: #92400e; margin-top: 8px; }
      </style>
      <div class="bar">
        <div class="top">
          <span class="icon">${isRed ? '&#9888;&#65039;' : '&#9989;'}</span>
          <span class="title">${isRed ? 'Possible scam — verify before acting' : 'No scam indicators detected'}</span>
          <span class="score">risk ${pct(result.composite)}%</span>
        </div>
        <p class="msg">
          ${isRed
            ? 'This email scored above the risk threshold. If it asks you to pay or change bank details, confirm by phone before doing anything.'
            : 'MailSentry checked sender, urgency, links, attachments and QR codes. Nothing suspicious — stay alert anyway.'}
        </p>
        <details>
          <summary>Why this score?</summary>
          <table>
            <tr><td><b>Signal</b></td><td><b>raw</b></td><td><b>weighted</b></td></tr>
            ${breakdownRows}
          </table>
        </details>
        <div class="verify">
          <button id="verifyBtn">Verify sender</button>
          <span class="phone" id="phoneOut"></span>
        </div>
        ${stubbedNote}
      </div>
    `;

    shadow.getElementById('verifyBtn').addEventListener('click', () => {
      const out = shadow.getElementById('phoneOut');
      out.style.display = 'inline-block';
      if (vendorMatch && vendorMatch.vendor.phone) {
        const v = vendorMatch.vendor;
        const label = vendorMatch.kind === 'lookalike'
          ? `Looks like <b>${v.name}</b> — call the number on file, not anything in this email:`
          : `On file for <b>${v.name}</b>:`;
        out.innerHTML = `${label} <b>${v.phone}</b>`;
      } else {
        out.innerHTML = 'No matching vendor on file. Add them in the MailSentry popup to store a verified phone number.';
      }
    });

    emailEl.parentNode.insertBefore(host, emailEl);
  }

  // ---- Orchestration: detect opened email, dedupe, re-run on navigation ----
  let lastKey = '';

  async function scan() {
    const bodyEl = getOpenEmailEl();
    if (!bodyEl) { lastKey = ''; removeBanner(); return; }

    const subject = getSubject();
    const senderRaw = getSenderRaw();
    if (!senderRaw) return; // header not rendered yet

    const key = `${senderRaw}::${subject}`;
    if (key === lastKey && document.getElementById(HOST_ID)) return; // already done
    lastKey = key;

    const state = await loadState();
    const email = {
      senderRaw,
      subject,
      body: getBodyText(bodyEl),
      links: getLinks(bodyEl),
      images: getImages(bodyEl),
      attachmentNames: getAttachmentNames(),
    };

    try {
      const analysis = await analyze(email, state);
      // bail if user navigated away mid-scan
      if (getOpenEmailEl() !== bodyEl) return;
      renderBanner(bodyEl, analysis, state);
    } catch (e) {
      console.warn('[MailSentry] scan failed:', e);
    }
  }

  const debouncedScan = (() => {
    let t = null;
    return () => { clearTimeout(t); t = setTimeout(scan, 350); };
  })();

  function start() {
    const obs = new MutationObserver(debouncedScan);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', debouncedScan);
    debouncedScan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
