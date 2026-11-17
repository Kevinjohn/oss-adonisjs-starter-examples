# Changelog

## Unreleased

All four apps validate their public origin with Origin Guard 0.2.0, demonstrate note replay with Duplicate Request Guard 0.1.0, and validate reading-list labels with Lucid Checked Columns 0.2.0. Hypermedia, React and Vue also use Confirm Action with Password 0.2.0 and Account Kit session management for one-use secure-note writes. Existing browser sessions require one fresh sign-in when adopting this change. The API uses bearer tokens.

## v0.13.0

Starter Examples now owns the four runnable apps and their integration tests. Edit an app in
this repository. The cookbook shows how to combine the released packages using the tested source.

Compared with v0.12.0, every app uses Lucid Soft Delete 0.2.0 and demonstrates explicit
deleted-account administration. Account Kit 0.4.0, Masquerade 0.4.0 and Access Control 0.2.0
are the same in all four. The API uses bearer tokens and moves from better-sqlite3 ^12.11.1
to ^13.0.3. Hypermedia, Inertia React and Inertia Vue use sessions and keep their SQLite driver
range. Each browser app exposes the updated administration navigation in its own UI.
