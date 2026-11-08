# To Buy Server

An Express/Node.js server intended to support the
[To Buy Arduino](https://github.com/wil92/tobuy-arduino) ESP32 shopping-list
display. The Arduino client fetches the list over HTTP, receives updates over
WebSocket, and sends periodic-item changes from its touchscreen.

The server reads a selected Google Keep note and exposes the Arduino client's
revisioned list endpoint and WebSocket protocol. Missing items can be marked
done in Keep through the server's HTTP API. See the
[Google Keep guide](doc/google-keep.md) for setup and the
[client integration guide](doc/arduino-client.md) for protocol and security
limitations.

## Documentation

- [Development](doc/development.md): setup, commands, and validation gaps.
- [Docker deployment](doc/docker.md): home server deployment with Compose.
- [Architecture](doc/architecture.md): current application and routes.
- [Arduino client integration](doc/arduino-client.md): required protocol and
  implementation status.
- [Google Keep integration](doc/google-keep.md): credentials, note format,
  synchronization, and limitations.
- [Temperature](doc/temperature.md): city configuration and current weather.
- [Coding rules](doc/coding-rules.md): conventions for changes and tests.
- [Express Senior agent](.github/agents/express-senior.agent.md): project
  workflows and skills.

## Build and publish the Docker image

Create a `tobuy-server` repository in Docker Hub, then from the repository root
log in, build the image tagged with your Docker Hub username, and push it:

```sh
docker login
docker build -t ggjnez92/tobuy_server:<current-version> .
docker build -t ggjnez92/tobuy_server:latest .
docker push ggjnez92/tobuy_server:<current-version>
docker push ggjnez92/tobuy_server:latest
```
