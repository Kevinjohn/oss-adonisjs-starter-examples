# Duplicate request guard

The guarded-note example requires the default SQLite connection. Duplicate Request Guard 0.1.0 supports better-sqlite3 only; the API's PostgreSQL option does not support this example.

The starter apps use `@kevinjohn/adonisjs-duplicate-request-guard` to make a create-note command safe to retry. The client supplies a `commandId` and a `requestKey`; the server scopes both to the raw authenticated account, reserves a receipt, and commits the note and completed receipt in one transaction. Repeating the same request returns the original result without inserting another note.

## Register the routes

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/notes_routes.ts -->
```ts
router
  .group(() => {
    router.get('/notes', [() => import('#controllers/notes_controller'), 'index']).as('notes.index')
    router
      .post('/notes', [() => import('#controllers/notes_controller'), 'store'])
      .as('notes.store')
  })
  .use([middleware.accountKitBlocker(), middleware.auth({ guards: ['web'] })])
```

<!-- prettier-ignore-end -->

The API app uses the selected raw guard and applies its admission and Account Kit checks in [its route module](../../apps/api/start/notes_routes.ts). Browser routes use raw `web` authentication with the Account Kit blocker; they reject active masquerade and keep notes owned by the raw account. Browser writes still pass through the host's CSRF middleware.

## Execute the command

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/controllers/notes_controller.ts -->
```ts
const createNote: Operation<{ body: string }, undefined, { noteId: number }> = {
  name: 'notes.create',
  authorizeAccess: async ({ trx, actorId }) => {
    const user = await trx.from('users').where('id', actorId).first()
    if (!user) throw new Error('User no longer exists')
  },
  work: async ({ trx, actorId, payload }) => {
    const [noteId] = await trx.table('notes').insert({ user_id: actorId, body: payload.body })
    return { noteId }
  },
}
```

<!-- prettier-ignore-end -->

The controller gets the owner from the raw guard, validates the body and both request identifiers, then calls `execute` with the payload and authenticated owner. Never accept `actorId`, `scopeId`, or receipt identity from request data. See [the complete controller](../../apps/hypermedia/app/controllers/notes_controller.ts) and the API variant in [apps/api](../../apps/api/app/controllers/notes_controller.ts).

## Keep retry identifiers stable

Generate `commandId` and `requestKey` once for an intended command and reuse both on every retry, including after a dropped connection. The browser demo submits the same payload twice and confirms that both responses return the same note. It keeps that payload in the open form if either response is lost. The note stays read-only until the retry confirms the result, then the form is ready for a new note with fresh identifiers. See the implementation in [the Hypermedia page](../../apps/hypermedia/resources/views/pages/notes.edge), [React](../../apps/inertia-react/inertia/pages/notes.tsx) and [Vue](../../apps/inertia-vue/inertia/pages/notes.vue).

## Install the receipt table

The app manifests pin the exact guard archive version they support. Each app includes a receipts migration and a notes migration. Run the app's migrations before serving requests; the migrations-generated database schema must include `request_receipts` and `notes`.

The receipt migration keeps unique indexes on `(operation, command_id)` and `(operation, request_key)` to arbitrate concurrent reservations. Keep both indexes in place. See the [receipt migration](../../apps/hypermedia/database/migrations/1810000001000_create_request_receipts_table.ts).

The app tests cover receipt replay, one-write behavior, account ownership and the browser retry journey in [API](../../apps/api/tests/functional/notes.spec.ts), [Hypermedia](../../apps/hypermedia/tests/browser/notes.spec.ts), [React](../../apps/inertia-react/tests/browser/notes.spec.ts) and [Vue](../../apps/inertia-vue/tests/browser/notes.spec.ts).

The Hypermedia browser tests also exercise missing-CSRF rejection and verify that no note or receipt is written. With JavaScript disabled, the submit button remains disabled and the page explains that JavaScript is required; note text cannot be submitted through a GET URL.
