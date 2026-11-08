function temperatureError(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function createTemperatureService(city, fetchWeather, now) {
  var configuredCity = typeof city === 'string' ? city.trim() : '';
  var request = fetchWeather || fetch;
  var currentTime = now || function() { return new Date(); };

  async function getJson(url) {
    var response = await request(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error('Weather provider returned HTTP ' + response.status);
    }
    return response.json();
  }

  return async function() {
    if (!configuredCity) {
      throw temperatureError('CITY_NOT_CONFIGURED', 'WEATHER_CITY is not configured');
    }

    var geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocodingUrl.searchParams.set('name', configuredCity);
    geocodingUrl.searchParams.set('count', '1');
    var geocoding = await getJson(geocodingUrl);
    if (!geocoding || typeof geocoding !== 'object' ||
        (geocoding.results !== undefined && !Array.isArray(geocoding.results))) {
      throw new Error('Invalid geocoding response');
    }
    if (!geocoding.results || geocoding.results.length === 0) {
      throw temperatureError('CITY_NOT_FOUND', 'Configured city was not found');
    }
    var location = geocoding.results[0];
    if (!location || typeof location.name !== 'string' || !location.name ||
        !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 ||
        !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
      throw new Error('Invalid geocoding location');
    }

    var weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
    weatherUrl.searchParams.set('latitude', String(location.latitude));
    weatherUrl.searchParams.set('longitude', String(location.longitude));
    weatherUrl.searchParams.set('current', 'temperature_2m');
    weatherUrl.searchParams.set('temperature_unit', 'celsius');
    weatherUrl.searchParams.set('timezone', 'auto');
    var weather = await getJson(weatherUrl);
    if (!weather || typeof weather.timezone !== 'string' || !weather.timezone ||
        !weather.current || typeof weather.current.time !== 'string' ||
        !weather.current.time || !Number.isFinite(weather.current.temperature_2m) ||
        !weather.current_units || weather.current_units.temperature_2m !== '°C') {
      throw new Error('Invalid weather response');
    }

    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: weather.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(currentTime());
    var dateParts = {};
    parts.forEach(function(part) {
      dateParts[part.type] = part.value;
    });

    return {
      city: location.name,
      country: typeof location.country === 'string' ? location.country : null,
      time: dateParts.year + '-' + dateParts.month + '-' + dateParts.day + 'T' +
        dateParts.hour + ':' + dateParts.minute,
      temperature: weather.current.temperature_2m,
      unit: '°C'
    };
  };
}

module.exports = createTemperatureService;
