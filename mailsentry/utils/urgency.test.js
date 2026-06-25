// urgency.test.js — zero-dep asserts. Run: node urgency.test.js
const { urgencyScore } = require('./urgency');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); } }

// neutral email → ~0
let r = urgencyScore('Lunch next week?', 'Hey, are you free for lunch on Tuesday? No rush.');
ok(r.score === 0, `neutral scores 0 (got ${r.score})`);

// classic BEC: urgent bank-detail change before payment run
r = urgencyScore(
  'URGENT: update bank details before payment run',
  'Please change of bank account immediately, this is confidential and time-sensitive.'
);
ok(r.score >= 0.8, `BEC attack scores high (got ${r.score})`);
ok(r.matched.includes('update bank'), 'matched "update bank"');
ok(r.matched.includes('confidential'), 'matched "confidential"');

// subject weighting: same keyword in subject scores higher than in body
const inSubj = urgencyScore('urgent urgent', '');
const inBody = urgencyScore('', 'urgent urgent');
ok(inSubj.weight > inBody.weight, 'subject hits weigh more than body hits');

// saturation cap at 1.0
r = urgencyScore('urgent urgent urgent', 'update bank wire transfer gift card legal action overdue penalty');
ok(r.score === 1, `score caps at 1.0 (got ${r.score})`);

// mild single hit → between 0 and 1
r = urgencyScore('Reminder: invoice due today', 'Friendly reminder.');
ok(r.score > 0 && r.score < 1, `single mild hit is partial (got ${r.score})`);

// null guards
r = urgencyScore(null, null);
ok(r.score === 0, 'null inputs score 0');

console.log(`urgency: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
