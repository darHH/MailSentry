// risk.js — composite risk score.
// Two-tier model:
//   1. Ground-truth override: if Safe Browsing flagged a link or a QR URL
//      (link or qr score >= 1.0), composite is forced to 1.0. Google's
//      blocklist has near-zero false positive rate, so heuristics shouldn't
//      be able to vote it down.
//   2. Heuristic fallback: otherwise composite is a weighted sum of the
//      three heuristic checks (domain, urgency, attachment). Weights sum
//      to 1.0. composite >= RED_THRESHOLD → red banner, else green.
// See CONTEXT.md §5.
//
// Pure module, no deps.

(function (root) {
  'use strict';

  // Heuristic weights (sum to 1.0). link and qr are intentionally NOT here:
  // they participate via the ground-truth override above instead.
  const WEIGHTS = {
    domain: 0.55,     // max of lookalike | name-mismatch | allowlist violation
    urgency: 0.30,    // weighted keyword density (subject + body)
    attachment: 0.15, // binary: attachment on payment-instruction email → 0.5
  };

  const RED_THRESHOLD = 0.3;

  function clamp01(n) {
    n = Number(n);
    if (!isFinite(n)) return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  /**
   * @param {object} scores { domain, urgency, link, attachment, qr } each 0–1
   * @returns {{ composite:number, level:'red'|'green', breakdown:object, threshold:number, override:boolean }}
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
      attachment: s.attachment * WEIGHTS.attachment,
      // link/qr breakdowns left in for the banner's "main reason" picker, but
      // they no longer contribute to the weighted sum.
      link: s.link,
      qr: s.qr,
    };

    const weightedSum =
      breakdown.domain + breakdown.urgency + breakdown.attachment;

    const override = s.link >= 1.0 || s.qr >= 1.0;
    const composite = override ? 1.0 : weightedSum;

    return {
      composite,
      level: composite >= RED_THRESHOLD ? 'red' : 'green',
      breakdown,
      threshold: RED_THRESHOLD,
      override,
    };
  }

  const api = { compositeScore, WEIGHTS, RED_THRESHOLD };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailRisk = api;
})(typeof self !== 'undefined' ? self : this);
