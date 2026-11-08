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

The server loads the selected Google Keep note before accepting connections.
The in-memory revision resets on process restart; the note is the source of
list data. Polling changes and confirmed `set_periodic` updates increment the
revision and are broadcast to connected clients. A repeated state or unknown
ID refreshes the note and broadcasts the current list without incrementing the
revision unless the note changed. On a failed write the last known list is
broadcast without confirming the requested state. Configure the note format,
credentials, and polling as described in the [Google Keep guide](google-keep.md).

The server validates the protocol's list limits: unsigned 32-bit revisions,
at most 64 combined items, nonempty unique IDs of at most 32 UTF-8 bytes,
nonempty names of at most 64 UTF-8 bytes, boolean `needed` values on periodic
items, and list messages no larger than 8192 UTF-8 bytes. WebSocket requests
must be text messages with the supported `set_periodic` shape. The WebSocket
server responds to ping frames with pongs.

The client protocol is unauthenticated and unencrypted (`http://` and `ws://`).
Use it only on a trusted network: other network participants can read or
change the list and impersonate the server.
