var crypto = require('crypto');

function parse(items) {
  var result = { periodic: [], missing: [], targets: Object.create(null), skipped: 0 };
  var counts = Object.create(null);

  items.forEach(function(item) {
    if (item && typeof item.id === 'string') {
      counts[item.id] = (counts[item.id] || 0) + 1;
    }
  });
  items.forEach(function(item) {
    if (!item || typeof item.id !== 'string' || !item.id ||
        typeof item.text !== 'string' || typeof item.checked !== 'boolean' || counts[item.id] !== 1) {
      result.skipped++;
      return;
    }
    var periodic = item.text.startsWith('[PERIODIC]');
    if (!periodic && item.checked) {
      return;
    }
    var name = (periodic ? item.text.slice('[PERIODIC]'.length) : item.text).trim();
    if (!name || Buffer.byteLength(name, 'utf8') > 64 ||
        result.periodic.length + result.missing.length >= 64) {
      result.skipped++;
      return;
    }
    var id = crypto.createHash('sha256').update(item.id).digest('hex').slice(0, 32);
    if (result.targets[id]) {
      result.skipped++;
      return;
    }
    var listItem = { id: id, name: name };
    if (periodic) {
      listItem.needed = !item.checked;
    }
    var target = periodic ? result.periodic : result.missing;
    target.push(listItem);
    var snapshot = { type: 'list', revision: 4294967295, periodic: result.periodic, missing: result.missing };
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 8192) {
      target.pop();
      result.skipped++;
      return;
    }
    result.targets[id] = item.id;
  });
  return result;
}

module.exports = { parse: parse };
