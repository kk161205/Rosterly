# SQLAlchemy models go here — one file per table (or grouped by domain),
# matching the 23 tables defined in ROSTERLY_PROJECT_DOCUMENTATION.md §1.
#
# Build order per the doc's own priority: users/roles/permissions/sessions
# first (auth is the foundation everything else depends on), then the
# domain tables per page as branches are picked up (see rules.md §7).
#
# Do not invent fields not in the documented schema — if something seems
# missing, that's a rules.md §0 situation: ask, don't add silently.
