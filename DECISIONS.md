# Decisions

## AdonisJS framework departures

1. **TST-15 — Exercise the configured database session store in Hypermedia.** The Hypermedia example
   does not set `SESSION_DRIVER=memory` in `.env.test`. It is a runnable session-store example, and
   its tests exercise the store used by the application, including persisted session revocation and
   rejection of copied cookies. Hypermedia's
   [session configuration](apps/hypermedia/config/session.ts) accepts only the database store:
   Account Kit requires a verified, revocable server-side store for managed sessions, and its
   [environment validation](apps/hypermedia/start/env.ts) permits only `database`. Changing just
   the test environment would select an unavailable store; adding a different store would stop
   testing the documented configuration. Tests authenticate through the real routes where session
   persistence is part of the contract, rather than relying on `loginAs` or `withSession` to create
   that state. Keep these tests against the configured database store and use memory only in
   examples whose session contract supports it.
