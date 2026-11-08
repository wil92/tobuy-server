var assert = require('node:assert/strict');
var http = require('node:http');
var test = require('node:test');

var app = require('../app');
var createTemperatureService = require('../services/temperature');

function response(data, status) {
  return {
    ok: !status || status === 200,
    status: status || 200,
    json: async function() { return data; }
  };
}

async function requestTemperature(t, city, fetchWeather, serverApp, now) {
  var server = http.createServer(serverApp || app.createApp(undefined, createTemperatureService(city, fetchWeather, now)));
  await new Promise(function(resolve, reject) {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(function() {
    return new Promise(function(resolve) { server.close(resolve); });
  });
  return new Promise(function(resolve, reject) {
    http.get('http://127.0.0.1:' + server.address().port + '/temperature', function(res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
      });
    }).on('error', reject);
  });
}

var location = { name: 'São Paulo', country: 'Brazil', latitude: -23.55, longitude: -46.63 };
var weather = {
  timezone: 'America/Sao_Paulo',
  current: { time: '2026-11-08T12:00', temperature_2m: 0 },
  current_units: { temperature_2m: '°C' }
};

test('temperature resolves the configured city and returns current Celsius', async function(t) {
  var urls = [];
  var result = await requestTemperature(t, '  São Paulo  ', async function(url, options) {
    assert.ok(options.signal instanceof AbortSignal);
    urls.push(url);
    return response(urls.length === 1 ? { results: [location] } : weather);
  }, undefined, function() { return new Date('2026-11-09T01:57:30Z'); });
  assert.equal(result.status, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.deepEqual(result.body, {
    city: 'São Paulo',
    country: 'Brazil',
    time: '2026-11-08T22:57',
    temperature: 0,
    unit: '°C'
  });
  assert.equal(urls[0].origin, 'https://geocoding-api.open-meteo.com');
  assert.equal(urls[0].searchParams.get('name'), 'São Paulo');
  assert.equal(urls[0].searchParams.get('count'), '1');
  assert.equal(urls[1].origin, 'https://api.open-meteo.com');
  assert.equal(urls[1].searchParams.get('latitude'), '-23.55');
  assert.equal(urls[1].searchParams.get('longitude'), '-46.63');
  assert.equal(urls[1].searchParams.get('current'), 'temperature_2m');
  assert.equal(urls[1].searchParams.get('temperature_unit'), 'celsius');
  assert.equal(urls[1].searchParams.get('timezone'), 'auto');
});

test('temperature handles missing configuration and unknown cities', async function(t) {
  var missing = await requestTemperature(t, '   ', async function() {
    assert.fail('A blank city must not call the provider');
  });
  assert.equal(missing.status, 503);
  assert.deepEqual(missing.body, { error: 'WEATHER_CITY is not configured' });

  var unknown = await requestTemperature(t, 'Unknown city', async function() {
    return response({});
  });
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, { error: 'Configured city was not found' });
});

test('temperature reports upstream failures and invalid responses', async function(t) {
  var cases = [
    [response(null, 429)],
    [new Error('network failure')],
    [response({ results: 'invalid' })],
    [response({ results: [{ name: 'City', latitude: 91, longitude: 0 }] })],
    [response({ results: [location] }), response(null, 500)],
    [response({ results: [location] }), response({ current: { temperature_2m: null } })],
    [response({ results: [location] }), response({
      timezone: 'UTC',
      current: { time: '', temperature_2m: 20 }, current_units: { temperature_2m: '°C' }
    })],
    [response({ results: [location] }), response({
      timezone: 'UTC',
      current: { time: '2026-11-08T12:00', temperature_2m: 20 },
      current_units: { temperature_2m: '°F' }
    })],
    [response({ results: [location] }), response({
      current: { time: '2026-11-08T12:00', temperature_2m: 20 },
      current_units: { temperature_2m: '°C' }
    })],
    [response({ results: [location] }), response({
      timezone: 'Invalid/Timezone',
      current: { time: '2026-11-08T12:00', temperature_2m: 20 },
      current_units: { temperature_2m: '°C' }
    })]
  ];
  for (var entry of cases) {
    var pending = entry.slice();
    var result = await requestTemperature(t, 'City', async function() {
      var next = pending.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    });
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { error: 'Temperature service unavailable' });
  }
});

test('temperature handles missing country metadata', async function(t) {
  var calls = 0;
  var result = await requestTemperature(t, 'City', async function() {
    calls += 1;
    return response(calls === 1
      ? { results: [{ name: 'City', latitude: 0, longitude: 0 }] }
      : weather);
  }, undefined, function() { return new Date('2026-11-09T01:57:30Z'); });
  assert.equal(result.status, 200);
  assert.equal(result.body.country, null);
  assert.equal(result.body.time, '2026-11-08T22:57');
});

test('temperature uses the city timezone at the current instant', async function(t) {
  var cases = [
    ['Europe/London', '2026-03-29T00:59:30Z', '2026-03-29T00:59'],
    ['Europe/London', '2026-03-29T01:00:30Z', '2026-03-29T02:00'],
    ['Asia/Kathmandu', '2026-11-08T18:30:30Z', '2026-11-09T00:15']
  ];
  for (var entry of cases) {
    var calls = 0;
    var result = await requestTemperature(t, 'City', async function() {
      calls += 1;
      return response(calls === 1 ? { results: [location] } : {
        timezone: entry[0],
        current: weather.current,
        current_units: weather.current_units
      });
    }, undefined, function() { return new Date(entry[1]); });
    assert.equal(result.status, 200);
    assert.equal(result.body.time, entry[2]);
  }
});

test('application configures the endpoint from WEATHER_CITY', async function(t) {
  var previousCity = process.env.WEATHER_CITY;
  var previousFetch = global.fetch;
  var calls = 0;
  var configuredApp;
  try {
    process.env.WEATHER_CITY = 'Configured city';
    global.fetch = async function(url) {
      calls += 1;
      if (calls === 1) {
        assert.equal(url.searchParams.get('name'), 'Configured city');
      }
      return response(calls === 1 ? { results: [location] } : {
        timezone: 'UTC',
        current: weather.current,
        current_units: weather.current_units
      });
    };
    configuredApp = app.createApp();
  } finally {
    if (previousCity === undefined) {
      delete process.env.WEATHER_CITY;
    } else {
      process.env.WEATHER_CITY = previousCity;
    }
    global.fetch = previousFetch;
  }
  var before = new Date().toISOString().slice(0, 16);
  var result = await requestTemperature(t, undefined, undefined, configuredApp);
  var after = new Date().toISOString().slice(0, 16);
  assert.equal(result.status, 200);
  assert.equal(result.body.city, 'São Paulo');
  assert.ok(result.body.time >= before && result.body.time <= after);
  assert.equal(calls, 2);
});
