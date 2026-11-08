var checklist = require('./keep-checklist');

function createKeepSync(store, client) {
  var items;
  var parsed;
  var queue = Promise.resolve();
  var health = { ok: true, error: null };

  function track(promise) {
    return promise.then(function(response) {
      health = { ok: true, error: null };
      return response;
    }, function(error) {
      health = { ok: false, error: error.message };
      throw error;
    });
  }

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
      return track(client.read()).then(function(response) {
        return publish(response.items);
      });
    });
  }

  function setPeriodic(id, needed) {
    return enqueue(function() {
      var item = parsed && parsed.periodic.find(function(candidate) { return candidate.id === id; });
      if (!item || item.needed === needed || store.getSnapshot().revision === 4294967295) {
        return track(client.read()).then(function(response) {
          return publish(response.items);
        });
      }
      return track(client.write(items, parsed.targets[id], !needed)).then(function(response) {
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

  function completeMissing(id) {
    return enqueue(function() {
      if (!parsed || store.getSnapshot().revision === 4294967295) {
        return { status: 'unavailable' };
      }
      var item = parsed.missing.find(function(candidate) { return candidate.id === id; });
      if (!item) {
        return { status: 'not_found' };
      }
      var targetId = parsed.targets[id];
      return track(client.completeMissing(items, targetId)).then(function(response) {
        var target = response.items.find(function(candidate) {
          return candidate.id === targetId;
        });
        var confirmed = response.conflict === false && target && target.checked === true &&
          typeof target.text === 'string' && !target.text.startsWith('[PERIODIC]');
        var result = publish(response.items);
        if (!confirmed) {
          console.error('Google Keep note changed during a missing-item update; refreshed without confirming the request');
        }
        return { status: confirmed ? 'completed' : 'conflict', snapshot: result.snapshot };
      });
    });
  }

  function getHealth() {
    return { ok: health.ok, error: health.error };
  }

  return { getHealth: getHealth, refresh: refresh, setPeriodic: setPeriodic, completeMissing: completeMissing };
}

module.exports = createKeepSync;
