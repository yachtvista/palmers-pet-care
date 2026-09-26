// Public contact forms (homepage + contact page) → POST /enquiry on the accounts API,
// which verifies Turnstile server-side and emails the enquiry. No page reload.
(function () {
  const API = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const EMAIL = 'enquiries@palmerspetcare.co.uk';
  const PHONE = '';                       // set this to show a phone number in the failure message too
  const SENT = 'Thanks — I’ll be in touch soon.';
  const fallback = () => 'Sorry, that did not send. Please email ' + EMAIL + (PHONE ? ' or call ' + PHONE : '') + '.';
  const loadedAt = Date.now();

  document.querySelectorAll('form[data-enquiry]').forEach((form) => {
    const status = form.querySelector('.form-status');
    const btn = form.querySelector('button[type="submit"]');
    const label = btn ? btn.textContent : 'Send';
    const say = (text, kind) => { if (status) { status.textContent = text; status.className = 'form-status' + (kind ? ' ' + kind : ''); } };

    // Per-field messages, shown under the field and announced to screen readers.
    const clearFieldErrors = () => {
      form.querySelectorAll('.field-error').forEach((el) => el.remove());
      form.querySelectorAll('[aria-invalid="true"]').forEach((el) => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    };
    const showFieldErrors = (fields) => {
      let first = null;
      Object.keys(fields).forEach((key) => {
        const el = form.elements[key]; if (!el) return;
        const id = 'err-' + (el.id || key);
        const p = document.createElement('p'); p.className = 'field-error'; p.id = id; p.textContent = fields[key];
        el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', id);
        el.insertAdjacentElement('afterend', p);
        if (!first) first = el;
      });
      if (first) first.focus();
    };

    // The Turnstile token arrives asynchronously; wait for it rather than submitting empty.
    const tokenNow = () => { const i = form.querySelector('input[name="cf-turnstile-response"]'); return i ? i.value : ''; };
    const hasWidget = () => !!form.querySelector('.cf-turnstile');
    async function waitForToken(ms) {
      const until = Date.now() + ms;
      while (Date.now() < until) { const t = tokenNow(); if (t) return t; await new Promise((r) => setTimeout(r, 250)); }
      return tokenNow();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors();
      const f = form.elements;
      const val = (n) => (f[n] && typeof f[n].value === 'string' ? f[n].value.trim() : '');

      // A first pass in the browser so obvious mistakes do not need a round trip.
      const local = {};
      if (!val('name')) local.name = 'Please tell me your name.';
      if (!val('email')) local.email = 'Please enter an email address so I can reply.';
      else if (f.email.checkValidity && !f.email.checkValidity()) local.email = 'That email address does not look right.';
      if (!val('message')) local.message = 'Please tell me a little about your pet.';
      else if (val('message').length < 10) local.message = 'Please write a little more — at least 10 characters.';
      if (Object.keys(local).length) { showFieldErrors(local); say('Please check the highlighted fields.', 'error'); return; }

      btn.disabled = true;
      let token = tokenNow();
      if (!token && hasWidget()) { say('Just checking you’re human…'); token = await waitForToken(20000); }
      if (!token && hasWidget()) {
        say('Please tick “Verify you are human” above, then press Send. If the box will not load, email ' + EMAIL + '.', 'error');
        btn.disabled = false; return;
      }
      say('Sending…'); btn.textContent = 'Sending…';

      try {
        const res = await fetch(API + '/enquiry', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: val('name'), email: val('email'), phone: val('phone'), service: val('service'),
            message: val('message'), website: val('website'), page: form.dataset.page || '',
            startedAt: loadedAt, turnstile: token,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (body && body.fields) { showFieldErrors(body.fields); say(body.error || 'Please check the highlighted fields.', 'error'); }
          else say((body && body.error) || fallback(), 'error');
          btn.disabled = false; btn.textContent = label;
          if (window.turnstile) { try { window.turnstile.reset(); } catch (x) { /* no widget */ } }
          return;
        }
        const done = document.createElement('div');
        done.className = 'enquiry-sent'; done.setAttribute('role', 'status'); done.tabIndex = -1;
        done.innerHTML = '<strong>Thank you, your enquiry has been sent.</strong>' + SENT;
        form.replaceWith(done); done.focus();
      } catch (err) {
        say(fallback(), 'error');
        btn.disabled = false; btn.textContent = label;
        if (window.turnstile) { try { window.turnstile.reset(); } catch (x) { /* no widget */ } }
      }
    });
  });
})();
