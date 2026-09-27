# Customer-portal end-to-end checks

Playwright scripts used to verify the customer dashboard (account.html) and admin view.

- Run with `node <script>` from a folder containing `node_modules/playwright-core` (`npm i playwright-core`); they drive the installed Google Chrome (`channel: 'chrome'`).
- `shot.js` screenshots, `flows.js` dashboard interactions, `sec.js` tenant isolation, `profile.js` pet profile photos,
  `part4.js` owner details / breed / medication / EXIF / admin, `live.js` production smoke, `seed.js` + `photos.js` local test data, `ab2.js` sidebar pixel comparison.
- They expect the site on http://127.0.0.1:8788 and the API on http://127.0.0.1:8787 (`live.js` targets production), the seeded local accounts, and test images in `./img` and `./imgtest` next to the scripts.

Booking calendar: `PLAYWRIGHT_MODULE=/path/to/playwright-core node tests/e2e/bookings.cjs`.
This self-contained browser check intercepts the API with test fixtures (no live customer data). It covers pet selection, estimates, multi-day entries, reload, editing, deletion, keyboard/touch copying, drag-and-drop and mobile overflow. The real Worker/database path is checked separately by `node tests/bookings.mjs` in the API repository.

Admin approvals and availability: `PLAYWRIGHT_MODULE=/path/to/playwright-core node tests/e2e/admin-calendar.mjs` (Node 24+). Requires the adjacent `palmers-pet-care-api` checkout. The browser uses the actual Worker against an isolated SQLite database and verifies daily admin details, approval, customer status, closed dates, reopening, persistence and non-admin access denial.

The admin-calendar check also verifies automatic updates between open customer/admin pages without reloads, red pending and green approved text, live changes in the open day, preservation of unsaved availability/customer drafts, and rejection of stale customer edits after an approval. Visible calendars poll every five seconds and check again on focus/reconnection; unchanged responses do not redraw the calendar.
