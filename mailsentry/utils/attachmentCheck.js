// attachmentCheck.js — binary attachment risk signal (pure).
// An attachment is only risky in context: an attachment on a *payment-instruction*
// email (invoice / bank-change / remittance) is a classic BEC delivery vector.
//   attachment present + payment context → 0.5
//   otherwise                             → 0
//
// DOM extraction lives in content.js; this module is the pure decision fn so it
// can be unit-tested without Gmail.

(function (root) {
  'use strict';

  // Phrases that mark an email as payment-instruction context.
  const PAYMENT_CONTEXT = [
    'invoice', 'bank details', 'account details', 'update bank', 'change of bank',
    'new account', 'wire transfer', 'remittance', 'payment', 'swift', 'beneficiary',
    'iban', 'account number', 'outstanding balance', 'due amount', 'po number',
    'purchase order', 'statement of account',
  ];

  // Higher-risk attachment types often used to smuggle fake invoices / macros.
  const RISKY_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'htm', 'html', 'zip', 'iso'];

  function hasPaymentContext(text) {
    const t = (text == null ? '' : String(text)).toLowerCase();
    return PAYMENT_CONTEXT.some((kw) => t.includes(kw));
  }

  /**
   * @param {object} email
   *   { hasAttachment:boolean, attachmentNames?:string[], subject?:string, body?:string }
   * @returns {{ score:number, paymentContext:boolean, riskyType:boolean }}
   */
  function attachmentScore(email) {
    email = email || {};
    const names = email.attachmentNames || [];
    const has = !!email.hasAttachment || names.length > 0;

    const paymentContext = hasPaymentContext(
      `${email.subject || ''} ${email.body || ''} ${names.join(' ')}`
    );

    const riskyType = names.some((n) => {
      const ext = String(n).toLowerCase().split('.').pop();
      return RISKY_EXT.includes(ext);
    });

    const score = has && paymentContext ? 0.5 : 0;
    return { score, paymentContext, riskyType };
  }

  const api = { attachmentScore, PAYMENT_CONTEXT, RISKY_EXT };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MailAttachment = api;
})(typeof self !== 'undefined' ? self : this);
