// linkScanner.test.js — zero-dep asserts with injected fetch. Run: node linkScanner.test.js
const { checkUrl, linkScore } = require('./linkScanner');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); } }

// fake fetch that flags any URL containing "evil"
const fakeFetch = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  const target = body.threatInfo.threatEntries[0].url;
  const matches = target.includes('evil') ? [{ threatType: 'SOCIAL_ENGINEERING' }] : [];
  return { json: async () => ({ matches }) };
};

(async () => {
  // no key → stubbed, score 0
  let r = await checkUrl('http://evil.com', '', fakeFetch);
  ok(r.stubbed === true && r.score === 0, 'no key → stubbed 0');

  // with key, safe url → 0, not stubbed
  r = await checkUrl('http://good.com', 'KEY', fakeFetch);
  ok(r.stubbed === false && r.score === 0, 'safe url → 0, real');

  // with key, evil url → 1.0
  r = await checkUrl('http://evil.com/login', 'KEY', fakeFetch);
  ok(r.score === 1.0 && r.stubbed === false, 'evil url → 1.0');

  // linkScore picks worst across list
  r = await linkScore(['http://good.com', 'http://evil.co/x', 'http://safe.org'], 'KEY', fakeFetch);
  ok(r.score === 1.0, 'linkScore worst-of-list = 1.0');
  ok(r.checked === 3, 'checked all 3');
  ok(r.hits.length === 1 && r.hits[0].includes('evil'), 'reports the evil hit');

  // empty list → 0
  r = await linkScore([], 'KEY', fakeFetch);
  ok(r.score === 0 && r.checked === 0, 'empty list → 0');

  // no key over a list → stubbed
  r = await linkScore(['http://evil.com'], '', fakeFetch);
  ok(r.stubbed === true && r.score === 0, 'no key over list → stubbed 0');

  // ---- error-path: Safe Browsing rejected the key ----
  // fake fetch that mimics the real 400 response for an invalid API key
  const badKeyFetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' },
    }),
  });

  r = await checkUrl('http://evil.com', 'BADKEY', badKeyFetch);
  ok(r.stubbed === true, 'invalid key → stubbed (could not scan)');
  ok(r.score === 0, 'invalid key → score 0');
  ok(typeof r.error === 'string' && r.error.includes('API key not valid'), 'invalid key → error surfaced');

  // linkScore over a list propagates the error
  r = await linkScore(['http://evil.com', 'http://other.com'], 'BADKEY', badKeyFetch);
  ok(r.stubbed === true, 'invalid key over list → stubbed');
  ok(r.score === 0 && r.hits.length === 0, 'invalid key over list → no score, no hits');
  ok(typeof r.error === 'string' && r.error.includes('API key not valid'), 'invalid key over list → error propagated');
  ok(r.checked === 2, 'checked count still reflects attempted URLs');

  // fetch throws (network / DNS failure) → stubbed with error
  const throwingFetch = async () => { throw new Error('network down'); };
  r = await checkUrl('http://evil.com', 'KEY', throwingFetch);
  ok(r.stubbed === true, 'network failure → stubbed');
  ok(r.error && r.error.includes('network down'), 'network failure → error surfaced');

  console.log(`linkScanner: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
