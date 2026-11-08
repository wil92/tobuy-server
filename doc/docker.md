# Docker deployment

Install Docker Engine and the Docker Compose plugin on the home server. From
the repository root, create and secure the configuration file:

```sh
cp .env.example .env
chmod 600 .env
```

Configure the Google Keep credentials and note as described in the
[Google Keep guide](google-keep.md), and optionally set `WEATHER_CITY` as
described in the [temperature guide](temperature.md). Leave `KEEP_PYTHON` as
`.venv/bin/python`: the image provides its own Python environment there. A
host-specific interpreter path will not work inside the container.

Start and manage the service with:

```sh
docker compose up -d --build
docker compose logs -f server
docker compose down
```

The service restarts automatically unless stopped manually. HTTP and WebSocket
traffic share host port `3000` by default. To change only the host port, add
`HOST_PORT=3001` to `.env`. To change the server's listening port, set `PORT`
to a numeric container port in `.env`; Compose publishes that port on
`HOST_PORT` (still `3000` unless changed). Values exported in the shell take
precedence over `.env` for Compose port interpolation. Recreate the container
with `docker compose up -d` after changing `.env`, or rebuild with
`docker compose up -d --build` after updating the code.

Compose passes `.env` values as container environment variables; the file and
credentials are not copied into the image. Container environment variables
are visible to users with Docker access, so protect the host and Docker
daemon as well as `.env`. The endpoints have no authentication or encryption:
publish them only on a trusted network, not directly on the internet. Liveness
can be checked at `http://localhost:3000/health` (adjust for `HOST_PORT`);
it does not indicate whether Google Keep synchronization has succeeded.
