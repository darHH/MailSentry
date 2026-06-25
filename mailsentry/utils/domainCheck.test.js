// domainCheck.test.js — zero-dep asserts. Run: node domainCheck.test.js
const { domainScore, parseSender, rootDomain } = require('./domainCheck');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  if (actual === expected) pass++;
  else { fail++; console.error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const vendors = [
  { name: 'Acme Supplies', domain: 'acme-supplies.com' },
  { name: 'Lion City Logistics', domain: 'lioncitylogistics.com' },
  { name: 'Raffles Industrial', domain: 'rafflesindustrial.com.sg' },
];

// --- parseSender ---
let p = parseSender('"Acme Supplies" <billing@acme-supplies.com>');
eq(p.displayName, 'Acme Supplies', 'parse display name');
eq(p.address, 'billing@acme-supplies.com', 'parse address');
eq(p.domain, 'acme-supplies.com', 'parse domain');

p = parseSender('plain@foo.com');
eq(p.domain, 'foo.com', 'parse bare address domain');
eq(p.displayName, '', 'bare address no display name');

// --- rootDomain ---
eq(rootDomain('mail.acme-supplies.com'), 'acme-supplies.com', 'strip subdomain');
eq(rootDomain('a.b.rafflesindustrial.com.sg'), 'rafflesindustrial.com.sg', 'two-part tld');

// --- legit sender: exact vendor domain → 0 ---
let r = domainScore('"Acme Supplies" <billing@acme-supplies.com>', { vendors });
eq(r.score, 0, 'legit exact-domain vendor scores 0');

// --- lookalike: acrne-supplies.com (m->rn, 2 edits) → 1.0 ---
r = domainScore('"Acme Supplies" <pay@acrne-supplies.com>', { vendors });
eq(r.signals.lookalike, 1.0, 'lookalike domain fires');
eq(r.score, 1.0, 'lookalike → composite 1.0');

// --- display-name mismatch: claims Acme but gmail throwaway ---
r = domainScore('"Acme Supplies" <random123@gmail.com>', { vendors });
eq(r.signals.nameMismatch, 1.0, 'name mismatch fires on throwaway');
eq(r.signals.lookalike, 0, 'no lookalike for unrelated domain');
eq(r.score, 1.0, 'name mismatch → composite 1.0');

// --- unknown sender, no vendor claim, allowlist off → 0 ---
r = domainScore('"Bob Newperson" <bob@somecompany.io>', { vendors });
eq(r.score, 0, 'unknown neutral sender scores 0 (allowlist off)');

// --- allowlist mode ON ---
const allowOn = { enabled: true, suffixes: ['acme-supplies.com', '*.trusted.sg'], emails: ['ceo@gmail.com'] };
r = domainScore('<x@acme-supplies.com>', { vendors, allowlist: allowOn });
eq(r.signals.allowlist, 0, 'allowlist: suffix match passes');
r = domainScore('<x@sub.trusted.sg>', { vendors, allowlist: allowOn });
eq(r.signals.allowlist, 0, 'allowlist: wildcard suffix passes');
r = domainScore('<ceo@gmail.com>', { vendors, allowlist: allowOn });
eq(r.signals.allowlist, 0, 'allowlist: explicit email passes');
r = domainScore('<stranger@unknown.com>', { vendors, allowlist: allowOn });
eq(r.signals.allowlist, 1.0, 'allowlist: non-listed sender flagged');
eq(r.score, 1.0, 'allowlist violation → composite 1.0');

// --- allowlist OFF: lookalike/name checks still run regardless ---
r = domainScore('"Acme Supplies" <pay@acrne-supplies.com>', { vendors, allowlist: { enabled: false } });
eq(r.score, 1.0, 'lookalike still fires with allowlist off');

console.log(`domainCheck: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
