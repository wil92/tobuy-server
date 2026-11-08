var express = require('express');

var healthRouter = require('./routes/health');
var createTobuyRouter = require('./routes/tobuy');
var createTobuyStore = require('./services/tobuy-store');

function createApp(store) {
  var app = express();
  var tobuyStore = store || createTobuyStore();

  app.locals.tobuyStore = tobuyStore;
  app.use('/health', healthRouter);
  app.use('/tobuy', createTobuyRouter(tobuyStore));

  return app;
}

var app = createApp();
app.createApp = createApp;

module.exports = app;
