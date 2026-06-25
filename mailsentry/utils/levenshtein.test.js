// levenshtein.test.js — zero-dep asserts. Run: node levenshtein.test.js
const { levenshtein } = require('./levenshtein');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`FAIL: ${msg} — expected ${expected}, got ${actual}`); }
}

eq(levenshtein('', ''), 0, 'empty vs empty');
eq(levenshtein('abc', 'abc'), 0, 'identical');
eq(levenshtein('', 'abc'), 3, 'empty vs abc');
eq(levenshtein('abc', ''), 3, 'abc vs empty');
eq(levenshtein('acme.com', 'acrne.com'), 2, 'acme vs acrne (m->rn = 2 edits)');
eq(levenshtein('acme.com', 'acme.co'), 1, 'trailing char drop');
eq(levenshtein('paypal.com', 'paypa1.com'), 1, 'l->1 substitution');
eq(levenshtein('kitten', 'sitting'), 3, 'classic kitten/sitting');
eq(levenshtein('acme.com', 'acme.com'), 0, 'exact domain');
eq(levenshtein(null, 'a'), 1, 'null guard');

console.log(`levenshtein: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
