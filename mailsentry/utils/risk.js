// risk.js — composite risk score. Weighted sum of the five checks.
// Weights sum to 1.0. Threshold >= 0.3 → red banner, else green.
// See CONTEXT.md §5.
//
// Pure module, no deps.

(function (root) {
  'use strict';

  const WEIGHTS = {
    domain: 0.40,     // max of lookalike | name-mismatch | allowlist violation
    urgency: 0.25,    // weighted keyword density (subject + body)
    link: 0.20,       // Safe Browsing result, max across all links
    attachment: 0.10, // binary: attachment on payment-instruction email → 0.5
    qr: 0.05,         // decoded QR URL through the same link scanner
  };

  const RED_THRESHOLD = 0.3;

  function clamp01(n) {
    n = Number(n);
    if (!isFinite(n)) return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  /**
   * @param {object} scores { domain, urgency, link, attachment, qr } each 0–1
   * @returns {{ composite:number, level:'red'|'green', breakdown:object, threshold:number }}
   */
  function compositeScore(scores) {
    scores = scores || {};
    const s = {
      domain: clamp01(scores.domain),
      urgency: clamp01(scores.urgency),
      link: clamp01(scores.link),
      attachment: clamp01(scores.attachment),
      qr: clamp01(scores.qr),
    };

    const breakdown = {
      domain: s.domain * WEIGHTS.domain,
      urgency: s.urgency * WEIGHTS.urgency,
      link: s.link * WEIGHTS.link,
      attachment: s.attachment * WEIGHTS.attachment,
      qr: s.qr * WEIGHTS.qr,
    };

    const composite =
      breakdown.domain +
      breakdown.urgency +
      breakdown.link +
      breakdown.attachment +
      breakdown.qr;

    return {
      composite,
      level: composite >= RED_THRESHOLD ? 'red' : 'green',
      breakdown,
      threshold: RED_THRESHOLD,
    };
  }

  const api = { compositeScore, WEIGHTS, RED_THRESHOLD };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailRisk = api;
})(typeof self !== 'undefined' ? self : this);
