// exaCheck.js — NEW sender sub-signal: "is the real company behind this domain
// actually living at THIS domain, or is the sender a lookalike of an established
// web entity the user has never seeded?" See the Exa integration master plan.
//
// Two halves, by design (see plan §2 — Determinism):
//   • fetchExa()        IMPURE, thin, injectable. Live network. NOT unit-tested.
//   • scoreExaResponse() PURE. Same inputs → identical output, always. No clock,
//                        no randomness, no network, no LLM. All weights are fixed
//                        constants below. This is the only half the tests cover.
//
// THE ONE RULE (plan §11): rich Exa data about a sender's domain is evidence about
// the company being IMPERSONATED, not proof the sender is legit. The score comes
// from the MISMATCH between the resolved canonical domain and the actual sender —
// never from the mere presence of data. If a change ever makes "Exa returned lots
// of info" push toward SAFE, that is a security regression (guarded by test #2).
//
// REAL EXA /search SHAPE (verified against live captures in demo/exa-fixtures/):
//   results[].url                                  → canonical signal (consensus)
//   results[].text / results[].highlights[]        → @-format intel
//   results[].entities[].properties.workforce.total
//   results[].entities[].properties.webTraffic.history[]
//   results[].entities[].properties.headquarters
// NOTE: /search does NOT return a per-result `homepage`; the canonical company
// domain is derived from CONSENSUS across result URLs, not from an entity field.
// Exa matched ".info" → "...international.com" for ALL results: that consensus IS
// the semantic correction, and the mismatch against it is the signal.
//
// Honest limits encoded here (plan §6): Exa is NOT WHOIS (no real domain-age — we
// ignore any WHOIS text that leaks into result bodies); absence of footprint ≠
// guilt (THIN_FOOTPRINT_WEAK only nudges); Exa matches on MEANING not exact
// string, so the signal is always relative, never absolute.
//
// Depends only on levenshtein.js + domainCheck.js (rootDomain). Zero runtime deps.

