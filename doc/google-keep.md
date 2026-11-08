# Google Keep integration

The server uses the unofficial Python [gkeepapi](https://gkeepapi.readthedocs.io/)
client because the official Keep API cannot edit an existing note. It accesses
Google's private mobile API; Google can change or block it without notice.
The library initially syncs all accessible notes, although this server reads
and modifies only the configured note. Back up important notes.

## Setup

Follow [development setup](development.md), including the Python virtual
environment. Copy `.env.example` to `.env` and set:

- `KEEP_EMAIL`: Google account email. The account must have edit access to
  the note, whether it owns the note or is a collaborator.
- `KEEP_MASTER_TOKEN`: the account's gkeepapi master token. Obtain it using
  the [gkeepapi authentication instructions](https://gkeepapi.readthedocs.io/#obtaining-a-master-token);
  do not put a password or an ordinary OAuth access token here.
- `KEEP_NOTE_ID`: the ID from the selected note's URL in the Keep web app.
- `KEEP_PYTHON`: the Python interpreter containing gkeepapi, defaulting to
  `.venv/bin/python` relative to the project root.
- `KEEP_POLL_INTERVAL_MS`: poll interval, default `30000`; minimum `1000`.

The master token can grant **full access to the Google account**, not just the
selected note. Treat it like a password, restrict `.env` permissions, never
commit it, and do not send it to other people. The project ignores `.env` and
`.env.*`, except the credential-free example. Existing process environment
variables take precedence over `.env`. Prefer a dedicated account with access
only to the required note where practical.

## Note format

Use a native Google Keep **checklist**. Prefix periodic item text with the
exact, case-sensitive marker `[PERIODIC]`:

```text
unchecked: [PERIODIC] Milk
checked:   [PERIODIC] Coffee
unchecked: Bread
checked:   Purchased item
```

For periodic items, unchecked means needed and checked means not needed. The
marker is removed from the name displayed on the Arduino. Unchecked items
without the marker appear in the missing list; checked non-periodic items are
excluded. Only periodic switches can be changed from the Arduino. To mark a
missing item done, use the HTTP endpoint below. Edit the checklist directly to
add, rename, or permanently delete items. Indented items are treated as
individual entries.

The server skips entries with empty names or names over 64 UTF-8 bytes, as
well as entries exceeding the Arduino protocol's 64-item or 8192-byte message
limits. It logs the number skipped without logging their contents. Duplicate
names are allowed when they are separate checklist items. IDs derive from
Keep's item identifiers and remain stable across renames and reordering; a
deleted and recreated item gets a new ID.

## Completing a missing item

Send `DELETE /tobuy/missing/{id}` using the ID from the `missing` array in
`GET /tobuy`. This marks the corresponding non-periodic checklist item checked;
it does not delete the item from the Google Keep note. On confirmation, the
endpoint returns HTTP 200 and the complete updated list object, and the change
is broadcast to WebSocket clients. A repeat request returns 404 because checked
items are no longer in the missing list. Periodic IDs cannot be completed
through this endpoint.

The endpoint returns JSON errors: 400 for an ID over 32 UTF-8 bytes, 404 when
the ID is not in the latest synchronized missing list, 409 if the note changed
or the write could not be confirmed, 502 on a Keep failure, and 503 before the
first successful sync or when the list revision is exhausted. After a 409,
fetch the list before trying again. A timed-out write may still take effect
later. The endpoint is unauthenticated and unencrypted; use a trusted network.

## Synchronization and limitations

The server listens immediately and attempts an initial sync. If it fails, the
server logs the error and retries at the configured polling interval. Until
the first successful sync, HTTP and WebSocket clients receive an empty list;
that list does not mean the Keep note is empty. Successful syncs broadcast
changes. Device updates and missing-item completions are serialized, sync the
checklist again, and change only the selected item's checked state if the
item IDs, text, checked states, and order still match the last version read.
Otherwise the server refreshes the current
note and rejects the stale request; refresh and retry if appropriate. Errors are logged,
the last known list remains available, and failed writes are not confirmed.
Logs include exception types and diagnostic messages; configured credentials,
note identifiers, checklist text passed in update requests, and URLs are redacted.
Treat logs as potentially sensitive and limit access to them.
If a request times out after Google accepted it, a later poll may still reveal
the change. Keep API failures can require restarting the helper, and recovery
may exceed the Arduino's 10-second confirmation timeout.

This private API provides no documented atomic compare-and-swap. An edit
made between the final check and the write may still conflict or be
overwritten. Avoid concurrent edits while using the device and keep backups.
The local revision resets after restart; it is not a Google Keep revision.
The Arduino endpoints are unauthenticated and unencrypted; use a trusted
network.
