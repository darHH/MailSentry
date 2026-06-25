// domainCheck.test.js — zero-dep asserts. Run: node domainCheck.test.js
const { domainScore, parseSender, rootDomain, parseScopeEntry } = require('./domainCheck');

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

// --- ADDRESS-LEVEL lookalike (full-email vendors) ---
// vendor stored as a full email (in either the email or domain field)
const emailVendors = [
  { name: 'W Nayar', email: 'wnaya@rocketmail.com', phone: '+65 9000 0000' },
  { name: 'W Nayar (typed in domain field)', domain: 'wnaya@rocketmail.com' },
];
// 1-char username diff on the SAME domain → now flags
r = domainScore('<wnayar@rocketmail.com>', { vendors: emailVendors });
eq(r.signals.lookalike, 1.0, 'address-level: wnayar vs wnaya (d=1) fires');
eq(r.score, 1.0, 'address-level lookalike → composite 1.0');
// exact full-address match → safe
r = domainScore('<wnaya@rocketmail.com>', { vendors: emailVendors });
eq(r.signals.lookalike, 0, 'address-level: exact email is safe');
// genuinely different person, same freemail domain → NOT flagged (no false positive)
r = domainScore('<johnathan@rocketmail.com>', { vendors: emailVendors });
eq(r.signals.lookalike, 0, 'address-level: unrelated local-part not flagged');
// full-email vendor must NOT make every rocketmail.com sender a domain-lookalike
r = domainScore('<someone@hotmail.com>', { vendors: emailVendors });
eq(r.signals.lookalike, 0, 'address-level: different domain, no false domain-lookalike');

// domain vendors and email vendors coexist
const mixed = [
  { name: 'Acme', domain: 'acme-supplies.com' },
  { name: 'W Nayar', email: 'wnaya@rocketmail.com' },
];
r = domainScore('<pay@acrne-supplies.com>', { vendors: mixed });
eq(r.signals.lookalike, 1.0, 'mixed: domain lookalike still fires');
r = domainScore('<wnayar@rocketmail.com>', { vendors: mixed });
eq(r.signals.lookalike, 1.0, 'mixed: email lookalike still fires');

// --- UNIFIED ENTRY FORMAT (parseScopeEntry: @domain vs email vs bare) ---
eq(parseScopeEntry('@acme.com').kind, 'domain', 'parse: @acme.com → domain');
eq(parseScopeEntry('@acme.com').domain, 'acme.com', 'parse: @acme.com domain value');
eq(parseScopeEntry('jo@acme.com').kind, 'email', 'parse: jo@acme.com → email');
eq(parseScopeEntry('jo@acme.com').email, 'jo@acme.com', 'parse: email value');
eq(parseScopeEntry('acme.com').kind, 'domain', 'parse: bare acme.com → domain');
eq(parseScopeEntry('  @ACME.com ').domain, 'acme.com', 'parse: trims + lowercases');
eq(parseScopeEntry('').kind, 'empty', 'parse: empty');

// vendors with the new `entry` field
const entryVendors = [
  { name: 'Acme', entry: '@acme-supplies.com' },   // domain entry
  { name: 'Jo', entry: 'jo@gmail.com' },           // email entry
];
r = domainScore('<x@acrne-supplies.com>', { vendors: entryVendors });
eq(r.signals.lookalike, 1.0, 'entry @domain: lookalike domain fires');
r = domainScore('<x@acme-supplies.com>', { vendors: entryVendors });
eq(r.signals.lookalike, 0, 'entry @domain: exact domain safe');
r = domainScore('<jp@gmail.com>', { vendors: entryVendors });
eq(r.signals.lookalike, 1.0, 'entry email: jp vs jo (d=1) fires');
r = domainScore('<jo@gmail.com>', { vendors: entryVendors });
eq(r.signals.lookalike, 0, 'entry email: exact safe');
// @domain vendor must NOT flag a totally different person on that domain
r = domainScore('<someone@gmail.com>', { vendors: [{ entry: '@gmail.com' }] });
eq(r.signals.lookalike, 0, 'entry @gmail.com: any gmail user is not a lookalike');

// --- UNIFIED ALLOWLIST `entries` list ---
const allowEntries = { enabled: true, entries: ['@acme.com', 'ceo@gmail.com'] };
r = domainScore('<x@acme.com>', { allowlist: allowEntries });
eq(r.signals.allowlist, 0, 'entries: @acme.com passes acme.com');
r = domainScore('<x@sub.acme.com>', { allowlist: allowEntries });
eq(r.signals.allowlist, 0, 'entries: @acme.com passes subdomain');
r = domainScore('<ceo@gmail.com>', { allowlist: allowEntries });
eq(r.signals.allowlist, 0, 'entries: exact email passes');
r = domainScore('<other@gmail.com>', { allowlist: allowEntries });
eq(r.signals.allowlist, 1.0, 'entries: different gmail user flagged (email is exact)');
r = domainScore('<x@stranger.com>', { allowlist: allowEntries });
eq(r.signals.allowlist, 1.0, 'entries: unlisted domain flagged');

console.log(`domainCheck: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
