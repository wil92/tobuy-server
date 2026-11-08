var assert = require('node:assert/strict');
var http = require('node:http');
var test = require('node:test');
var WebSocket = require('ws');

var app = require('../app');
var attachWebSocketServer = require('../services/tobuy-websocket');
var createStore = require('../services/tobuy-store');

function listen(server) {
  return new Promise(function(resolve, reject) {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function() {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function getJson(url) {
  return new Promise(function(resolve, reject) {
    http.get(url, function(response) {
      var body = '';
      response.setEncoding('utf8');
      response.on('data', function(chunk) {
        body += chunk;
      });
      response.on('end', function() {
        resolve({
          statusCode: response.statusCode,
          contentType: response.headers['content-type'],
          body: body,
          json: JSON.parse(body)
        });
      });
    }).on('error', reject);
  });
}

function getStatus(url) {
  return new Promise(function(resolve, reject) {
    http.get(url, function(response) {
      response.resume();
      response.on('end', function() {
        resolve(response.statusCode);
      });
    }).on('error', reject);
  });
}

function connect(url) {
  return new Promise(function(resolve, reject) {
    var socket = new WebSocket(url);
    socket.protocolMessages = [];
    socket.protocolWaiters = [];
    socket.on('message', function(data, isBinary) {
      var message = { json: JSON.parse(data.toString('utf8')), isBinary: isBinary };
      if (socket.protocolWaiters.length > 0) {
        socket.protocolWaiters.shift()(message);
      } else {
        socket.protocolMessages.push(message);
      }
    });
    socket.once('open', function() {
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

function nextMessage(socket) {
  if (socket.protocolMessages.length > 0) {
    return Promise.resolve(socket.protocolMessages.shift());
  }
  return new Promise(function(resolve) {
    socket.protocolWaiters.push(resolve);
  });
}

function closeSocket(socket) {
  return new Promise(function(resolve) {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once('close', resolve);
    socket.close();
  });
}

test('Arduino list protocol serves and broadcasts the same revisioned list', async function(t) {
  var store = createStore();
  var server = http.createServer(app.createApp(store));
  var webSocketServer = attachWebSocketServer(server, store);
  var port = await listen(server);
  var url = 'http://127.0.0.1:' + port;
  var sockets = [];

  t.after(async function() {
    sockets.forEach(function(socket) {
      socket.terminate();
    });
    await new Promise(function(resolve) {
      webSocketServer.close(function() {
        server.close(resolve);
      });
    });
  });

  var initial = {
    type: 'list',
    revision: 0,
    periodic: [],
    missing: []
  };
  var response = await getJson(url + '/tobuy');
  assert.equal(response.statusCode, 200);
  assert.match(response.contentType, /^application\/json; charset=utf-8$/);
  assert.deepEqual(response.json, initial);

  var first = await connect('ws://127.0.0.1:' + port + '/ws');
  sockets.push(first);
  var initialMessage = await nextMessage(first);
  assert.equal(initialMessage.isBinary, false);
  assert.deepEqual(initialMessage.json, initial);

  assert.equal(store.replaceLists({
    periodic: [{ id: 'milk', name: 'Milk', needed: true }],
    missing: [{ id: 'bread', name: 'Bread' }]
  }), true);
  var changedMessage = await nextMessage(first);
  assert.deepEqual(changedMessage.json, {
    type: 'list',
    revision: 1,
    periodic: [{ id: 'milk', name: 'Milk', needed: true }],
    missing: [{ id: 'bread', name: 'Bread' }]
  });
  assert.deepEqual((await getJson(url + '/tobuy')).json, changedMessage.json);

  var second = await connect('ws://127.0.0.1:' + port + '/ws');
  sockets.push(second);
  assert.deepEqual((await nextMessage(second)).json, changedMessage.json);

  var firstUpdate = nextMessage(first);
  var secondUpdate = nextMessage(second);
  first.send(JSON.stringify({ type: 'set_periodic', id: 'milk', needed: false }));
  var updates = await Promise.all([firstUpdate, secondUpdate]);
  assert.deepEqual(updates[0].json, {
    type: 'list',
    revision: 2,
    periodic: [{ id: 'milk', name: 'Milk', needed: false }],
    missing: [{ id: 'bread', name: 'Bread' }]
  });
  assert.deepEqual(updates[1].json, updates[0].json);
  assert.deepEqual((await getJson(url + '/tobuy')).json, updates[0].json);

  var duplicateFirst = nextMessage(first);
  var duplicateSecond = nextMessage(second);
  first.send(JSON.stringify({ type: 'set_periodic', id: 'milk', needed: false }));
  var duplicateUpdates = await Promise.all([duplicateFirst, duplicateSecond]);
  assert.deepEqual(duplicateUpdates[0].json, updates[0].json);
  assert.deepEqual(duplicateUpdates[1].json, updates[0].json);

  var unknownFirst = nextMessage(first);
  var unknownSecond = nextMessage(second);
  first.send(JSON.stringify({ type: 'set_periodic', id: 'unknown', needed: true }));
  var unknownUpdates = await Promise.all([unknownFirst, unknownSecond]);
  assert.deepEqual(unknownUpdates[0].json, updates[0].json);
  assert.deepEqual(unknownUpdates[1].json, updates[0].json);

  var pong = new Promise(function(resolve, reject) {
    first.once('pong', resolve);
    first.once('error', reject);
  });
  first.ping('protocol-ping');
  assert.equal((await pong).toString(), 'protocol-ping');

  var invalid = await connect('ws://127.0.0.1:' + port + '/ws');
  sockets.push(invalid);
  await nextMessage(invalid);
  var invalidClosed = new Promise(function(resolve) {
    invalid.once('close', function(code) {
      resolve(code);
    });
  });
  invalid.send('not-json');
  assert.equal(await invalidClosed, 1008);

  var binary = await connect('ws://127.0.0.1:' + port + '/ws');
  sockets.push(binary);
  await nextMessage(binary);
  var binaryClosed = new Promise(function(resolve) {
    binary.once('close', function(code) {
      resolve(code);
    });
  });
  binary.send(Buffer.from('not text'));
  assert.equal(await binaryClosed, 1003);

  await Promise.all(sockets.map(closeSocket));
});

test('Arduino list store enforces item, identifier, and UTF-8 limits without partial updates', function() {
  var store = createStore({
    periodic: [{ id: 'milk', name: 'Milk', needed: true }],
    missing: []
  });
  var original = store.getSnapshot();

  assert.throws(function() {
    store.replaceLists({
      periodic: [{ id: 'milk', name: 'Milk', needed: 'yes' }],
      missing: []
    });
  }, /needed must be a boolean/);
  assert.throws(function() {
    store.replaceLists({
      periodic: [{ id: 'milk', name: 'Milk', needed: true }],
      missing: [{ id: 'milk', name: 'Duplicate' }]
    });
  }, /ids must be unique/);
  assert.throws(function() {
    store.replaceLists({
      periodic: [{ id: 'é'.repeat(17), name: 'Too many ID bytes', needed: true }],
      missing: []
    });
  }, /id must be a non-empty string/);
  assert.throws(function() {
    store.replaceLists({
      periodic: [{ id: 'milk', name: 'é'.repeat(33), needed: true }],
      missing: []
    });
  }, /name must be a non-empty string/);
  assert.throws(function() {
    store.replaceLists({
      periodic: Array.from({ length: 65 }, function(_, index) {
        return { id: String(index), name: 'Item', needed: false };
      }),
      missing: []
    });
  }, /at most 64 items/);

  var largestItems = Array.from({ length: 64 }, function(_, index) {
    return {
      id: String(index).padStart(32, '0'),
      name: 'n'.repeat(64),
      needed: false
    };
  });
  assert.throws(function() {
    createStore({ periodic: largestItems, missing: [] });
  }, /exceeds 8192 UTF-8 bytes/);

  var validSizedList = createStore({
    periodic: Array.from({ length: 50 }, function(_, index) {
      return {
        id: String(index).padStart(32, '0'),
        name: 'n'.repeat(64),
        needed: false
      };
    }),
    missing: []
  });
  assert.equal(validSizedList.getSnapshot().periodic.length, 50);
  assert.ok(Buffer.byteLength(validSizedList.serialize(), 'utf8') <= 8192);

  assert.doesNotThrow(function() {
    createStore({
      periodic: [{ id: 'é'.repeat(16), name: 'é'.repeat(32), needed: true }],
      missing: []
    });
  });
  assert.deepEqual(store.getSnapshot(), original);
});

test('Arduino HTTP endpoint returns an empty list from a fresh store', async function(t) {
  var store = createStore();
  var server = http.createServer(app.createApp(store));
  var port = await listen(server);

  t.after(function() {
    return new Promise(function(resolve) {
      server.close(resolve);
    });
  });

  var response = await getJson('http://127.0.0.1:' + port + '/tobuy');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, {
    type: 'list',
    revision: 0,
    periodic: [],
    missing: []
  });

  assert.equal(await getStatus('http://127.0.0.1:' + port + '/'), 404);
  assert.equal(await getStatus('http://127.0.0.1:' + port + '/users'), 404);
});

test('health endpoint returns an OK status', async function(t) {
  var server = http.createServer(app.createApp(createStore()));
  var port = await listen(server);

  t.after(function() {
    return new Promise(function(resolve) {
      server.close(resolve);
    });
  });

  var response = await getJson('http://127.0.0.1:' + port + '/health');
  assert.equal(response.statusCode, 200);
  assert.match(response.contentType, /^application\/json; charset=utf-8$/);
  assert.deepEqual(response.json, { status: 'ok' });
});
