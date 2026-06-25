// risk.test.js — zero-dep asserts. Run: node risk.test.js
const { compositeScore, WEIGHTS, RED_THRESHOLD } = require('./risk');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); } }
function close(a, b, msg) { ok(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, want ${b})`); }

// weights sum to 1.0
const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
close(sum, 1.0, 'weights sum to 1.0');

// all zero → green
let r = compositeScore({ domain: 0, urgency: 0, link: 0, attachment: 0, qr: 0 });
close(r.composite, 0, 'all-zero composite');
ok(r.level === 'green', 'all-zero is green');

// all max → 1.0 red
r = compositeScore({ domain: 1, urgency: 1, link: 1, attachment: 1, qr: 1 });
close(r.composite, 1.0, 'all-max composite');
ok(r.level === 'red', 'all-max is red');

// lookalike alone (domain=1) → 0.40, red
r = compositeScore({ domain: 1 });
close(r.composite, 0.40, 'domain-only composite = 0.40');
ok(r.level === 'red', 'domain-only crosses threshold');

// urgency alone (0.25) → below 0.3 threshold → green
r = compositeScore({ urgency: 1 });
close(r.composite, 0.25, 'urgency-only composite = 0.25');
ok(r.level === 'green', 'urgency-only stays green (below 0.3)');

// boundary: exactly 0.3 → red (>=)
r = compositeScore({ link: 1, attachment: 1 }); // 0.20 + 0.10 = 0.30
close(r.composite, 0.30, 'link+attachment = 0.30');
ok(r.level === 'red', '0.30 is red (>= threshold)');

// realistic BEC: lookalike + high urgency + attachment
r = compositeScore({ domain: 1, urgency: 0.9, link: 0, attachment: 0.5, qr: 0 });
close(r.composite, 0.40 + 0.225 + 0.05, 'BEC composite');
ok(r.level === 'red', 'BEC is red');

// out-of-range inputs clamped
r = compositeScore({ domain: 5, urgency: -3 });
close(r.composite, 0.40, 'clamps domain to 1, urgency to 0');

// breakdown shape
r = compositeScore({ domain: 1 });
close(r.breakdown.domain, 0.40, 'breakdown.domain');
ok(r.threshold === RED_THRESHOLD, 'threshold exposed');

console.log(`risk: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
