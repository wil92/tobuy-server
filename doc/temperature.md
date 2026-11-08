# Temperature

Set `WEATHER_CITY` in `.env` to a city name, for example `WEATHER_CITY=London`,
and restart the server. Existing process environment variables override `.env`.
The endpoint works independently of Google Keep. A missing or blank city does
not prevent server startup, but the endpoint returns HTTP 503.

`GET /temperature` returns the current local time for the resolved city and
the current air temperature at 2 metres in Celsius:

```json
{"city":"London","country":"United Kingdom","time":"2026-11-08T12:00","temperature":12.3,"unit":"°C"}
```

The server uses Open-Meteo's free geocoding and forecast APIs; no API key is
required. Each request performs a geocoding lookup and a weather lookup. Each
upstream request has a 5-second timeout. Open-Meteo's automatic timezone
selection uses the resolved city coordinates. `time` is the server's current
clock time in that timezone, formatted to the minute as a local ISO 8601
timestamp (without a UTC offset). The temperature is the provider's current
weather value and may reflect an earlier observation or model interval.
The response identifies the resolved
city and country (or `null` if the provider omits the country). Open-Meteo
chooses the first matching city, so ambiguous names may resolve to a different
location than intended. The configured city name is sent to Open-Meteo.

The endpoint returns HTTP 404 if the city cannot be found, HTTP 502 if the
provider fails or returns invalid data, and HTTP 503 if the city is not
configured. Error responses are JSON objects with an `error` message. Responses
are marked `Cache-Control: no-store`; there is no server-side weather cache.
