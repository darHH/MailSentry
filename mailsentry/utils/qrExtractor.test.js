// qrExtractor.test.js — zero-dep asserts with injected jsQR + fake DOM. Run: node qrExtractor.test.js
const { decode, extractUrl } = require('./qrExtractor');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); } }

// extractUrl
ok(extractUrl('Pay here: https://evil.co/x') === 'https://evil.co/x', 'extract http url');
ok(extractUrl('pay.evil.co/abc') === 'http://pay.evil.co/abc', 'bare domain → http prefixed');
ok(extractUrl('no url here just text') === null, 'no url → null');
ok(extractUrl('') === null, 'empty → null');

// stub behaviour: no jsQR → stubbed, no urls
let r = decode([{ width: 10, height: 10 }]);
ok(r.stubbed === true && r.urls.length === 0, 'no jsQR → stubbed empty');

// fake document + fake jsQR that decodes any image to a fixed URL
const fakeDoc = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      drawImage: () => {},
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    }),
  }),
};
const fakeJsQR = () => ({ data: 'https://evil.co/scan' });

r = decode([{ naturalWidth: 20, naturalHeight: 20 }], { jsQR: fakeJsQR, document: fakeDoc });
ok(r.stubbed === false, 'with jsQR → not stubbed');
ok(r.urls.length === 1 && r.urls[0] === 'https://evil.co/scan', 'decoded QR url extracted');
ok(r.scanned === 1, 'scanned 1 image');

// tainted canvas: getImageData throws → counted, skipped, no crash
const taintedDoc = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      drawImage: () => {},
      getImageData: () => { throw new Error('SecurityError: tainted canvas'); },
    }),
  }),
};
r = decode([{ naturalWidth: 20, naturalHeight: 20 }], { jsQR: fakeJsQR, document: taintedDoc });
ok(r.tainted === 1 && r.urls.length === 0, 'tainted canvas skipped, counted');

console.log(`qrExtractor: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
