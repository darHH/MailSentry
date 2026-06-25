// domainCheck.js — sender/domain score (the 0.40-weight signal).
// score = max of three independent sub-signals. Any one firing high flags the email:
//   1. Lookalike      — Levenshtein 1-2 char diff vs a known vendor. ADAPTIVE:
//                       vendor stored as a DOMAIN (acme.com)        → compare domains
//                       vendor stored as a FULL EMAIL (a@b.com)     → compare whole addresses
//                       (lets it catch username impersonation on shared/freemail domains,
//                        e.g. wnaya@rocketmail.com vs wnayar@rocketmail.com)
//   2. Name mismatch  — display name claims a known vendor/brand, address domain unrelated
//   3. Allowlist mode — (opt-in) sender not on the allowed suffix/email list
//
// Pure module. Depends only on levenshtein.js.

(function (root) {
  'use strict';

  const lev =
    (typeof require !== 'undefined' ? require('./levenshtein') : root.MailLevenshtein);
  const levenshtein = lev.levenshtein;

  /**
   * Parse a raw From header into { displayName, address, domain }.
   * Accepts:  "Acme Supplies" <a@b.com>  |  Acme <a@b.com>  |  a@b.com
   */
  function parseSender(raw) {
    raw = (raw == null ? '' : String(raw)).trim();
    let displayName = '';
    let address = '';

    const angle = raw.match(/^(.*?)<([^>]+)>\s*$/);
    if (angle) {
      displayName = angle[1].trim().replace(/^["']|["']$/g, '').trim();
      address = angle[2].trim();
    } else {
      address = raw;
    }

    address = address.toLowerCase();
    const at = address.lastIndexOf('@');
    const domain = at >= 0 ? address.slice(at + 1) : '';
    return { displayName, address, domain };
  }

  // Strip leading subdomains down to the registrable-ish root for comparison.
  // Cheap heuristic (no PSL): keep the last two labels, or three for known 2-part TLDs.
  function rootDomain(domain) {
    if (!domain) return '';
    const parts = domain.toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const twoPartTlds = ['com.sg', 'com.au', 'co.uk', 'com.my', 'co.jp', 'com.cn'];
    const lastTwo = parts.slice(-2).join('.');
    if (twoPartTlds.includes(lastTwo)) return parts.slice(-3).join('.');
    return lastTwo;
  }

  // Tokenize a brand/vendor name into lowercase word tokens for matching.
  function tokens(s) {
    return String(s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3); // drop noise like "co", "pte", "&"
  }

  // Normalise a stored vendor into { email, domain }. Tolerates a full email typed
  // into the `domain` field (common user mistake / intentional for personal contacts).
  function vendorIdentity(v) {
    let email = (v.email || '').toLowerCase().trim();
    let domain = (v.domain || '').toLowerCase().trim();
    if (!email && domain.includes('@')) { email = domain; domain = ''; }
    if (!domain && email.includes('@')) domain = email.split('@')[1];
    return { email, domain };
  }

  /**
   * Sub-signal 1: lookalike via Levenshtein. Adaptive granularity per vendor:
   *   full-email vendor → compare the WHOLE address (catches username typo-squat)
   *   domain vendor     → compare registrable domains (catches lookalike domains)
   */
  function lookalikeSignal(parsed, vendors) {
    const sAddr = parsed.address || '';
    const sRoot = rootDomain(parsed.domain);
    let worst = 0;
    for (const v of vendors || []) {
      const id = vendorIdentity(v);
      if (id.email) {
        // address-level: e.g. wnaya@rocketmail.com vs wnayar@rocketmail.com (d=1)
        if (!sAddr) continue;
        if (sAddr === id.email) return 0; // exact → it IS the vendor, safe
        const d = levenshtein(sAddr, id.email);
        if (d >= 1 && d <= 2) worst = Math.max(worst, 1.0);
      } else if (id.domain) {
        const vroot = rootDomain(id.domain);
        if (!vroot || !sRoot) continue;
        if (sRoot === vroot) return 0; // exact domain → it IS the vendor, safe
        const d = levenshtein(sRoot, vroot);
        if (d >= 1 && d <= 2) worst = Math.max(worst, 1.0);
      }
    }
    return worst;
  }

  /** Sub-signal 2: display name claims a vendor/brand, address domain unrelated. */
  function nameMismatchSignal(displayName, domain, vendors) {
    if (!displayName) return 0;
    const nameToks = new Set(tokens(displayName));
    if (nameToks.size === 0) return 0;
    const root = rootDomain(domain);

    for (const v of vendors || []) {
      const vToks = tokens(v.name);
      if (vToks.length === 0) continue;
      // display name claims this vendor if it contains all the vendor's significant tokens
      const claims = vToks.every((t) => nameToks.has(t));
      if (!claims) continue;
      const vroot = rootDomain(vendorIdentity(v).domain);
      // claims the vendor but the domain is neither the vendor's nor a near-lookalike of it
      const d = levenshtein(root, vroot);
      if (d > 2) return 1.0;
    }
    return 0;
  }

  /** Sub-signal 3: allowlist mode (opt-in). Everything not pre-approved scores high. */
  function allowlistSignal(address, domain, allowlist) {
    if (!allowlist || !allowlist.enabled) return 0;
    const emails = (allowlist.emails || []).map((e) => e.toLowerCase().trim());
    if (emails.includes(address)) return 0;

    const suffixes = allowlist.suffixes || [];
    for (let suf of suffixes) {
      suf = suf.toLowerCase().trim().replace(/^@/, '');
      if (!suf) continue;
      if (suf.startsWith('*.')) {
        const base = suf.slice(2);
        if (domain === base || domain.endsWith('.' + base)) return 0;
      } else if (domain === suf || domain.endsWith('.' + suf)) {
        return 0;
      }
    }
    return 1.0; // not on allowlist
  }

  /**
   * Composite sender/domain score.
   * @param {string|object} sender  raw From header, or { displayName, address }
   * @param {object} opts { vendors:[{name,domain}], allowlist:{enabled,suffixes,emails} }
   * @returns {{ score:number, signals:object, parsed:object }}
   */
  function domainScore(sender, opts) {
    opts = opts || {};
    const vendors = opts.vendors || [];
    const allowlist = opts.allowlist || { enabled: false };

    const parsed =
      typeof sender === 'string'
        ? parseSender(sender)
        : {
            displayName: (sender && sender.displayName) || '',
            address: ((sender && sender.address) || '').toLowerCase(),
            domain:
              (sender && sender.domain) ||
              (((sender && sender.address) || '').split('@')[1] || '').toLowerCase(),
          };

    const signals = {
      lookalike: lookalikeSignal(parsed, vendors),
      nameMismatch: nameMismatchSignal(parsed.displayName, parsed.domain, vendors),
      allowlist: allowlistSignal(parsed.address, parsed.domain, allowlist),
    };

    const score = Math.max(signals.lookalike, signals.nameMismatch, signals.allowlist);
    return { score, signals, parsed };
  }

  const api = { domainScore, parseSender, rootDomain, vendorIdentity };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailDomainCheck = api;
})(typeof self !== 'undefined' ? self : this);
