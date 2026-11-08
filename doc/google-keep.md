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

Use a Keep **text note**, not a native Keep checklist. Enter Markdown text:

```markdown
## Periodic
- [ ] Milk
- [x] Coffee

## Missing
- Bread
- Apples
```

In the periodic section, unchecked means needed and checked means not needed.
Only periodic switches can be changed from the Arduino. Edit the note directly
to add, rename, or remove items. Missing items are ordinary bullets; they do
not have switches. `-`, `*`, and `+` bullets and `[x]` or `[X]` checked
markers are accepted. Heading names are case-insensitive.

The parser salvages recognized entries and ignores other content, malformed
bullets, names over 64 UTF-8 bytes, and all instances of duplicate names within
the same section. If no entries are recognizable the list is empty. The
server logs the number of skipped bullet entries without logging their
contents. It also skips entries exceeding the Arduino protocol's 64-item or
8192-byte message limits. IDs are derived from the section and exact item
name, so they survive checkbox changes and reordering but change on rename.

## Synchronization and limitations

The initial sync must succeed before the server listens. Afterward the server
polls the note and broadcasts changes. Device updates are serialized, sync the
note again, and change only the checkbox character if the whole note still
matches the last version read. Otherwise the server refreshes the current
note and rejects the stale request; try the switch again. Errors are logged,
the last known list remains available, and failed writes are not confirmed.
If a request times out after Google accepted it, a later poll may still reveal
the change. Keep API failures can require restarting the helper, and recovery
may exceed the Arduino's 10-second confirmation timeout.

This private API provides no documented atomic compare-and-swap. An edit
made between the final check and the write may still conflict or be
overwritten. Avoid concurrent edits while using the device and keep backups.
The local revision resets after restart; it is not a Google Keep revision.
The Arduino endpoints are unauthenticated and unencrypted; use a trusted
network.
