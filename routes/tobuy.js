var express = require('express');

function createRouter(store) {
  var router = express.Router();

  router.get('/', function(req, res) {
    res.status(200).type('application/json').send(store.serialize());
  });

  router.delete('/missing/:id', function(req, res) {
    if (Buffer.byteLength(req.params.id, 'utf8') > 32) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }
    var sync = req.app.locals.keepSync;
    if (!sync) {
      return res.status(503).json({ error: 'Google Keep sync is unavailable' });
    }
    sync.completeMissing(req.params.id).then(function(result) {
      if (result.status === 'completed') {
        res.status(200).json(result.snapshot);
      } else if (result.status === 'not_found') {
        res.status(404).json({ error: 'Missing item not found' });
      } else if (result.status === 'conflict') {
        res.status(409).json({ error: 'Item update was not confirmed; refresh the list' });
      } else {
        res.status(503).json({ error: 'Google Keep sync is unavailable' });
      }
    }).catch(function(error) {
      console.error('Google Keep missing-item update failed:', error.message);
      res.status(502).json({ error: 'Google Keep update failed' });
    });
  });

  return router;
}

module.exports = createRouter;
