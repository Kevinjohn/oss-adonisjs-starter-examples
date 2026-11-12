# Decision gaps

## Reconciled source decisions

- [Assembly specification](../docs/specification.md) is the maintained command and data contract for sandbox composition, source lineage, conflict resolutions, checks, layer rebasing, and release recording. The operator stories document those actions against the specification.
- [Masquerade with Access Control](../docs/cookbook/masquerade-with-access-control.md) documents the implemented effective-account team routes, target permission checks, editable rename marker, and raw-actor invitation boundary. [Soft-delete with Account Kit](../docs/cookbook/soft-delete-with-account-kit.md) documents self-deletion and configured admin recovery.

## Email-change transport difference

The browser kits expose an explicit pending-change cancellation form and route; see [US-ACCOUNT-06](accounts/us-account-06-cancel-email-change.md). The API has no dedicated cancellation route. Its current profile PATCH can cancel a pending address by supplying the confirmed current address, as described in [US-ACCOUNT-05](accounts/us-account-05-request-email-change.md). The repository does not record a target requiring a separate API cancellation endpoint, so the catalogue records the existing route difference without treating endpoint parity as an agreed feature.

No other mismatch between a current capability and an explicit accepted product target was identified in the reviewed app routes, cookbook contracts, and sandbox specification.
