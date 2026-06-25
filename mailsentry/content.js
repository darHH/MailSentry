// content.js — MailSentry Gmail integration (Phase 3).
// THE BRITTLE PART. Every Gmail DOM selector lives in SELECTORS + the get* helpers
// below, so a Gmail markup change breaks only this file (ideally only this block).
//
// Flow: detect an opened email → parse it → run the 5 checks → compute composite
// (risk.js) → inject a Shadow-DOM banner (red >=0.3 / green) with a plain-language
// per-check breakdown explaining why it was flagged.

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

  // Find the real vendor the sender is impersonating / matching, so the breakdown
  // can name it. Mirrors lookalikeSignal granularity: email entries match on the
  // whole address, domain entries match on registrable domain.
  function matchVendor(parsed, vendors) {
    const root = Domain.rootDomain(parsed.domain);
    const sAddr = parsed.address || '';
    let exact = null, near = null, nearDist = 99;
    for (const v of vendors) {
      const sc = Domain.vendorScope(v);
      if (sc.kind === 'email') {
        if (sAddr && sAddr === sc.email) { exact = v; break; }
        const d = Lev.levenshtein(sAddr, sc.email);
        if (d <= 2 && d < nearDist) { near = v; nearDist = d; }
      } else if (sc.kind === 'domain' && sc.domain) {
        const vroot = Domain.rootDomain(sc.domain);
        if (!vroot) continue;
        if (root && root === vroot) { exact = v; break; }
        const d = Lev.levenshtein(root, vroot);
        if (d <= 2 && d < nearDist) { near = v; nearDist = d; }
      }
    }
    if (exact) return { vendor: exact, kind: 'exact' };
    if (near) return { vendor: near, kind: 'lookalike' };
    // display-name claims a vendor brand?
    const nameToks = new Set(
      (parsed.displayName || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
    );
    for (const v of vendors) {
      const vToks = (v.name || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
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

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function quoteList(arr, n) {
    return arr.slice(0, n).map((x) => `“${esc(x)}”`).join(', ') + (arr.length > n ? '…' : '');
  }

  // Turn the raw check outputs into plain-language verdicts a non-technical user
  // can read to answer "why was this flagged, and is it actually dangerous?".
  // Each row: { id, state:'bad'|'off'|'ok', name, text }.
  function buildChecks(analysis, email, vendorMatch) {
    const { parsed, raw } = analysis;
    const sig = raw.domain.signals;
    const rows = [];

    // 1. Sender
    if (sig.lookalike >= 1) {
      const mv = vendorMatch && vendorMatch.vendor;
      const vn = mv
        ? esc(mv.name || Domain.vendorScope(mv).email || Domain.vendorScope(mv).domain)
        : 'a saved contact';
      rows.push({ id: 'domain', state: 'bad', name: 'Sender',
        text: `The address <b>${esc(parsed.address || parsed.domain)}</b> is a near-copy of your saved contact <b>${vn}</b> — only a character or two different. This is the classic impersonation trick: confirm before trusting it.` });
    } else if (sig.nameMismatch >= 1) {
      rows.push({ id: 'domain', state: 'bad', name: 'Sender',
        text: `The name shown is “<b>${esc(parsed.displayName)}</b>” but the real address is <b>${esc(parsed.address)}</b> — they don’t match. Anyone can set any display name.` });
    } else if (sig.allowlist >= 1) {
      rows.push({ id: 'domain', state: 'bad', name: 'Sender',
        text: `<b>${esc(parsed.address)}</b> is not on your approved-senders allowlist.` });
    } else {
      rows.push({ id: 'domain', state: 'ok', name: 'Sender',
        text: `<b>${esc(parsed.address || parsed.domain)}</b> — no signs of impersonation.` });
    }

    // 2. Urgency / pressure wording
    if (raw.urgency.score > 0 && raw.urgency.matched.length) {
      rows.push({ id: 'urgency', state: 'bad', name: 'Pressure wording',
        text: `Found rush/payment-pressure phrases: ${quoteList(raw.urgency.matched, 5)}. Scams use urgency to stop you checking.` });
    } else {
      rows.push({ id: 'urgency', state: 'ok', name: 'Pressure wording',
        text: 'No urgent or payment-pressure language.' });
    }

    // 3. Links
    if (raw.link.hits && raw.link.hits.length) {
      rows.push({ id: 'link', state: 'bad', name: 'Links',
        text: `${raw.link.hits.length} link(s) flagged as dangerous by Google Safe Browsing: ${quoteList(raw.link.hits, 2)}. Do not click.` });
    } else if (email.links.length === 0) {
      rows.push({ id: 'link', state: 'ok', name: 'Links', text: 'No links in this email.' });
    } else if (raw.link.stubbed) {
      rows.push({ id: 'link', state: 'off', name: 'Links',
        text: `${email.links.length} link(s) not scanned — add a Safe Browsing key in settings to switch this on.` });
    } else if (raw.link.checked > 0) {
      rows.push({ id: 'link', state: 'ok', name: 'Links',
        text: `All ${raw.link.checked} link(s) checked against Google Safe Browsing — none known-dangerous.` });
    } else {
      rows.push({ id: 'link', state: 'ok', name: 'Links', text: 'No links in this email.' });
    }

    // 4. Attachment
    if (raw.attach.score > 0) {
      rows.push({ id: 'attach', state: 'bad', name: 'Attachment',
        text: `Attachment on a payment/invoice-style email: ${quoteList(email.attachmentNames, 3)}. Fake invoices often arrive exactly this way.` });
    } else if (email.attachmentNames.length) {
      rows.push({ id: 'attach', state: 'ok', name: 'Attachment',
        text: `Attachment present (${quoteList(email.attachmentNames, 3)}) — not tied to a payment request.` });
    } else {
      rows.push({ id: 'attach', state: 'ok', name: 'Attachment', text: 'No attachments.' });
    }

    // 5. QR codes
    if (raw.qr.score > 0) {
      rows.push({ id: 'qr', state: 'bad', name: 'QR code',
        text: 'A QR code links to a flagged-dangerous site. Don’t scan it.' });
    } else if (email.images.length && raw.qr.stubbed) {
      rows.push({ id: 'qr', state: 'off', name: 'QR code',
        text: `QR scanning is off in this build (${email.images.length} image(s) not scanned).` });
    } else {
      rows.push({ id: 'qr', state: 'ok', name: 'QR code', text: 'No QR codes detected.' });
    }

    return rows;
  }

  function renderBanner(emailEl, analysis, state, email) {
    removeBanner();
    const { result, parsed } = analysis;
    const isRed = result.level === 'red';

    const host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });

    const vendorMatch = matchVendor(parsed, state.vendors);
    const checks = buildChecks(analysis, email, vendorMatch);

    // Order: problems first, then "off"/not-scanned, then passed.
    const order = { bad: 0, off: 1, ok: 2 };
    checks.sort((a, b) => order[a.state] - order[b.state]);

    const iconFor = { bad: '&#9888;&#65039;', off: '&#9899;', ok: '&#10003;' };
    const rowsHtml = checks.map((c) =>
      `<div class="chk ${c.state}">
         <span class="ci">${iconFor[c.state]}</span>
         <span class="ct"><b class="cn">${c.name}.</b> ${c.text}</span>
       </div>`
    ).join('');

    // "Main reason" = the problem that pushed the score up the most.
    const contribBy = {
      domain: result.breakdown.domain, urgency: result.breakdown.urgency,
      link: result.breakdown.link, attach: result.breakdown.attachment, qr: result.breakdown.qr,
    };
    const bad = checks.filter((c) => c.state === 'bad')
      .sort((a, b) => (contribBy[b.id] || 0) - (contribBy[a.id] || 0));
    const mainReason = bad.length
      ? `<div class="main">Main reason: <b>${bad[0].name.toLowerCase()}</b>.</div>` : '';
    const summaryLabel = isRed
      ? `Why flagged? (${bad.length} issue${bad.length === 1 ? '' : 's'})`
      : 'See all checks';

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
        details { margin-top: 10px; }
        summary { cursor: pointer; font-size: 13px; font-weight: 600; color: #2563eb; }
        .main { font-size: 12px; color: #6b7280; margin: 8px 0 2px; }
        .checks { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
        .chk { display: flex; gap: 8px; font-size: 13px; line-height: 1.45; }
        .chk .ci { flex: 0 0 auto; font-size: 14px; line-height: 1.5; }
        .chk .ct { color: #374151; }
        .chk .cn { color: #111827; }
        .chk.bad .cn { color: #b91c1c; }
        .chk.ok .ci { color: #16a34a; }
        .chk.off .ci { color: #9ca3af; }
        .chk.off .ct, .chk.off .cn { color: #6b7280; }
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
            ? 'This email scored above the risk threshold. If it asks you to pay or change bank details, confirm through a channel you already trust (a saved phone number or in person) before doing anything.'
            : 'MailSentry checked sender, urgency, links, attachments and QR codes. Nothing suspicious — stay alert anyway.'}
        </p>
        <details${isRed ? ' open' : ''}>
          <summary>${summaryLabel}</summary>
          ${mainReason}
          <div class="checks">${rowsHtml}</div>
        </details>
      </div>
    `;

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
      renderBanner(bodyEl, analysis, state, email);
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
