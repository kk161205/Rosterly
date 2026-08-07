# Two agents live here, per project doc §8.2:
#   - orchestration_agent.py  (onboarding/offboarding checklist suggestions,
#     §8.2.1 — suggestion only, never writes directly, see §8.4.2)
#   - query_agent.py  (natural-language query assistant, §8.2.2 — read-only
#     calls to the core backend via BackendClient, token pass-through)
#
# Both call the core backend through app.core.backend_client.BackendClient,
# never a direct DB connection. See rules.md §3 rule 9.
