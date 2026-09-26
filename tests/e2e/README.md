# Customer-portal end-to-end checks

Playwright scripts used to verify the customer dashboard (account.html) and admin view.

- Run with `node <script>` from a folder containing `node_modules/playwright-core` (`npm i playwright-core`); they drive the installed Google Chrome (`channel: 'chrome'`).
- `shot.js` screenshots, `flows.js` dashboard interactions, `sec.js` tenant isolation, `profile.js` pet profile photos,
  `part4.js` owner details / breed / medication / EXIF / admin, `live.js` production smoke, `seed.js` + `photos.js` local test data, `ab2.js` sidebar pixel comparison.
- They expect the site on http://127.0.0.1:8788 and the API on http://127.0.0.1:8787 (`live.js` targets production), the seeded local accounts, and test images in `./img` and `./imgtest` next to the scripts.
