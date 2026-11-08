var assert = require('node:assert/strict');
var http = require('node:http');
var test = require('node:test');
var WebSocket = require('ws');
var checklist = require('../services/keep-checklist');
var createStore = require('../services/tobuy-store');
var createKeepSync = require('../services/keep-sync');
var attachWebSocketServer = require('../services/tobuy-websocket');
var app = require('../app');

var note = [
  { id: '1', text: '[PERIODIC] Milk', checked: false },
  { id: '2', text: '[PERIODIC] Coffee', checked: true },
  { id: '3', text: 'Bread', checked: false },
  { id: '4', text: 'Bought', checked: true }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fakeClient(initial) {
  var current = clone(initial);
  var fail = false;
  return {
    read: async function() {
      if (fail) { throw new Error('offline'); }
      return { items: clone(current) };
    },
    write: async function(expected, id, checked) {
      if (fail) { throw new Error('offline'); }
      if (JSON.stringify(current) !== JSON.stringify(expected)) {
        return { items: clone(current), conflict: true };
      }
      current.find(function(item) { return item.id === id; }).checked = checked;
      return { items: clone(current), conflict: false };
    },
    completeMissing: async function(expected, id) {
      return this.write(expected, id, true);
    },
    change: function(items) { current = clone(items); },
    items: function() { return clone(current); },
    offline: function(value) { fail = value; }
  };
}

test('checklist maps periodic and unchecked missing items with stable item IDs', function() {
  var parsed = checklist.parse(note);
  assert.deepEqual(parsed.periodic.map(function(item) { return [item.name, item.needed]; }), [
    ['Milk', true], ['Coffee', false]
  ]);
  assert.deepEqual(parsed.missing.map(function(item) { return item.name; }), ['Bread']);
  var changed = clone(note);
  changed[0].checked = true;
  changed[0].text = '[PERIODIC] Renamed';
  changed.reverse();
  assert.equal(checklist.parse(changed).periodic[1].id, parsed.periodic[0].id);
  assert.equal(checklist.parse(changed).periodic[1].needed, false);
});

test('checklist skips invalid entries but allows duplicate names with distinct IDs', function() {
  var items = [
    { id: 'a', text: '[PERIODIC] Milk', checked: false },
    { id: 'b', text: '[PERIODIC] Milk', checked: true },
    { id: 'c', text: '[PERIODIC] ', checked: false },
    { id: 'd', text: 'é'.repeat(33), checked: false },
    { id: 'e', text: 'Apples', checked: false },
    { id: 'dup', text: 'Duplicate ID', checked: false },
    { id: 'dup', text: 'Duplicate ID 2', checked: false },
    { id: 'f', text: 'bad state', checked: 'false' }
  ];
  var parsed = checklist.parse(items);
  assert.equal(parsed.periodic.length, 2);
  assert.notEqual(parsed.periodic[0].id, parsed.periodic[1].id);
  assert.deepEqual(parsed.missing.map(function(item) { return item.name; }), ['Apples']);
  assert.equal(parsed.skipped, 5);
  assert.equal(checklist.parse([]).periodic.length, 0);
});

test('checklist enforces item count and serialized UTF-8 message limit', function() {
  var many = Array.from({ length: 70 }, function(_, index) {
    return { id: String(index), text: '[PERIODIC] ' + String(index).padStart(2, '0') + 'é'.repeat(30), checked: false };
  });
  var parsed = checklist.parse(many);
  var store = createStore({ periodic: parsed.periodic, missing: parsed.missing });
  assert.ok(parsed.periodic.length < 64);
  assert.ok(Buffer.byteLength(store.serialize(), 'utf8') <= 8192);
  assert.equal(checklist.parse(many.map(function(item, index) {
    return { id: item.id, text: String(index), checked: false };
  })).missing.length, 64);
});

test('sync writes only the selected periodic item after remote confirmation', async function() {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  await sync.refresh();
  var original = store.getSnapshot();
  var id = original.periodic[0].id;
  var result = await sync.setPeriodic(id, false);
  assert.equal(result.changed, true);
  assert.equal(result.snapshot.revision, original.revision + 1);
  assert.equal(result.snapshot.periodic[0].needed, false);
  var expected = clone(note);
  expected[0].checked = true;
  assert.deepEqual(client.items(), expected);
  assert.equal((await sync.setPeriodic(id, false)).changed, false);
  assert.equal((await sync.setPeriodic('unknown', true)).changed, false);
});

test('sync retains the last snapshot on errors and refuses stale writes', async function() {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  await sync.refresh();
  var initial = store.getSnapshot();
  client.offline(true);
  await assert.rejects(sync.setPeriodic(initial.periodic[0].id, false), /offline/);
  await assert.rejects(sync.refresh(), /offline/);
  assert.deepEqual(store.getSnapshot(), initial);
  client.offline(false);
  var edited = clone(note);
  edited[2].text = 'Apples';
  client.change(edited);
  await sync.setPeriodic(initial.periodic[0].id, false);
  assert.deepEqual(client.items(), edited);
  assert.equal(store.getSnapshot().periodic[0].needed, true);
  assert.equal(store.getSnapshot().missing[0].name, 'Apples');
});

test('sync serializes concurrent changes without overwriting each other', async function() {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  await sync.refresh();
  var items = store.getSnapshot().periodic;
  await Promise.all([sync.setPeriodic(items[0].id, false), sync.setPeriodic(items[1].id, true)]);
  var expected = clone(note);
  expected[0].checked = true;
  expected[1].checked = false;
  assert.deepEqual(client.items(), expected);
  assert.deepEqual(store.getSnapshot().periodic.map(function(item) { return item.needed; }), [false, true]);
});

test('missing completion serializes with periodic updates and preserves the note', async function() {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  assert.equal((await sync.completeMissing('unknown')).status, 'unavailable');
  await sync.refresh();
  var snapshot = store.getSnapshot();
  var result = await Promise.all([
    sync.completeMissing(snapshot.missing[0].id),
    sync.setPeriodic(snapshot.periodic[0].id, false)
  ]);
  assert.equal(result[0].status, 'completed');
  assert.deepEqual(result[0].snapshot.missing, []);
  assert.equal(result[0].snapshot.revision, snapshot.revision + 1);
  var expected = clone(note);
  expected[0].checked = true;
  expected[2].checked = true;
  assert.deepEqual(client.items(), expected);
  assert.equal((await sync.completeMissing(snapshot.missing[0].id)).status, 'not_found');
  assert.equal((await sync.completeMissing(snapshot.periodic[0].id)).status, 'not_found');
});

test('duplicate missing-item completions do not issue a second write', async function() {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  await sync.refresh();
  var id = store.getSnapshot().missing[0].id;
  var results = await Promise.all([sync.completeMissing(id), sync.completeMissing(id)]);
  assert.deepEqual(results.map(function(result) { return result.status; }), ['completed', 'not_found']);
  assert.equal(client.items()[2].checked, true);
  assert.equal(store.getSnapshot().revision, 2);
});

test('missing completion does not write when list revision is exhausted', async function() {
  var client = fakeClient(note);
  var store = {
    replaceLists: function() { return false; },
    getSnapshot: function() { return { revision: 4294967295 }; }
  };
  var sync = createKeepSync(store, client);
  await sync.refresh();
  assert.equal((await sync.completeMissing(checklist.parse(note).missing[0].id)).status, 'unavailable');
  assert.deepEqual(client.items(), note);
});

test('missing completion rejects stale, unconfirmed, and failed writes', async function() {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  await sync.refresh();
  var original = store.getSnapshot();
  var edited = clone(note);
  edited[2].text = 'Apples';
  client.change(edited);
  var conflict = await sync.completeMissing(original.missing[0].id);
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.snapshot.missing[0].name, 'Apples');
  assert.deepEqual(client.items(), edited);
  client.offline(true);
  await assert.rejects(sync.completeMissing(original.missing[0].id), /offline/);
  assert.deepEqual(store.getSnapshot(), conflict.snapshot);
  client.offline(false);
  client.completeMissing = async function() {
    return { items: client.items(), conflict: false };
  };
  assert.equal((await sync.completeMissing(original.missing[0].id)).status, 'conflict');
  assert.equal(store.getSnapshot().missing.length, 1);
});

