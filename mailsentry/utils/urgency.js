// urgency.js — weighted urgency-keyword scorer (subject + body).
// Fraud psychology: scammers manufacture time pressure + authority + secrecy.
// Returns a normalised 0–1 score. Subject hits weigh more than body hits.
//
// Pure module, no deps.

(function (root) {
  'use strict';

  // weight ~ how strongly the phrase signals a pressure/fraud frame.
  const KEYWORDS = [
    // time pressure
    ['urgent', 2], ['immediately', 2], ['asap', 2], ['right away', 2],
    ['before end of day', 2], ['by eod', 2], ['deadline', 1.5], ['expires', 1.5],
    ['final notice', 2], ['last chance', 2], ['act now', 2], ['time-sensitive', 2],
    ['within the hour', 2], ['today', 1], ['as soon as possible', 2],
    // payment / banking instruction
    ['bank details', 3], ['account details', 2.5], ['update bank', 3],
    ['change of bank', 3], ['new account number', 3], ['wire transfer', 2.5],
    ['payment run', 2], ['outstanding invoice', 1.5], ['overdue', 1.5],
    ['remittance', 1.5], ['swift code', 2], ['beneficiary', 1.5],
    // secrecy / authority pressure
    ['confidential', 1.5], ['do not tell', 2.5], ['keep this between us', 2.5],
    ['authorize the payment', 2.5], ['approve the transfer', 2.5],
    ['ceo', 1], ['director', 1], ['gift card', 2.5],
    // consequence threats
    ['account suspended', 2], ['penalty', 1.5], ['legal action', 2],
    ['avoid late fees', 1.5], ['service interruption', 1.5],
  ];

  // Score saturates: once we hit this much weight, urgency = 1.0.
  const SATURATION = 8;
  const SUBJECT_MULTIPLIER = 1.5; // a hit in the subject line counts more

  function countOccurrences(haystack, needle) {
    if (!haystack || !needle) return 0;
    let count = 0, idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
      count++;
      idx += needle.length;
    }
    return count;
  }

  /**
   * @param {string} subject
   * @param {string} body
   * @returns {{ score:number, weight:number, matched:string[] }}
   */
  function urgencyScore(subject, body) {
    const subj = (subject == null ? '' : String(subject)).toLowerCase();
    const bod = (body == null ? '' : String(body)).toLowerCase();

    let weight = 0;
    const matched = [];

    for (const [kw, w] of KEYWORDS) {
      const inSubj = countOccurrences(subj, kw);
      const inBody = countOccurrences(bod, kw);
      if (inSubj || inBody) matched.push(kw);
      weight += inSubj * w * SUBJECT_MULTIPLIER;
      weight += inBody * w;
    }

    const score = Math.min(1, weight / SATURATION);
    return { score, weight, matched };
  }

  const api = { urgencyScore, KEYWORDS, SATURATION };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailUrgency = api;
})(typeof self !== 'undefined' ? self : this);
