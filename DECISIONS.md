# Decisions

## AdonisJS framework departures

1. **TST-15 — Exercise the configured session stores.** The API and Hypermedia examples do
   not set `SESSION_DRIVER=memory` in `.env.test`. These are runnable session-store examples,
   and their tests exercise the store used by the application, including persisted session
   revocation and rejection of copied cookies. Hypermedia's
   [session configuration](apps/hypermedia/config/session.ts) accepts only the database store:
   Account Kit requires a verified, revocable server-side store for managed sessions. The API
   [session test command](apps/api/README.md) explicitly selects the database store, while its
   access-token configuration keeps cookie sessions. Neither application configures a memory
   store. Changing just the test environment would select an unavailable store; adding a
   different store would stop testing the documented configuration. Tests authenticate through
   the real routes where session persistence is part of the contract, rather than relying on
   `loginAs` or `withSession` to create that state. Keep these tests against their configured
   stores and use memory only in examples whose session contract supports it.