(function (root) {
  'use strict';

  const lev =
    (typeof require !== 'undefined' ? require('./levenshtein') : root.MailLevenshtein);
  const levenshtein = lev.levenshtein;
  const dc =
    (typeof require !== 'undefined' ? require('./domainCheck') : root.MailDomainCheck);
  const rootDomain = dc.rootDomain;

  // ---------------------------------------------------------------------------
  // FIXED CONSTANTS — tuned once against real fixtures, then frozen (plan §5).
  // ---------------------------------------------------------------------------

  // Absence of any established footprint is a WEAK risk signal, never a strong
  // one: a brand-new LEGIT vendor looks identical to a fresh scam domain to Exa.
  const THIN_FOOTPRINT_WEAK = 0.25;

  // A mismatch against an established entity flags at full strength.
  const MISMATCH_FLAG = 1.0;

  // Lookalike core-name test: edit distance within max(2, 25% of the longer core).
  // The relative slack is what catches the headline ".info" case
  // (ceocoachinternational vs ceocoachinginternational = 3 edits) without firing
  // on genuinely unrelated names.
  const LOOKALIKE_ABS = 2;
  const LOOKALIKE_REL = 0.25;

  // Consensus canonical: the winning result-URL domain must (a) be a STRICT
  // winner and (b) cover at least this fraction of all results. Real Exa results
  // are noisy; a weak plurality (e.g. 2-of-5 scattered) means "nothing
  // established to compare against" → thin, not a confident canonical.
  const CONSENSUS_MIN_FRACTION = 0.6;
  const CONSENSUS_MIN_COUNT = 2;

  // Footprint-depth → confidence multiplier on a mismatch. A mismatch against a
  // DEEPLY established entity is stronger than against a thin one. Depth never
  // flags on its own — it only scales an existing mismatch.
  const DEPTH_HIGH = 1.0;
  const DEPTH_MID = 0.6;
  // Thresholds that qualify an entity as "deeply established":
  const DEEP_WORKFORCE = 25;
  const DEEP_TRAFFIC_MONTHS = 3;

  // "Multi-tenant" domains — third-party sites that host/list MANY companies, so a
  // result URL on one is never evidence of where a SINGLE company lives online (the
  // opposite of a company's own canonical domain). Four kinds: data brokers /
  // contact aggregators, WHOIS / domain registries, and social / reference sites.
  // They may still supply useful @-format intel, but must NEVER count toward the
  // canonical consensus (plan §5 Step A).
  const CONSENSUS_EXCLUDE = new Set([
    // brokers / aggregators
    'zoominfo.com', 'leadiq.com', 'prospeo.io', 'aeroleads.com', 'signalhire.com',
    'rocketreach.co', 'crunchbase.com', 'usitestat.com', 'scam-detector.com',
    'lusha.com', 'apollo.io', 'contactout.com', 'kaspr.io', 'hunter.io',
    'seocxw.com', 'mainkeys.net',
    // WHOIS / registry
    'icann.org', 'eurodns.com',
    // social / reference (real companies appear here but it's not their domain)
    'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
    'youtube.com', 'wikipedia.org', 'bloomberg.com', 'glassdoor.com', 'indeed.com',
  ]);

  // Freemail domains: Exa can't assess identity that isn't in the domain. These
  // are GATED OUT before any call (plan §4.1) — handled by the existing
  // whole-address + display-name checks instead.
  const FREEMAIL = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'msn.com', 'yahoo.com', 'rocketmail.com', 'ymail.com', 'icloud.com',
    'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com',
    'yandex.com', 'mail.com', 'zoho.com',
  ]);

  const EXA_ENDPOINT = 'https://api.exa.ai/search';

  // ---------------------------------------------------------------------------
  // Helpers (pure)
  // ---------------------------------------------------------------------------

  // Registrable root with the TLD stripped → the comparable "core name".
  // ceocoachinginternational.com → ceocoachinginternational
  // rafflesindustrial.com.sg     → rafflesindustrial
  function coreName(domain) {
    const r = rootDomain(domain);
    if (!r) return '';
    return r.split('.')[0];
  }

  // Pull a registrable root domain out of a URL or bare host.
  function domainFromUrl(url) {
    if (!url) return '';
    let s = String(url).trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, '');   // strip scheme
    s = s.split('/')[0];                 // strip path
    s = s.split('?')[0].split('#')[0];
    s = s.split('@').pop();              // strip any userinfo
    s = s.split(':')[0];                 // strip port
    return rootDomain(s);
  }

  // Two cores are a lookalike when they share a name but not exactly: same core
  // with a different TLD, or within the relative edit-distance slack.
  function isLookalikeCore(senderRoot, canonicalRoot) {
    if (!senderRoot || !canonicalRoot) return false;
    if (senderRoot === canonicalRoot) return false; // exact handled by caller
    const sc = coreName(senderRoot);
    const cc = coreName(canonicalRoot);
    if (!sc || !cc) return false;
    if (sc === cc) return true; // same name, different TLD (e.g. .com vs .info)
    const d = levenshtein(sc, cc);
    const slack = Math.max(LOOKALIKE_ABS, Math.floor(Math.max(sc.length, cc.length) * LOOKALIKE_REL));
    return d <= slack;
  }

  // Deterministic consensus canonical (plan §5 Step A, adapted to the real
  // /search shape): count result-URL domains (excluding brokers/social), require
  // a STRICT winner covering ≥ CONSENSUS_MIN_FRACTION of ALL results. Ties or
  // weak pluralities → null (thin). Ordering from Exa is never trusted.
  function consensusDomain(results) {
    const total = (results || []).length;
    if (total === 0) return null;
    const counts = new Map();
    for (const r of results) {
      const dom = domainFromUrl(r && r.url);
      if (!dom || CONSENSUS_EXCLUDE.has(dom)) continue;
      counts.set(dom, (counts.get(dom) || 0) + 1);
    }
    if (counts.size === 0) return null;
    // sort by count desc, then domain asc (deterministic tie-break)
    const ranked = [...counts.entries()].sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1);
    const [topDom, topCount] = ranked[0];
    const tie = ranked.length > 1 && ranked[1][1] === topCount;
    const need = Math.max(CONSENSUS_MIN_COUNT, Math.ceil(CONSENSUS_MIN_FRACTION * total));
    if (tie || topCount < need) return null; // ambiguous / weak → thin
    return topDom;
  }

  // Best company entity across results (for footprint depth only — NOT for the
  // canonical domain). Picks highest workforce; entity carries no domain field,
  // so it is used purely to gauge how established the matched company is.
  function bestEntity(results) {
    let best = null;
    let bestW = -1;
    for (const r of results || []) {
      for (const e of (r && r.entities) || []) {
        if (!e || e.type !== 'company') continue;
        const p = e.properties || {};
        const w = (p.workforce && Number(p.workforce.total)) || 0;
        if (w > bestW) { bestW = w; best = p; }
      }
    }
    return best;
  }

  // Footprint-depth confidence multiplier from the matched entity. No entity →
  // consensus alone still gives moderate confidence (DEPTH_MID).
  function depthConfidenceFrom(entityProps) {
    if (!entityProps) return DEPTH_MID;
    const w = (entityProps.workforce && Number(entityProps.workforce.total)) || 0;
    const months =
      (entityProps.webTraffic && Array.isArray(entityProps.webTraffic.history)
        ? entityProps.webTraffic.history.length
        : 0);
    const hq = !!entityProps.headquarters;
    if (w >= DEEP_WORKFORCE || months >= DEEP_TRAFFIC_MONTHS || hq) return DEPTH_HIGH;
    return DEPTH_MID;
  }

  // Extract the set of registrable root domains referenced as @-formats across
  // result highlights/text. Brokers are excluded as @domain SOURCES (their own
  // domain), but a broker page CITING the real company's @domain is fine — we
  // already drop the broker's own root via CONSENSUS_EXCLUDE.
  function extractFormatDomains(results) {
    const re = /@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+)/gi;
    const set = new Set();
    for (const r of results || []) {
      const blobs = [];
      if (r && r.text) blobs.push(String(r.text));
      for (const h of (r && r.highlights) || []) blobs.push(String(h));
      for (const blob of blobs) {
        let m;
        while ((m = re.exec(blob)) !== null) {
          const dom = rootDomain(m[1].toLowerCase());
          if (dom && !CONSENSUS_EXCLUDE.has(dom)) set.add(dom);
        }
      }
    }
    return set;
  }

  // ---------------------------------------------------------------------------
  // scoreExaResponse — PURE. The heart of the integration.
  // ---------------------------------------------------------------------------
  /**
   * @param {object} response  raw (or cached) Exa response: { results: [...] }
   * @param {string} senderDomain  the actual sender's domain (e.g. foo.info)
   * @param {string} [senderEmail] full sender address (reserved; not required)
   * @returns {{
   *   exaScore:number, canonicalDomain:string|null, mismatch:number|null,
   *   formatViolation:number|null, depthConfidence:number, thin:boolean,
   *   reason:string
   * }}
   */
  function scoreExaResponse(response, senderDomain, senderEmail) {
    const results = (response && response.results) || [];
    const senderRoot = rootDomain(String(senderDomain || '').toLowerCase());

    // Step A — canonical entity selection (deterministic consensus).
    const canonicalDomain = consensusDomain(results);

    // Step B — domain mismatch (the spine).
    let mismatch = null;
    if (canonicalDomain) {
      if (senderRoot && senderRoot === canonicalDomain) {
        mismatch = 0; // sender IS the real company → strong SAFE
      } else if (isLookalikeCore(senderRoot, canonicalDomain)) {
        mismatch = MISMATCH_FLAG; // lookalike of an established entity → strongest flag
      } else {
        mismatch = 0; // resolved entity, but sender doesn't resemble it → not impersonation
      }
    }

    // Step C — email-format violation (concrete, high-value).
    let formatViolation = null;
    const formatDomains = extractFormatDomains(results);
    if (formatDomains.size > 0) {
      formatViolation = formatDomains.has(senderRoot) ? 0 : MISMATCH_FLAG;
    }

    // Step D/E — combine (fixed formula, plan §5 Step E).
    const thin = canonicalDomain == null && formatViolation == null;
    let exaScore;
    let depthConfidence;
    let reason;

    if (thin) {
      // Exa found nothing established to compare against. Nudge, never condemn.
      depthConfidence = DEPTH_MID;
      exaScore = THIN_FOOTPRINT_WEAK;
      reason = 'No established web presence found for this sender domain (weak signal).';
    } else {
      depthConfidence = depthConfidenceFrom(bestEntity(results));
      const base = Math.max(mismatch || 0, formatViolation || 0);
      exaScore = base * depthConfidence;
      if (base === 0) {
        reason = canonicalDomain
          ? `Sender domain matches the established web presence (${canonicalDomain}).`
          : 'Sender domain matches the known email format.';
      } else if (formatViolation === MISMATCH_FLAG && mismatch === MISMATCH_FLAG) {
        reason = `Real staff email uses a different domain than ${senderRoot}; the sender looks like a lookalike of ${canonicalDomain}.`;
      } else if (formatViolation === MISMATCH_FLAG) {
        reason = `Known email format uses a different domain than ${senderRoot}.`;
      } else {
        reason = `Sender domain doesn't match the established web presence of ${canonicalDomain}, the company it appears to represent.`;
      }
    }

    return { exaScore, canonicalDomain, mismatch, formatViolation, depthConfidence, thin, reason };
  }

  // ---------------------------------------------------------------------------
  // Gating (plan §4) — decide whether Exa is worth calling at all. Pure.
  // ---------------------------------------------------------------------------
  /**
   * @param {string} senderDomain
   * @param {object} [opts] { vendorDomains:Set|string[], currentDomainScore:number }
   * @returns {{ call:boolean, reason:string }}
   */
  function shouldQueryExa(senderDomain, opts) {
    opts = opts || {};
    const root = rootDomain(String(senderDomain || '').toLowerCase());
    if (!root) return { call: false, reason: 'no domain' };
    if (FREEMAIL.has(root)) return { call: false, reason: 'freemail' };

    const vendorDomains =
      opts.vendorDomains instanceof Set
        ? opts.vendorDomains
        : new Set((opts.vendorDomains || []).map((d) => rootDomain(String(d).toLowerCase())));
    if (vendorDomains.has(root)) return { call: false, reason: 'seeded vendor' };

    if (Number(opts.currentDomainScore) >= 1.0) {
      return { call: false, reason: 'verdict already reached' };
    }
    return { call: true, reason: 'unknown corporate sender' };
  }

  // ---------------------------------------------------------------------------
  // fetchExa — IMPURE, thin, injectable. NOT unit-tested (live network).
  // STUB-FIRST like linkScanner: no key → stubbed null result so the pipeline
  // runs end-to-end before a key is acquired. Cache-by-registrable-domain w/ TTL
  // is deferred (plan P4) — TODO below.
  // ---------------------------------------------------------------------------
  /**
   * @param {string} senderDomain
   * @param {string} apiKey  Exa key; falsy → stubbed result (no call)
   * @param {function} [fetchImpl] injectable fetch (for tests / offline stub)
   * @param {object} [cfg] { timeoutMs }
   * @returns {Promise<{response:object|null, stubbed:boolean, error?:string}>}
   */
  async function fetchExa(senderDomain, apiKey, fetchImpl, cfg) {
    cfg = cfg || {};
    if (!apiKey) return { response: null, stubbed: true };
    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return { response: null, stubbed: true, error: 'no fetch available' };

    // TODO (plan P4): cache scored result by registrable domain in
    // chrome.storage.local with a 7-day TTL before spending a call.

    const timeoutMs = cfg.timeoutMs || 1500;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await doFetch(EXA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          query: `official company website for the email domain ${senderDomain}`,
          type: 'auto',
          numResults: 5,
          contents: { text: true, highlights: true },
        }),
        signal: controller ? controller.signal : undefined,
      });
      if (res.ok === false) return { response: null, stubbed: true, error: `HTTP ${res.status || 'error'}` };
      const data = await res.json();
      return { response: data, stubbed: false };
    } catch (e) {
      // Graceful degradation (plan §9): Exa down/timeout must never hard-fail the
      // banner. Caller treats a stubbed result as "skip", not "safe".
      return { response: null, stubbed: true, error: String(e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const api = {
    scoreExaResponse,
    shouldQueryExa,
    fetchExa,
    // exported for tests / reuse:
    consensusDomain,
    bestEntity,
    extractFormatDomains,
    isLookalikeCore,
    coreName,
    domainFromUrl,
    THIN_FOOTPRINT_WEAK,
    CONSENSUS_EXCLUDE,
    FREEMAIL,
    EXA_ENDPOINT,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailExaCheck = api;
})(typeof self !== 'undefined' ? self : this);
