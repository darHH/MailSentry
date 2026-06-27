// exaCheck.test.js — zero-dep asserts over REAL captured fixtures. Run: node exaCheck.test.js
// Covers the PURE half only (scoreExaResponse + gate). fetchExa (network) is not
// tested here, by design (plan §2/§8). Fixtures in demo/exa-fixtures/ are live Exa
// /search captures (plan P1) — see exaCheck.js header for the real response shape.
const fs = require('fs');
const path = require('path');
const exa = require('./exaCheck');
const { scoreExaResponse, shouldQueryExa, consensusDomain, THIN_FOOTPRINT_WEAK } = exa;

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  if (actual === expected) pass++;
  else { fail++; console.error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${msg}`); }
}
function load(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo', 'exa-fixtures', name), 'utf8'));
}

const lookalike = load('lookalike.json');   // sender .info → ALL 5 results = real .com
const legit = load('legit-match.json');     // 3/5 results = real .com (+ a broker + linkedin)
const noFootprint = load('no-footprint.json'); // fake domain → scattered junk, no consensus

// --- Test 1: HEADLINE — lookalike of an established entity flags high ---
let r = scoreExaResponse(lookalike, 'ceocoachinternational.info', 'pay@ceocoachinternational.info');
eq(r.canonicalDomain, 'ceocoachinginternational.com', 'lookalike: consensus resolves to real .com');
eq(r.mismatch, 1.0, 'lookalike: domain mismatch fires (.info vs .com, 3-edit core)');
ok(r.exaScore >= 0.3, 'lookalike: exaScore at/above flag threshold (0.3)');
eq(r.exaScore, 1.0, 'lookalike: deep entity (workforce 102) ⇒ full-confidence flag 1.0');

// --- Test 2: THE ONE RULE — exact match is SAFE even with rich data ---
r = scoreExaResponse(legit, 'ceocoachinginternational.com', 'accounts@ceocoachinginternational.com');
eq(r.canonicalDomain, 'ceocoachinginternational.com', 'exact-match: consensus is the real domain');
eq(r.mismatch, 0, 'exact-match: sender IS the canonical entity');
eq(r.exaScore, 0, 'exact-match: rich data must NOT push toward flag (strong SAFE)');

// --- Test 3: email-format violation fires on TLD swap (legit fixture has @-intel) ---
// legit results cite the real format @ceocoachinginternational.com in body text.
r = scoreExaResponse(legit, 'ceocoachinternational.info');
eq(r.formatViolation, 1.0, 'format: known @...com format, sender @...info → violation');
r = scoreExaResponse(legit, 'ceocoachinginternational.com');
eq(r.formatViolation, 0, 'format: sender matches the known format domain → no violation');

// --- Test 4: no footprint → weak signal, never strong ---
r = scoreExaResponse(noFootprint, 'zzqx-freshvendor-newco2026.com');
eq(r.canonicalDomain, null, 'no-footprint: scattered results ⇒ no consensus canonical');
eq(r.formatViolation, null, 'no-footprint: no format intel');
ok(r.thin, 'no-footprint: flagged thin');
eq(r.exaScore, THIN_FOOTPRINT_WEAK, 'no-footprint: exaScore == THIN_FOOTPRINT_WEAK (0.25, weak)');

// --- Test 5: broker/social-noise filter — leadiq.com & linkedin.com never canonical ---
// legit fixture's results include leadiq.com and linkedin.com; the real company
// (only a 3/5 plurality) must still win the consensus.
r = scoreExaResponse(legit, 'ceocoachinternational.info');
eq(r.canonicalDomain, 'ceocoachinginternational.com', 'broker-filter: real domain wins, not leadiq/linkedin');
ok(r.canonicalDomain !== 'leadiq.com' && r.canonicalDomain !== 'linkedin.com', 'broker-filter: canonical never a broker/social');

// --- Test 6: determinism — same input twice, and shuffled results, are identical ---
const a = scoreExaResponse(lookalike, 'ceocoachinternational.info');
const b = scoreExaResponse(lookalike, 'ceocoachinternational.info');
eq(JSON.stringify(a), JSON.stringify(b), 'determinism: identical output on repeat call');
const shuffled = { results: lookalike.results.slice().reverse() };
const c = scoreExaResponse(shuffled, 'ceocoachinternational.info');
eq(JSON.stringify(c), JSON.stringify(a), 'determinism: result ordering not trusted (shuffle ⇒ same output)');

// --- Test 7: freemail gate — fetchExa is never reached for @gmail.com ---
eq(shouldQueryExa('gmail.com').call, false, 'gate: freemail not queried');
eq(shouldQueryExa('gmail.com').reason, 'freemail', 'gate: freemail reason');
eq(shouldQueryExa('outlook.com').call, false, 'gate: outlook freemail not queried');
eq(shouldQueryExa('acme-supplies.com', { vendorDomains: ['acme-supplies.com'] }).call, false, 'gate: seeded vendor skipped');
eq(shouldQueryExa('unknown-corp.com', { currentDomainScore: 1.0 }).call, false, 'gate: verdict already reached skipped');
eq(shouldQueryExa('unknown-corp.com').call, true, 'gate: unknown corporate sender IS queried');

// --- Test 8: idempotent consensus — strict winner & weak-plurality tie are order-independent ---
eq(consensusDomain(lookalike.results), 'ceocoachinginternational.com', 'consensus: unanimous winner');
eq(consensusDomain(lookalike.results.slice().reverse()), 'ceocoachinginternational.com', 'consensus: stable under shuffle');
// constructed 2-2 tie → no canonical (deterministic both ways)
const tie = [
  { url: 'https://a-corp.com/x' }, { url: 'https://a-corp.com/y' },
  { url: 'https://b-corp.com/x' }, { url: 'https://b-corp.com/y' },
];
eq(consensusDomain(tie), null, 'consensus: 2-2 tie ⇒ thin (no winner)');
eq(consensusDomain(tie.slice().reverse()), null, 'consensus: tie stable under shuffle');
// weak plurality (2 of 5, below 60%) → thin
const weak = [
  { url: 'https://a-corp.com/1' }, { url: 'https://a-corp.com/2' },
  { url: 'https://b-corp.com/1' }, { url: 'https://c-corp.com/1' }, { url: 'https://d-corp.com/1' },
];
eq(consensusDomain(weak), null, 'consensus: 2-of-5 weak plurality ⇒ thin');

// --- Bonus: resolved-but-distant consensus is NOT a flag (semantic-correction guard) ---
// Strong consensus to an unrelated domain, no @-format → sender doesn't resemble
// it, so no impersonation signal.
const distant = {
  results: [
    { url: 'https://bigfamous.com/a' }, { url: 'https://bigfamous.com/b' }, { url: 'https://bigfamous.com/c' },
  ],
};
r = scoreExaResponse(distant, 'totally-unrelated-vendor.com');
eq(r.canonicalDomain, 'bigfamous.com', 'distant: consensus resolves');
eq(r.mismatch, 0, 'distant: sender does not resemble canonical → mismatch 0');
eq(r.formatViolation, null, 'distant: no @-format intel');
ok(r.exaScore === 0, 'distant: no flag from a non-lookalike sender');

console.log(`exaCheck: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
