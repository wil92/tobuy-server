var checklist = require('./keep-checklist');

function createKeepSync(store, client) {
  var items;
  var parsed;
  var queue = Promise.resolve();

  function enqueue(action) {
    var result = queue.then(action);
    queue = result.catch(function() {});
    return result;
  }

  function publish(nextItems) {
    var next = checklist.parse(nextItems);
    var changed = store.replaceLists({ periodic: next.periodic, missing: next.missing });
    if (JSON.stringify(nextItems) !== JSON.stringify(items) && next.skipped > 0) {
      console.error('Google Keep note: skipped ' + next.skipped + ' invalid, ambiguous, or oversized list entries');
    }
    items = nextItems;
    parsed = next;
    return { changed: changed, snapshot: store.getSnapshot() };
  }

  function refresh() {
    return enqueue(function() {
      return client.read().then(function(response) {
        return publish(response.items);
      });
    });
  }

  function setPeriodic(id, needed) {
    return enqueue(function() {
      var item = parsed && parsed.periodic.find(function(candidate) { return candidate.id === id; });
      if (!item || item.needed === needed || store.getSnapshot().revision === 4294967295) {
        return client.read().then(function(response) {
          return publish(response.items);
        });
      }
      return client.write(items, parsed.targets[id], !needed).then(function(response) {
        var target = response.items.find(function(candidate) {
          return candidate.id === parsed.targets[id];
        });
        if (response.conflict || !target || target.checked !== !needed ||
            typeof target.text !== 'string' || !target.text.startsWith('[PERIODIC]')) {
          console.error('Google Keep note changed during an Arduino update; refreshed without confirming the request');
        }
        return publish(response.items);
      });
    });
  }

  return { refresh: refresh, setPeriodic: setPeriodic };
}

module.exports = createKeepSync;
