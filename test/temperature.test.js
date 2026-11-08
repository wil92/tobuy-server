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

async function requestTemperature(t, city, fetchWeather, serverApp) {
  var server = http.createServer(serverApp || app.createApp(undefined, createTemperatureService(city, fetchWeather)));
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
var weather = { current: { temperature_2m: 0 }, current_units: { temperature_2m: '°C' } };

test('temperature resolves the configured city and returns current Celsius', async function(t) {
  var urls = [];
  var result = await requestTemperature(t, '  São Paulo  ', async function(url, options) {
    assert.ok(options.signal instanceof AbortSignal);
    urls.push(url);
    return response(urls.length === 1 ? { results: [location] } : weather);
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.deepEqual(result.body, { city: 'São Paulo', country: 'Brazil', temperature: 0, unit: '°C' });
  assert.equal(urls[0].origin, 'https://geocoding-api.open-meteo.com');
  assert.equal(urls[0].searchParams.get('name'), 'São Paulo');
  assert.equal(urls[0].searchParams.get('count'), '1');
  assert.equal(urls[1].origin, 'https://api.open-meteo.com');
  assert.equal(urls[1].searchParams.get('latitude'), '-23.55');
  assert.equal(urls[1].searchParams.get('longitude'), '-46.63');
  assert.equal(urls[1].searchParams.get('current'), 'temperature_2m');
  assert.equal(urls[1].searchParams.get('temperature_unit'), 'celsius');
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
      current: { temperature_2m: 20 }, current_units: { temperature_2m: '°F' }
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
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.country, null);
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
      return response(calls === 1 ? { results: [location] } : weather);
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
  var result = await requestTemperature(t, undefined, undefined, configuredApp);
  assert.equal(result.status, 200);
  assert.equal(result.body.city, 'São Paulo');
  assert.equal(calls, 2);
});
