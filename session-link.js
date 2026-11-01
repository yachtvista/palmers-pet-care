/* Signed-in state in the public header. The "Log in" / "Customer Login" link is plain HTML, so a
   signed-in visitor who came back to the site saw "Log in" and had no way back to their account.
   One GET /me with the session cookie (the same check the account pages make): when it succeeds
   the link becomes "My account" (account.html), or "Admin" (admin.html) for the carer's account.
   Signed out, or the API unreachable: the page stays exactly as it is. Nothing is stored. */
(function () {
  var links = document.querySelectorAll('a.hb-login, a.customer-login');
  if (!links.length) return;
  var API = ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0 ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  fetch(API + '/me', { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.owner) return;
      var admin = !!d.isAdmin;
      links.forEach(function (a) {
        a.textContent = admin ? 'Admin' : 'My account';
        a.href = admin ? 'admin.html' : 'account.html';
        a.setAttribute('data-signed-in', '');
      });
    })
    .catch(function () { /* signed out or offline: keep "Log in" */ });
})();
