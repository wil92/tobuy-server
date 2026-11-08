var express = require('express');

function createRouter(store) {
  var router = express.Router();

  router.get('/', function(req, res) {
    res.status(200).type('application/json').send(store.serialize());
  });

  return router;
}

module.exports = createRouter;
