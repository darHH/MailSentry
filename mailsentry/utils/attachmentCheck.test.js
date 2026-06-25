// attachmentCheck.test.js — zero-dep asserts. Run: node attachmentCheck.test.js
const { attachmentScore } = require('./attachmentCheck');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); } }

// attachment + payment context → 0.5
let r = attachmentScore({
  hasAttachment: true,
  attachmentNames: ['Invoice_4471.pdf'],
  subject: 'Updated invoice',
  body: 'Please pay the invoice attached.',
});
ok(r.score === 0.5, `payment-context attachment scores 0.5 (got ${r.score})`);
ok(r.paymentContext === true, 'payment context detected');
ok(r.riskyType === true, 'pdf flagged risky type');

// attachment but NO payment context → 0
r = attachmentScore({
  hasAttachment: true,
  attachmentNames: ['team_photo.jpg'],
  subject: 'Office party pics',
  body: 'Fun times last Friday!',
});
ok(r.score === 0, `non-payment attachment scores 0 (got ${r.score})`);

// payment context but NO attachment → 0
r = attachmentScore({
  hasAttachment: false,
  subject: 'Update bank details',
  body: 'Our new account number is below.',
});
ok(r.score === 0, `payment email without attachment scores 0 (got ${r.score})`);

// names-only implies attachment present
r = attachmentScore({ attachmentNames: ['remittance.xlsx'], body: 'remittance advice' });
ok(r.score === 0.5, 'names-only counts as attachment present');

// empty input → 0
r = attachmentScore({});
ok(r.score === 0, 'empty input scores 0');
r = attachmentScore();
ok(r.score === 0, 'undefined input scores 0');

console.log(`attachmentCheck: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
