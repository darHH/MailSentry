// linkScanner.js — Google Safe Browsing link safety check.
// STUB-FIRST: with no API key, returns a stubbed score of 0 (flagged `stubbed:true`)
// so the rest of the pipeline runs end-to-end before a key is acquired.
// Once a key is set (popup → settings → chrome.storage.local), the real
// Safe Browsing Lookup API v4 call is used. See CONTEXT.md §5.
//
// Network module — not part of the offline unit-test suite.

(function (root) {
  'use strict';

  const SB_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

  /**
   * Check a single URL against Safe Browsing.
   * @param {string} url
   * @param {string} apiKey  Safe Browsing key; falsy → stubbed result
   * @param {function} [fetchImpl] injectable fetch (for tests)
   * @returns {Promise<{score:number, stubbed:boolean, error?:string}>}
   */
  async function checkUrl(url, apiKey, fetchImpl) {
    if (!url) return { score: 0, stubbed: true };
    if (!apiKey) return { score: 0, stubbed: true };

    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return { score: 0, stubbed: true, error: 'no fetch available' };

    try {
      const res = await doFetch(`${SB_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'mailsentry', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
      });
      const data = await res.json();
      const hit = data && data.matches && data.matches.length > 0;
      return { score: hit ? 1.0 : 0.0, stubbed: false };
    } catch (e) {
      return { score: 0, stubbed: false, error: String(e) };
    }
  }

  /**
   * Score a list of URLs → max across all (worst link wins).
   * @param {string[]} urls
   * @param {string} apiKey
   * @param {function} [fetchImpl]
   * @returns {Promise<{score:number, stubbed:boolean, checked:number, hits:string[]}>}
   */
  async function linkScore(urls, apiKey, fetchImpl) {
    const list = (urls || []).filter(Boolean);
    if (list.length === 0) return { score: 0, stubbed: !apiKey, checked: 0, hits: [] };

    let worst = 0;
    let anyReal = false;
    const hits = [];
    for (const url of list) {
      const r = await checkUrl(url, apiKey, fetchImpl);
      if (!r.stubbed) anyReal = true;
      if (r.score >= 1.0) hits.push(url);
      worst = Math.max(worst, r.score);
    }
    return { score: worst, stubbed: !anyReal, checked: list.length, hits };
  }

  const api = { checkUrl, linkScore, SB_ENDPOINT };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailLinkScanner = api;
})(typeof self !== 'undefined' ? self : this);
