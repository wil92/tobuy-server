var assert = require('node:assert/strict');
var http = require('node:http');
var test = require('node:test');
var WebSocket = require('ws');
var checklist = require('../services/keep-checklist');
var createStore = require('../services/tobuy-store');
var createKeepSync = require('../services/keep-sync');
var attachWebSocketServer = require('../services/tobuy-websocket');

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
