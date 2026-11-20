# Changelog

## v0.15.3

- All four starters adopt Access Control 0.2.2, Masquerade 0.4.2 and Duplicate Request Guard 0.1.2.
- All four use Account Kit 0.4.1. Hypermedia, React and Vue use Confirm Action with Password 0.2.1.
  This is the compatible set for these releases.

The API continues to use bearer tokens. This release requires no new migrations.

## v0.15.2

- The Hypermedia browser test now verifies that signing out clears an unspent secure-note draft
  and password confirmation. The saved note survives sign-out, and the same account can sign
  back in, confirm a fresh draft and save it.

All four starters retain the dependency versions listed in [v0.15.1](#v0151). This release
requires no new migrations.

## v0.15.1

All four starters adopt these package patches:

- Account Kit 0.4.1, Access Control 0.2.1 and Masquerade 0.4.1.
- Duplicate Request Guard 0.1.1, Lucid Checked Columns 0.2.1, Lucid Soft Delete 0.2.1 and Origin Guard 0.2.1.

Hypermedia, React and Vue also adopt Confirm Action with Password 0.2.1. The API adopts SQLite Backup 0.3.2 and continues to use bearer tokens.

This release adds no app migrations. Existing deployments upgrading from an earlier release should apply the migrations listed for that release before deploying.

## v0.15.0

- The API starter now includes SQLite Backup 0.3.1. Set `SQLITE_BACKUP_DIRECTORY` when using its SQLite connection to enable the backup commands.
- The [recovery recipe](docs/cookbook/sqlite-backup.md) walks through creating and verifying a backup, staging a restore to a separate file and reading a seeded account from that file. The API integration test also checks that an edit made after the backup remains in the live database.

Hypermedia, React and Vue carry forward from v0.14.1 unchanged. No new database migration is required.

## v0.14.1

- Prevent pending secure-note text from appearing to another account after self-deletion and a new sign-in. Account deletion now revokes the registered sign-in and clears its browser session.
- Preserve a newer password confirmation when an older save response arrives late. Pending notes belong to the registered sign-in; consuming the confirmation, removing the pending row and saving the note share one transaction.
- Give Hypermedia's notes form an explicit POST action and disable submission until JavaScript initializes, preventing private draft text from entering a URL.
- Add account-switch, overlapping-response, JavaScript-disabled and missing-CSRF regression coverage. Assert the intended safe reading-list error response and correct the v0.14.0 changelog heading.

### Migration requirements

For existing Hypermedia, React and Vue installations adopting these changes, run `node ace migration:run --force` from the app directory before serving the updated app. The new `1810000003003_create_pending_secure_notes.ts` migration creates `pending_secure_notes`, linked to the existing `account_sessions` and `password_confirmations` tables. Apply all outstanding migrations in order; do not copy this table into an unrelated application without its corresponding secure-note implementation.

Previously pending session-based notes require fresh password confirmation. Already saved secure notes are preserved. The API needs no new migration for this patch and retains bearer-token authentication. Package versions, dependency declarations and lockfiles are unchanged.

## v0.14.0

All four apps validate their public origin with Origin Guard 0.2.0, demonstrate note replay with Duplicate Request Guard 0.1.0, and validate reading-list labels with Lucid Checked Columns 0.2.0. Hypermedia, React and Vue also use Confirm Action with Password 0.2.0 and Account Kit session management for one-use secure-note writes. Browser note retries retain their command after a lost response, and secure-note saves reject stale confirmations from another tab. API reading lists enforce Account Kit account restrictions. The guarded-note example uses SQLite. Existing browser sessions require one fresh sign-in when adopting this change. The API uses bearer tokens.

## v0.13.0

Starter Examples now owns the four runnable apps and their integration tests. Edit an app in
this repository. The cookbook shows how to combine the released packages using the tested source.

Compared with v0.12.0, every app uses Lucid Soft Delete 0.2.0 and demonstrates explicit
deleted-account administration. Account Kit 0.4.0, Masquerade 0.4.0 and Access Control 0.2.0
are the same in all four. The API uses bearer tokens and moves from better-sqlite3 ^12.11.1
to ^13.0.3. Hypermedia, Inertia React and Inertia Vue use sessions and keep their SQLite driver
range. Each browser app exposes the updated administration navigation in its own UI.
