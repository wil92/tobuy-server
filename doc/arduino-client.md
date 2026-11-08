# Arduino client integration

The intended client is the
[To Buy Arduino ESP32 firmware](https://github.com/wil92/tobuy-arduino). Its
[server protocol](https://github.com/wil92/tobuy-arduino/blob/master/doc/server-protocol.md)
is the authoritative contract; check it before implementing or changing the
integration. The current server does **not** implement this contract.

The client expects an `http://host[:port]` base URL, connects to
`ws://host[:port]/ws`, and fetches `GET /tobuy` after connecting and each
reconnect. The device defaults to port 80 when none is specified, while this
server defaults to 3000.

The HTTP response and each WebSocket list update must contain the same complete
JSON object shape:

```json
{
  "type": "list",
  "revision": 42,
  "periodic": [{ "id": "milk", "name": "Milk", "needed": true }],
  "missing": [{ "id": "bread", "name": "Bread" }]
}
```

The contract requires an unsigned 32-bit revision that increases on changes
and is consistent across HTTP and WebSocket updates for a connection. Equal
revisions must describe identical lists; after reconnect the device accepts a
fresh revision sequence. Both arrays are required, with at most 64 items
combined. IDs must be unique across both arrays and at most 32 UTF-8 bytes;
names must be nonempty and at most 64 UTF-8 bytes. IDs must also be nonempty,
and `needed` must be a boolean on periodic items. Each list message must fit
within 8192 UTF-8 bytes and be sent as a single, unfragmented WebSocket text
message.

The device sends `{"type":"set_periodic","id":"milk","needed":true}` for a
touchscreen change. The server should apply the desired state idempotently and
broadcast the complete list with a newer revision when changed, or the current
list when already in that state. It must answer WebSocket ping frames with
pongs. The device waits for a confirming list and refetches if confirmation
does not arrive within 10 seconds.

The client protocol is unauthenticated and unencrypted (`http://` and `ws://`).
Use it only on a trusted network: other network participants can read or
change the list and impersonate the server. Do not document the protocol as
implemented or secure until the server actually provides it.
