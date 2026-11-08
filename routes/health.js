var express = require('express');

var router = express.Router();

router.get('/', function(req, res) {
  var sync = req.app.locals.keepSync;
  var keep = sync && sync.getHealth();
  if (keep && !keep.ok) {
    return res.status(503).json({ status: 'error', error: 'Google Keep integration is not working' });
  }
  res.status(200).json({ status: 'ok' });
});

module.exports = router;
