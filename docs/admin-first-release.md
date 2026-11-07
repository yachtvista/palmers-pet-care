# Admin-first release

This branch starts from deployed public commit `e524916632b01717874db21d393edd0265a3d55d`. It adds the validated staff calendar/planner and private availability interface using independent `admin-bookings.css` and `admin-booking-slots.js` assets. Public HTML, CSS, navigation and account flows retain their existing design. Public script cache keys and minimal scheduling/custom-price compatibility are updated. The broader validated public navigation change remains on the feature branch for a later release.

Run `tests/e2e/admin-first.mjs` against the adjacent release API worktree with Playwright Core available. `ACCEPTANCE_BROWSER=webkit` repeats the acceptance in WebKit. The test verifies deployed-public content hashes, central signup/login, normal customer booking, seven-day continuous care/custom £190 charge, calendar continuation, neutral customer unavailability, record preservation and closed Kent. Test data is synthetic.

The complete cutover, exact commit manifest, protected production export verification and rollback/forward-recovery procedure are documented in the adjacent API repository at `docs/admin-first-release.md`. Deployment requires the user's explicit final authorisation. Publish only this narrowed release commit, not the entire feature branch. No production deploy has occurred during preparation.
