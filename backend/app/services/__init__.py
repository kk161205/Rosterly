# Business logic goes here, kept separate from route handlers so it's
# independently testable — see rules.md §6 (tests are part of the same
# change as the code they test, not a follow-up).
#
# Includes the scheduled job implementations referenced by
# app/core/celery_app.py: assets.run_depreciation_job,
# assets.check_warranty_amc_expiry, notifications.dispatch_pending_emails.
