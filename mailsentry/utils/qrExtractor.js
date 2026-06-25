// qrExtractor.js — decode QR codes from email <img> tags → URL → linkScanner.
// STUB-FIRST: jsQR (~50KB pure JS) is not bundled yet. Until it is, decode()
// returns no URLs and `stubbed:true`. Drop jsQR.js into utils/ and load it
// before this file in the manifest to enable real decoding.
//
// NOTE on the known risk (CONTEXT §9): remote email images are often CORS-tainted,
// which blocks canvas pixel reads. drawImageToData() will throw on a tainted canvas;
// we catch it and skip that image rather than crash the pipeline.

(function (root) {
  'use strict';

  // crude URL extractor for decoded QR payloads (some QR encode plain text)
  function extractUrl(text) {
    if (!text) return null;
    const m = String(text).match(/https?:\/\/[^\s"'<>]+/i);
    if (m) return m[0];
    // bare-domain QR (e.g. "pay.evil.co/abc")
    const bare = String(text).match(/\b[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'<>]*)?/i);
    return bare ? 'http://' + bare[0] : null;
  }

  // Pull pixel data from an <img>. Throws if the canvas is CORS-tainted.
  function imageToImageData(img, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const canvas = d.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h); // throws SecurityError if tainted
  }

  /**
   * Decode QR URLs from a list of <img> elements.
   * @param {HTMLImageElement[]} imgs
   * @param {object} [opts] { jsQR?:fn, document?:Document } — injectable for tests
   * @returns {{ urls:string[], stubbed:boolean, scanned:number, tainted:number }}
   */
  function decode(imgs, opts) {
    opts = opts || {};
    const jsQR = opts.jsQR || (typeof root.jsQR !== 'undefined' ? root.jsQR : null);
    const list = imgs || [];

    if (!jsQR) {
      return { urls: [], stubbed: true, scanned: 0, tainted: 0 };
    }

    const urls = [];
    let tainted = 0;
    let scanned = 0;
    for (const img of list) {
      let data;
      try {
        data = imageToImageData(img, opts.document);
      } catch (e) {
        tainted++;
        continue; // CORS-tainted canvas — skip
      }
      if (!data) continue;
      scanned++;
      const result = jsQR(data.data, data.width, data.height);
      if (result && result.data) {
        const url = extractUrl(result.data);
        if (url) urls.push(url);
      }
    }
    return { urls, stubbed: false, scanned, tainted };
  }

  const api = { decode, extractUrl };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailQrExtractor = api;
})(typeof self !== 'undefined' ? self : this);
