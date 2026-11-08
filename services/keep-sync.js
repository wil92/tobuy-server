var markdown = require('./keep-markdown');

function createKeepSync(store, client) {
  var text;
  var parsed;
  var queue = Promise.resolve();

  function enqueue(action) {
    var result = queue.then(action);
    queue = result.catch(function() {});
    return result;
  }

  function publish(nextText) {
    var next = markdown.parse(nextText);
    var changed = store.replaceLists({ periodic: next.periodic, missing: next.missing });
    if (nextText !== text && next.skipped > 0) {
      console.error('Google Keep note: skipped ' + next.skipped + ' invalid, ambiguous, or oversized list entries');
    }
    text = nextText;
    parsed = next;
    return { changed: changed, snapshot: store.getSnapshot() };
  }

  function refresh() {
    return enqueue(function() {
      return client.read().then(function(response) {
        return publish(response.text);
      });
    });
  }

  function setPeriodic(id, needed) {
    return enqueue(function() {
      var item = parsed && parsed.periodic.find(function(candidate) { return candidate.id === id; });
      if (!item || item.needed === needed || store.getSnapshot().revision === 4294967295) {
        return client.read().then(function(response) {
          return publish(response.text);
        });
      }
      var updated = markdown.setPeriodic(text, parsed, id, needed);
      return client.write(text, updated).then(function(response) {
        if (response.conflict || response.text !== updated) {
          console.error('Google Keep note changed during an Arduino update; refreshed without confirming the request');
        }
        return publish(response.text);
      });
    });
  }

  return { refresh: refresh, setPeriodic: setPeriodic };
}

module.exports = createKeepSync;
