var express = require('express');

function createTemperatureRouter(getTemperature) {
  var router = express.Router();

  router.get('/', function(req, res) {
    res.set('Cache-Control', 'no-store');
    getTemperature().then(function(temperature) {
      res.json(temperature);
    }).catch(function(error) {
      if (error.code === 'CITY_NOT_CONFIGURED') {
        res.status(503).json({ error: 'WEATHER_CITY is not configured' });
      } else if (error.code === 'CITY_NOT_FOUND') {
        res.status(404).json({ error: 'Configured city was not found' });
      } else {
        console.error('Temperature lookup failed:', error.message);
        res.status(502).json({ error: 'Temperature service unavailable' });
      }
    });
  });

  return router;
}

module.exports = createTemperatureRouter;
