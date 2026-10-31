# Customer and carer preferences — 2026-10-31

Account page has a prominent top shortcut and dedicated Photo & birthday preferences section. Four independent choices: private diary photography, website/social-media photography, physical birthday card and birthday email. Explain private diary access, memories/peace of mind and independent public permission. Cards require care within the12 months before the birthday; staff check eligibility manually. Choices apply to all pets on the account. Customer contact modal no longer incorrectly labels the email flag as cards.

Admin owner facts show all four choices, with requested/off/permitted statuses. Existing monthly birthdays and each pet's recorded DOB remain; monthly birthday entries now include card request/eligibility and email choice. No automated card fulfilment or publication.

API schema015 and Worker must be deployed first. Fresh photo/card permissions default off; existing birthday-email preferences are preserved. New registrations start email off until chosen. Photo upload SQL checks diary permission independently of online permission. Existing private photos and customer profile-photo uploads are preserved.

Validation:17 real Worker/SQLite checks,12 real-Worker customer/admin browser checks (save failure/retry, keyboard, reload,390px), existing admin birthday/directory regression, booking and27 slot/activity checks passed; Worker dry-run bundling and JS syntax passed. Existing emails.mjs fixture suite is already stale under the host date; isolated-clock run on both baseline and changed Worker reproduces its newer-admin-reminder versus old one-birthday-email assertion. Not silently skipped or claimed fixed. Birthday-reminders suite passes with mocked email transport. No real email sent in testing.

Screenshots of synthetic customer/admin views are in /private/tmp/palmers-preferences. Deployment uses the private D1 backup, additive migration then Worker then cache-busted account/admin portal assets. Existing URLs retained.
