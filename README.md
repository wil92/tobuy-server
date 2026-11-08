# To Buy Server

An Express/Node.js server intended to support the
[To Buy Arduino](https://github.com/wil92/tobuy-arduino) ESP32 shopping-list
display. The Arduino client fetches the list over HTTP, receives updates over
WebSocket, and sends periodic-item changes from its touchscreen.

The server is currently an Express scaffold: it serves placeholder pages, not
the shopping-list API or WebSocket protocol. It cannot yet serve the Arduino
client. See the [client integration guide](doc/arduino-client.md) for the
required contract and its security limitations.

## Documentation

- [Development](doc/development.md): setup, commands, and validation gaps.
- [Architecture](doc/architecture.md): current application and routes.
- [Arduino client integration](doc/arduino-client.md): required protocol and
  implementation status.
- [Coding rules](doc/coding-rules.md): conventions for changes and tests.
- [Express Senior agent](.github/agents/express-senior.agent.md): project
  workflows and skills.
