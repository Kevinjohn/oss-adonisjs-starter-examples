# Confirming a password before a sensitive action

The browser examples show a two-step confirmation flow for saving a secure note. The user first
confirms their current password for a specific action, account and note body. The app then saves
the pending note through the durable confirmation inside the same transaction as the write.

Each example enables Account Kit's `sessionManagement`, registers `PasswordConfirmationsProvider`,
and imports `start/secure_note_routes.ts` from `start/routes.ts`. The route group uses the raw `web`
guard and the same Account Kit blocker as the host's password settings. The blocker rejects active
masquerade before the controller runs. The existing `managedGuard.current(ctx)` provides Account
Kit's sign-in handle; the confirmation remains bound to that account and registered session.

The intent binds the confirmation to the exact note content and owner:

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/services/secure_notes.ts -->
```ts
export function buildNoteRequest(userId: number | string, body: string) {
  return { action: 'save-secure-note', scope: String(userId), intent: { body } }
}
```

<!-- prettier-ignore-end -->

Enable the feature and configure the idle expiry in the [Account Kit configuration](../../apps/hypermedia/config/account_kit.ts).

The existing `account_sessions` migration creates the registry referenced by
`password_confirmations.sign_in_id`. The session guard stores Account Kit's handle at sign-in, and
the revision middleware checks it on each request. Password changes preserve the current registry
row while ending other sign-ins; logout removes the current row.

Sessions created before this registry was enabled have no session handle. They are signed out on
their next request and need to sign in once after adopting these examples.

The controller uses [Vine validators](../../apps/hypermedia/app/validators/secure_note.ts) to check
the draft length, password type and submitted confirmation ID. It passes the parsed draft text unchanged
into the confirmation request. The Save form shows the confirmed draft and submits its confirmation
ID. The service looks up the pending draft by the submitted ID and registered sign-in before using
its note body. If a later confirmation replaces the pending note, Save in an older tab is rejected and
the newer confirmation remains available.

The pending-note migration adds one row per registered sign-in, with cascading cleanup on logout.
Account deletion uses the same managed logout to revoke the sign-in and clear browser session data.
Run migrations when adopting this change. Previously pending browser-session notes are discarded
and need a fresh confirmation.

The controller opens Account Kit’s `withCurrent` transaction and passes its current-account context
and the validated confirmation ID to [`saveSecureNote`](../../apps/hypermedia/app/services/secure_notes.ts).
The service uses that transaction to consume the matching confirmation, remove only its pending row,
and save the note. The controller uses the returned status to flash feedback and redirect. An older
response cannot overwrite a newer pending row through session storage.

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/services/secure_notes.ts -->
```ts
    await confirmations.consume(context, {
      ...buildNoteRequest(account.id, pending.body),
      confirmationId,
    })
```

<!-- prettier-ignore-end -->

See the implementation and browser journey for each UI:

- [Hypermedia controller](../../apps/hypermedia/app/controllers/secure_notes_controller.ts),
  [routes](../../apps/hypermedia/start/secure_note_routes.ts),
  [session guard](../../apps/hypermedia/app/services/session_guard.ts),
  [page](../../apps/hypermedia/resources/views/pages/settings/secure_note.edge), and
  [journey test](../../apps/hypermedia/tests/browser/secure_note_journey.spec.ts)
- [Inertia React page](../../apps/inertia-react/inertia/pages/settings/secure_note.tsx) and
  [journey test](../../apps/inertia-react/tests/browser/secure_note_journey.spec.ts)
- [Inertia Vue page](../../apps/inertia-vue/inertia/pages/settings/secure_note.vue) and
  [journey test](../../apps/inertia-vue/tests/browser/secure_note_journey.spec.ts)
