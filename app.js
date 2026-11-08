var express = require('express');

var healthRouter = require('./routes/health');
var createTobuyRouter = require('./routes/tobuy');
var createTemperatureRouter = require('./routes/temperature');
var createTobuyStore = require('./services/tobuy-store');
var createTemperatureService = require('./services/temperature');

function createApp(store, temperatureService) {
  var app = express();
  var tobuyStore = store || createTobuyStore();

  app.locals.tobuyStore = tobuyStore;
  app.use('/health', healthRouter);
  app.use('/tobuy', createTobuyRouter(tobuyStore));
  app.use('/temperature', createTemperatureRouter(temperatureService || createTemperatureService(process.env.WEATHER_CITY)));

  return app;
}

var app = createApp();
app.createApp = createApp;

module.exports = app;
