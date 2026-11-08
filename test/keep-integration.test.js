var assert = require('node:assert/strict');
var http = require('node:http');
var test = require('node:test');
var WebSocket = require('ws');
var markdown = require('../services/keep-markdown');
var createStore = require('../services/tobuy-store');
var createKeepSync = require('../services/keep-sync');
var attachWebSocketServer = require('../services/tobuy-websocket');

var note = '# Shopping\r\n## Periodic\r\n- [ ] Milk\r\n* [X] Coffee\r\n\r\n## Missing\r\n- Bread\r\n';

function fakeClient(initial) {
  var current = initial;
  var fail = false;
  return {
    read: async function() {
      if (fail) { throw new Error('offline'); }
      return { text: current };
    },
    write: async function(expected, text) {
      if (fail) { throw new Error('offline'); }
      if (current !== expected) { return { text: current, conflict: true }; }
      current = text;
      return { text: current, conflict: false };
    },
    change: function(text) { current = text; },
    text: function() { return current; },
    offline: function(value) { fail = value; }
  };
}

test('Markdown parser recovers recognized entries, preserves content and stable IDs', function() {
  var parsed = markdown.parse(note);
  assert.deepEqual(parsed.periodic.map(function(item) { return [item.name, item.needed]; }), [
    ['Milk', true], ['Coffee', false]
  ]);
  assert.deepEqual(parsed.missing.map(function(item) { return item.name; }), ['Bread']);
  var updated = markdown.setPeriodic(note, parsed, parsed.periodic[0].id, false);
  assert.equal(updated, note.replace('- [ ] Milk', '- [x] Milk'));
  assert.equal(markdown.parse(updated).periodic[0].id, parsed.periodic[0].id);
  assert.equal(markdown.parse(updated).periodic[0].needed, false);
  assert.equal(markdown.setPeriodic(note, parsed, 'unknown', false), note);
});

test('malformed lines and ambiguous duplicates are excluded without damaging valid entries', function() {
  var text = [
    'No section',
    '- [ ] ignored',
    '## Periodic',
    '- [ ] Milk',
    '- [x] Milk',
    '- [!] invalid',
    '- [ ] ' + 'é'.repeat(33),
    '- [ ] Tea',
    '## Other',
    '- [ ] ignored',
    '## Missing',
    '- Bread',
    '- Bread',
    '- Apples',
    '- [x] ignored'
  ].join('\n');
  var parsed = markdown.parse(text);
  assert.deepEqual(parsed.periodic.map(function(item) { return item.name; }), ['Tea']);
  assert.deepEqual(parsed.missing.map(function(item) { return item.name; }), ['Apples']);
  assert.equal(markdown.parse('not a list').periodic.length, 0);
});

test('parser enforces item count and serialized UTF-8 message limit', function() {
  var many = '## Periodic\n' + Array.from({ length: 70 }, function(_, index) {
    return '- [ ] ' + String(index).padStart(2, '0') + 'é'.repeat(30);
  }).join('\n');
  var parsed = markdown.parse(many);
  var store = createStore({ periodic: parsed.periodic, missing: parsed.missing });
  assert.ok(parsed.periodic.length < 64);
  assert.ok(Buffer.byteLength(store.serialize(), 'utf8') <= 8192);
  assert.equal(markdown.parse('## Missing\n' + Array.from({ length: 70 }, function(_, index) {
    return '- ' + index;
  }).join('\n')).missing.length, 64);
});

test('sync writes only the selected marker and publishes after remote confirmation', async function() {
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
  assert.equal(client.text(), note.replace('- [ ] Milk', '- [x] Milk'));
  assert.equal((await sync.setPeriodic(id, false)).changed, false);
  assert.equal((await sync.setPeriodic('unknown', true)).changed, false);
});

test('sync preserves the last snapshot on failure and refuses stale writes', async function() {
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
  var edited = note.replace('Bread', 'Apples');
  client.change(edited);
  await sync.setPeriodic(initial.periodic[0].id, false);
  assert.equal(client.text(), edited);
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
  assert.equal(client.text(), note.replace('- [ ] Milk', '- [x] Milk').replace('* [X] Coffee', '* [ ] Coffee'));
  assert.deepEqual(store.getSnapshot().periodic.map(function(item) { return item.needed; }), [false, true]);
});

test('WebSocket does not confirm a change until the remote write succeeds', async function(t) {
  var store = createStore();
  var text = note;
  var resolveWrite;
  var failWrite = false;
  var client = {
    read: async function() { return { text: text }; },
    write: function(expected, next) {
      if (failWrite) {
        return Promise.reject(new Error('offline'));
      }
      return new Promise(function(resolve) {
        resolveWrite = function() { text = next; resolve({ text: text, conflict: false }); };
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
