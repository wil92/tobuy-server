# Arduino client integration

The intended client is the
[To Buy Arduino ESP32 firmware](https://github.com/wil92/tobuy-arduino). Its
[server protocol](https://github.com/wil92/tobuy-arduino/blob/master/doc/server-protocol.md)
is the authoritative contract; check it before changing the integration.

## Implemented protocol

Configure the client with an `http://host[:port]` base URL. The server provides
`GET /tobuy` and `ws://host[:port]/ws`; the server defaults to port 3000 and
the device defaults to port 80 when no port is specified. The HTTP response
and WebSocket list messages use this complete JSON object shape:

```json
{
  "type": "list",
  "revision": 42,
  "periodic": [{ "id": "milk", "name": "Milk", "needed": true }],
  "missing": [{ "id": "bread", "name": "Bread" }]
}
```

Each process starts with empty in-memory `periodic` and `missing` arrays at
revision 0. Lists are not persisted, and this server does not yet provide a
public API to add or remove items. Internal server integrations can update the
shared list store; changes increment the revision and are broadcast to
connected clients. A `set_periodic` update applies an idempotent desired state
and broadcasts the resulting complete list. Repeating the current state or
requesting an unknown ID returns the current list without incrementing the
revision.

The server validates the protocol's list limits: unsigned 32-bit revisions,
at most 64 combined items, nonempty unique IDs of at most 32 UTF-8 bytes,
nonempty names of at most 64 UTF-8 bytes, boolean `needed` values on periodic
items, and list messages no larger than 8192 UTF-8 bytes. WebSocket requests
must be text messages with the supported `set_periodic` shape. The WebSocket
server responds to ping frames with pongs.

The client protocol is unauthenticated and unencrypted (`http://` and `ws://`).
Use it only on a trusted network: other network participants can read or
change the list and impersonate the server.