function deleteItem(port, id) {
  return new Promise(function(resolve, reject) {
    var request = http.request({
      hostname: '127.0.0.1',
      port: port,
      method: 'DELETE',
      path: '/tobuy/missing/' + encodeURIComponent(id)
    }, function(res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: JSON.parse(body) }); });
    });
    request.on('error', reject);
    request.end();
  });
}

test('HTTP missing-item completion broadcasts the confirmed list and rejects invalid requests', async function(t) {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  var application = app.createApp(store);
  application.locals.keepSync = sync;
  var server = http.createServer(application);
  var wss = attachWebSocketServer(server, store, sync.setPeriodic);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var port = server.address().port;
  var socket = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  t.after(function() {
    socket.terminate();
    return new Promise(function(resolve) { wss.close(function() { server.close(resolve); }); });
  });
  await new Promise(function(resolve, reject) {
    socket.once('message', resolve);
    socket.once('error', reject);
  });
  assert.equal((await deleteItem(port, 'abc')).status, 503);
  assert.equal((await deleteItem(port, 'a'.repeat(33))).status, 400);
  var refreshed = new Promise(function(resolve) { socket.once('message', resolve); });
  await sync.refresh();
  await refreshed;
  var snapshot = store.getSnapshot();
  assert.equal((await deleteItem(port, snapshot.periodic[0].id)).status, 404);
  var updated = new Promise(function(resolve) {
    socket.once('message', function(data) { resolve(JSON.parse(data)); });
  });
  var result = await deleteItem(port, snapshot.missing[0].id);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, await updated);
  assert.deepEqual(result.body.missing, []);
  assert.equal(result.body.revision, snapshot.revision + 1);
  assert.equal(client.items()[2].checked, true);
  assert.equal(client.items().length, note.length);
  assert.equal((await deleteItem(port, snapshot.missing[0].id)).status, 404);
});

