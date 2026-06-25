// risk.test.js — zero-dep asserts. Run: node risk.test.js
const { compositeScore, WEIGHTS, RED_THRESHOLD } = require('./risk');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); } }
function close(a, b, msg) { ok(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, want ${b})`); }

// heuristic weights sum to 1.0 (link and qr live in the override, not the sum)
const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
close(sum, 1.0, 'heuristic weights sum to 1.0');

// all zero → green
let r = compositeScore({ domain: 0, urgency: 0, link: 0, attachment: 0, qr: 0 });
close(r.composite, 0, 'all-zero composite');
ok(r.level === 'green', 'all-zero is green');
ok(r.override === false, 'all-zero no override');

// heuristic-only: lookalike alone (domain=1) → 0.55, red
r = compositeScore({ domain: 1 });
close(r.composite, 0.55, 'domain-only composite = 0.55');
ok(r.level === 'red', 'domain-only crosses threshold');
ok(r.override === false, 'domain-only no override');

// heuristic-only: urgency alone (full) → 0.30, exactly at threshold → red
r = compositeScore({ urgency: 1 });
close(r.composite, 0.30, 'urgency-only composite = 0.30');
ok(r.level === 'red', 'urgency at threshold is red (>=)');

// heuristic-only: attachment alone (max 0.5) → 0.075, green
r = compositeScore({ attachment: 0.5 });
close(r.composite, 0.075, 'attachment-only composite = 0.075');
ok(r.level === 'green', 'attachment-only stays green');

// heuristic combo: lookalike + urgency → 0.85, red
r = compositeScore({ domain: 1, urgency: 1 });
close(r.composite, 0.85, 'lookalike+urgency composite = 0.85');
ok(r.level === 'red', 'lookalike+urgency is red');

// realistic BEC: lookalike + high urgency + attachment, no SB hit
r = compositeScore({ domain: 1, urgency: 0.9, link: 0, attachment: 0.5, qr: 0 });
close(r.composite, 0.55 + 0.27 + 0.075, 'BEC composite');
ok(r.level === 'red', 'BEC is red');
ok(r.override === false, 'BEC no override (heuristic-only)');

// ground-truth override: Safe Browsing flagged a link → composite = 1.0
r = compositeScore({ link: 1 });
close(r.composite, 1.0, 'link override composite = 1.0');
ok(r.level === 'red', 'link override is red');
ok(r.override === true, 'link override flagged');

// ground-truth override: Safe Browsing flagged a QR → composite = 1.0
r = compositeScore({ qr: 1 });
close(r.composite, 1.0, 'qr override composite = 1.0');
ok(r.level === 'red', 'qr override is red');
ok(r.override === true, 'qr override flagged');

// override wins over zero heuristics — hit alone is red
r = compositeScore({ domain: 0, urgency: 0, attachment: 0, link: 1 });
close(r.composite, 1.0, 'link override beats zero heuristics');
ok(r.level === 'red', 'override-alone is red');

// override caps composite at 1.0 even when heuristics also fire
r = compositeScore({ domain: 1, urgency: 1, link: 1 });
close(r.composite, 1.0, 'override caps composite at 1.0');
ok(r.level === 'red', 'override+heuristic is red');

// out-of-range inputs clamped (heuristic path)
r = compositeScore({ domain: 5, urgency: -3 });
close(r.composite, 0.55, 'clamps domain to 1, urgency to 0');

// out-of-range link (e.g. >1) still triggers override (clamped to 1)
r = compositeScore({ link: 7 });
close(r.composite, 1.0, 'over-range link clamps to 1.0, fires override');
ok(r.override === true, 'over-range link override');

// link score below 1.0 does NOT fire override and does NOT contribute to sum
r = compositeScore({ link: 0.5 });
ok(r.override === false, 'partial link score does not fire override');
close(r.composite, 0, 'partial link does not contribute to sum either');
ok(r.level === 'green', 'partial link-only stays green');

// breakdown shape sanity
r = compositeScore({ domain: 1 });
close(r.breakdown.domain, 0.55, 'breakdown.domain weighted');
ok(r.threshold === RED_THRESHOLD, 'threshold exposed');

console.log(`risk: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
