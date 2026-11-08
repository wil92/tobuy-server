var EventEmitter = require('events');

var MAX_ITEMS = 64;
var MAX_ID_BYTES = 32;
var MAX_NAME_BYTES = 64;
var MAX_MESSAGE_BYTES = 8192;
var MAX_REVISION = 0xffffffff;

function assertText(value, field, maxBytes) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new TypeError(field + ' must be a non-empty string of at most ' + maxBytes + ' UTF-8 bytes');
  }
}

function normalizeLists(lists, revision) {
  if (!lists || !Array.isArray(lists.periodic) || !Array.isArray(lists.missing)) {
    throw new TypeError('periodic and missing must be arrays');
  }
  if (lists.periodic.length + lists.missing.length > MAX_ITEMS) {
    throw new RangeError('a list may contain at most ' + MAX_ITEMS + ' items');
  }

  var ids = Object.create(null);
  var periodic = lists.periodic.map(function(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('periodic items must be objects');
    }
    assertText(item.id, 'id', MAX_ID_BYTES);
    assertText(item.name, 'name', MAX_NAME_BYTES);
    if (typeof item.needed !== 'boolean') {
      throw new TypeError('periodic item needed must be a boolean');
    }
    if (ids[item.id]) {
      throw new TypeError('item ids must be unique');
    }
    ids[item.id] = true;
    return { id: item.id, name: item.name, needed: item.needed };
  });
  var missing = lists.missing.map(function(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('missing items must be objects');
    }
    assertText(item.id, 'id', MAX_ID_BYTES);
    assertText(item.name, 'name', MAX_NAME_BYTES);
    if (ids[item.id]) {
      throw new TypeError('item ids must be unique');
    }
    ids[item.id] = true;
    return { id: item.id, name: item.name };
  });

  var snapshot = {
    type: 'list',
    revision: revision,
    periodic: periodic,
    missing: missing
  };
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_MESSAGE_BYTES) {
    throw new RangeError('list message exceeds ' + MAX_MESSAGE_BYTES + ' UTF-8 bytes');
  }
  return snapshot;
}

function createStore(initialLists) {
  var changes = new EventEmitter();
  var snapshot = normalizeLists(initialLists || { periodic: [], missing: [] }, 0);

  function getSnapshot() {
    return {
      type: snapshot.type,
      revision: snapshot.revision,
      periodic: snapshot.periodic.map(function(item) {
        return { id: item.id, name: item.name, needed: item.needed };
      }),
      missing: snapshot.missing.map(function(item) {
        return { id: item.id, name: item.name };
      })
    };
  }

  function replaceLists(lists) {
    var normalized = normalizeLists(lists, snapshot.revision);
    var previousLists = JSON.stringify({
      periodic: snapshot.periodic,
      missing: snapshot.missing
    });
    var nextLists = JSON.stringify({
      periodic: normalized.periodic,
      missing: normalized.missing
    });
    if (previousLists === nextLists) {
      return false;
    }
    if (snapshot.revision === MAX_REVISION) {
      throw new RangeError('list revision has reached the maximum unsigned 32-bit value');
    }

    snapshot = normalizeLists(lists, snapshot.revision + 1);
    changes.emit('change', getSnapshot());
    return true;
  }

  function setPeriodic(id, needed) {
    if (typeof id !== 'string' || typeof needed !== 'boolean') {
      throw new TypeError('id must be a string and needed must be a boolean');
    }
    var item = snapshot.periodic.find(function(candidate) {
      return candidate.id === id;
    });
    if (!item || item.needed === needed) {
      return { changed: false, snapshot: getSnapshot() };
    }
    if (snapshot.revision === MAX_REVISION) {
      return { changed: false, snapshot: getSnapshot() };
    }

    var periodic = snapshot.periodic.map(function(candidate) {
      return {
        id: candidate.id,
        name: candidate.name,
        needed: candidate.id === id ? needed : candidate.needed
      };
    });
    replaceLists({ periodic: periodic, missing: snapshot.missing });
    return { changed: true, snapshot: getSnapshot() };
  }

  return {
    getSnapshot: getSnapshot,
    serialize: function() {
      return JSON.stringify(snapshot);
    },
    replaceLists: replaceLists,
    setPeriodic: setPeriodic,
    on: changes.on.bind(changes),
    removeListener: changes.removeListener.bind(changes)
  };
}

module.exports = createStore;