test('HTTP missing-item completion reports stale and upstream failures', async function(t) {
  var store = createStore();
  var client = fakeClient(note);
  var sync = createKeepSync(store, client);
  var application = app.createApp(store);
  var server = http.createServer(application);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  t.after(function() { return new Promise(function(resolve) { server.close(resolve); }); });
  var port = server.address().port;
  assert.equal((await deleteItem(port, 'unknown')).status, 503);
  application.locals.keepSync = sync;
  await sync.refresh();
  var id = store.getSnapshot().missing[0].id;
  var edited = clone(note);
  edited[2].text = 'Apples';
  client.change(edited);
  assert.equal((await deleteItem(port, id)).status, 409);
  assert.equal(store.getSnapshot().missing[0].name, 'Apples');
  client.offline(true);
  assert.equal((await deleteItem(port, id)).status, 502);
  assert.equal(store.getSnapshot().missing.length, 1);
});

test('WebSocket confirms only successful remote writes', async function(t) {
  var store = createStore();
  var items = clone(note);
  var resolveWrite;
  var failWrite = false;
  var client = {
    read: async function() { return { items: clone(items) }; },
    write: function(expected, id, checked) {
      if (failWrite) { return Promise.reject(new Error('offline')); }
      return new Promise(function(resolve) {
        resolveWrite = function() {
          items.find(function(item) { return item.id === id; }).checked = checked;
          resolve({ items: clone(items), conflict: false });
        };
      });
    }
  };
  var sync = createKeepSync(store, client);
  await sync.refresh();
  var server = http.createServer();
  var wss = attachWebSocketServer(server, store, sync.setPeriodic);
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  var socket = new WebSocket('ws://127.0.0.1:' + server.address().port + '/ws');
  t.after(function() {
    socket.terminate();
    return new Promise(function(resolve) { wss.close(function() { server.close(resolve); }); });
  });
  var initial = await new Promise(function(resolve, reject) {
    socket.once('message', function(data) { resolve(JSON.parse(data)); });
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({ type: 'set_periodic', id: initial.periodic[0].id, needed: false }));
  while (!resolveWrite) {
    await new Promise(function(resolve) { setImmediate(resolve); });
  }
  assert.deepEqual(store.getSnapshot(), initial);
  var confirmation = new Promise(function(resolve) {
    socket.once('message', function(data) { resolve(JSON.parse(data)); });
  });
  resolveWrite();
  var updated = await confirmation;
  assert.equal(updated.periodic[0].needed, false);
  failWrite = true;
  var rejected = new Promise(function(resolve) {
    socket.once('message', function(data) { resolve(JSON.parse(data)); });
  });
  socket.send(JSON.stringify({ type: 'set_periodic', id: initial.periodic[0].id, needed: true }));
  assert.deepEqual(await rejected, updated);
  assert.equal(store.getSnapshot().periodic[0].needed, false);
});

test('sync health fails on Keep errors and recovers after success', async function() {
  var client = fakeClient(note);
  var sync = createKeepSync(createStore(), client);
  assert.equal(sync.getHealth().ok, true);
  client.offline(true);
  await assert.rejects(sync.refresh(), /offline/);
  assert.equal(sync.getHealth().ok, false);
  client.offline(false);
  await sync.refresh();
  assert.deepEqual(sync.getHealth(), { ok: true, error: null });
});
