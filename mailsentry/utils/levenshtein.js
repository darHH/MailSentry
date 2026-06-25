// levenshtein.js — domain fuzzy-match helper (pure, no deps).
// Classic two-row dynamic-programming edit distance.
// Used by domainCheck.js to detect one/two-character lookalike domains.

(function (root) {
  'use strict';

  /**
   * Levenshtein edit distance between two strings.
   * @param {string} a
   * @param {string} b
   * @returns {number} minimum single-char insertions/deletions/substitutions
   */
  function levenshtein(a, b) {
    a = a == null ? '' : String(a);
    b = b == null ? '' : String(b);

    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);

    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,        // deletion
          curr[j - 1] + 1,    // insertion
          prev[j - 1] + cost  // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[b.length];
  }

  const api = { levenshtein };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailLevenshtein = api;
})(typeof self !== 'undefined' ? self : this);
