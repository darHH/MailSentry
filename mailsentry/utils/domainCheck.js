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

  // Tokenize a string into lowercase word tokens for matching.
  function tokens(s) {
    return String(s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3); // drop noise like "co", "pte", "&"
  }

  // Brand tokens derived from a vendor's DOMAIN (no separate name field needed).
  // e.g. "acme-supplies.com" → ["acme", "supplies"]. Drops common domain noise.
  const DOMAIN_STOP = new Set(['com', 'net', 'org', 'www', 'mail', 'gov', 'edu', 'biz', 'app', 'web']);
  function brandTokens(domain) {
    return tokens(domain).filter((t) => !DOMAIN_STOP.has(t));
  }

  // Parse one unified scope entry (used by BOTH vendors and allowlist). Rule:
  //   "@acme.com"      → domain entry  (matches that domain + its subdomains)
  //   "jo@acme.com"    → email entry   (exact address)
  //   "acme.com"       → domain entry  (no '@' → treated as a bare domain)
  // Returns { kind:'domain'|'email'|'empty', domain, email }.
  function parseScopeEntry(raw) {
    raw = (raw == null ? '' : String(raw)).toLowerCase().trim();
    if (!raw) return { kind: 'empty', domain: '', email: '' };
    if (raw[0] === '@') {
      const dom = raw.slice(1).replace(/^[.*]+/, '').replace(/^\.+/, '');
      return { kind: 'domain', domain: dom, email: '' };
    }
    if (raw.includes('@')) {
      return { kind: 'email', email: raw, domain: raw.split('@').pop() };
    }
    // legacy "*.acme.com" or bare "acme.com" → domain
    return { kind: 'domain', domain: raw.replace(/^\*\./, ''), email: '' };
  }

  // A vendor is just a scope entry (+ optional display name). `entry` is canonical;
  // `domain`/`email` accepted for back-compat with previously stored vendors.
  function vendorScope(v) {
    return parseScopeEntry(v.entry != null ? v.entry : (v.domain || v.email || ''));
  }

  /**
   * Sub-signal 1: lookalike via Levenshtein. Granularity follows the entry kind:
   *   email entry  → compare the WHOLE address (catches username typo-squat)
   *   domain entry → compare registrable domains (catches lookalike domains)
   */
  function lookalikeSignal(parsed, vendors) {
    const sAddr = parsed.address || '';
    const sRoot = rootDomain(parsed.domain);
    let worst = 0;
    for (const v of vendors || []) {
      const sc = vendorScope(v);
      if (sc.kind === 'email') {
        if (!sAddr) continue;
        if (sAddr === sc.email) return 0; // exact → it IS the vendor, safe
        const d = levenshtein(sAddr, sc.email);
        if (d >= 1 && d <= 2) worst = Math.max(worst, 1.0);
      } else if (sc.kind === 'domain' && sc.domain) {
        const vroot = rootDomain(sc.domain);
        if (!vroot || !sRoot) continue;
        if (sRoot === vroot) return 0; // exact domain → it IS the vendor, safe
        const d = levenshtein(sRoot, vroot);
        if (d >= 1 && d <= 2) worst = Math.max(worst, 1.0);
      }
    }
    return worst;
  }

  /**
   * Sub-signal 2: display name claims a vendor/brand, address domain unrelated.
   * The "brand" is derived from the vendor's own domain (brandTokens) — no
   * separate vendor name field required.
   */
  function nameMismatchSignal(displayName, domain, vendors) {
    if (!displayName) return 0;
    const nameToks = new Set(tokens(displayName));
    if (nameToks.size === 0) return 0;
    const root = rootDomain(domain);

    for (const v of vendors || []) {
      const vdom = vendorScope(v).domain;
      const vToks = brandTokens(vdom);
      if (vToks.length === 0) continue;
      // display name claims this vendor if it contains all the brand's tokens
      const claims = vToks.every((t) => nameToks.has(t));
      if (!claims) continue;
      const vroot = rootDomain(vdom);
      // claims the vendor but the domain is neither the vendor's nor a near-lookalike of it
      const d = levenshtein(root, vroot);
      if (d > 2) return 1.0;
    }
    return 0;
  }

  /**
   * Sub-signal 3: strict mode (opt-in). When enabled, every sender that is not an
   * exact match of a trusted contact scores high. Uses the SAME trusted-contacts
   * list as lookalikeSignal — no separate allowlist (a trusted contact IS an
   * approved sender). Domain entries approve the whole domain; email entries
   * approve only that address.
   */
  function allowlistSignal(address, domain, vendors, enabled) {
    if (!enabled) return 0;
    for (const v of vendors || []) {
      const sc = vendorScope(v);
      if (sc.kind === 'email') {
        if (address === sc.email) return 0;
      } else if (sc.kind === 'domain' && sc.domain) {
        if (domain === sc.domain || domain.endsWith('.' + sc.domain)) return 0;
      }
    }
    return 1.0; // not a trusted contact
  }

  /**
   * Composite sender/domain score.
   * @param {string|object} sender  raw From header, or { displayName, address }
   * @param {object} opts { vendors:[{name,entry}], allowlist:{enabled,entries} }
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
      allowlist: allowlistSignal(parsed.address, parsed.domain, vendors, allowlist.enabled),
    };

    const score = Math.max(signals.lookalike, signals.nameMismatch, signals.allowlist);
    return { score, signals, parsed };
  }

  const api = { domainScore, parseSender, rootDomain, parseScopeEntry, vendorScope };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailDomainCheck = api;
})(typeof self !== 'undefined' ? self : this);
