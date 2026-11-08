var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var fs = require('node:fs');
var http = require('node:http');
var os = require('node:os');
var path = require('node:path');
var test = require('node:test');
var WebSocket = require('ws');

test('server starts with the selected Keep note and persists Arduino updates', async function(t) {
  var server = childProcess.spawn(process.execPath, [path.join(__dirname, '../bin/www')], {
    env: Object.assign({}, process.env, {
      KEEP_EMAIL: 'test@example.invalid',
      KEEP_MASTER_TOKEN: 'test-token',
      KEEP_NOTE_ID: 'note-id',
      KEEP_PYTHON: 'python3',
      KEEP_POLL_INTERVAL_MS: '30000',
      PYTHONPATH: path.join(__dirname, 'fixtures'),
      DEBUG: 'tobuy-server:server',
      PORT: '0'
    }),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  t.after(function() {
    return new Promise(function(resolve) {
      if (server.exitCode !== null || server.signalCode !== null) {
        resolve();
      } else {
        server.once('close', resolve);
        server.kill('SIGTERM');
      }
    });
  });

  var port = await new Promise(function(resolve, reject) {
    var output = '';
    var timer = setTimeout(function() { reject(new Error('Server did not start')); }, 5000);
    server.stderr.on('data', function(chunk) {
      output += chunk.toString();
      var match = /Listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    server.once('error', function(error) { clearTimeout(timer); reject(error); });
    server.once('exit', function() { clearTimeout(timer); reject(new Error('Server exited: ' + output)); });
  });
  var socket = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  t.after(function() { socket.terminate(); });
  var initial = await new Promise(function(resolve, reject) {
    socket.on('message', function(data) {
      var message = JSON.parse(data);
      if (message.periodic.length) { resolve(message); }
    });
    socket.once('error', reject);
  });
  assert.equal(initial.periodic[0].name, 'Milk');
  assert.equal(initial.periodic[0].needed, true);
  var confirmation = new Promise(function(resolve) {
    socket.once('message', function(data) { resolve(JSON.parse(data)); });
  });
  socket.send(JSON.stringify({ type: 'set_periodic', id: initial.periodic[0].id, needed: false }));
  var updated = await confirmation;
  assert.equal(updated.periodic[0].needed, false);
  var response = await new Promise(function(resolve, reject) {
    http.get('http://127.0.0.1:' + port + '/tobuy', function(res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() { resolve(JSON.parse(body)); });
    }).on('error', reject);
  });
  assert.deepEqual(response, updated);
});

test('server remains available and retries a failed initial Keep sync', async function(t) {
  var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tobuy-keep-test-'));
  var marker = path.join(directory, 'retry-marker');
  var server = childProcess.spawn(process.execPath, [path.join(__dirname, '../bin/www')], {
    env: Object.assign({}, process.env, {
      KEEP_EMAIL: 'test@example.invalid',
      KEEP_MASTER_TOKEN: 'test-token',
      KEEP_NOTE_ID: 'note-id',
      KEEP_PYTHON: 'python3',
      KEEP_POLL_INTERVAL_MS: '1000',
      KEEP_TEST_RETRY_MARKER: marker,
      PYTHONPATH: path.join(__dirname, 'fixtures'),
      DEBUG: 'tobuy-server:server',
      PORT: '0'
    }),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  t.after(async function() {
    if (server.exitCode === null && server.signalCode === null) {
      await new Promise(function(resolve) {
        server.once('close', resolve);
        server.kill('SIGTERM');
      });
    }
    if (fs.existsSync(marker)) { fs.unlinkSync(marker); }
    fs.rmdirSync(directory);
  });

  var output = '';
  var ready = await new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('Server did not start or log initial failure')); }, 5000);
    server.stderr.on('data', function(chunk) {
      output += chunk.toString();
      var match = /Listening on port (\d+)/.exec(output);
      if (match && output.includes('ValueError: temporary authentication failure')) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    server.once('error', function(error) { clearTimeout(timer); reject(error); });
    server.once('exit', function() { clearTimeout(timer); reject(new Error('Server exited: ' + output)); });
  });
  var socket = new WebSocket('ws://127.0.0.1:' + ready + '/ws');
  t.after(function() { socket.terminate(); });
  var responsePromise = new Promise(function(resolve, reject) {
    http.get('http://127.0.0.1:' + ready + '/tobuy', function(response) {
      var body = '';
      response.setEncoding('utf8');
      response.on('data', function(chunk) { body += chunk; });
      response.on('end', function() { resolve(JSON.parse(body)); });
    }).on('error', reject);
  });
  var messages = [];
  var recovered = await new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('Keep sync did not recover')); }, 5000);
    socket.on('message', function(data) {
      var message = JSON.parse(data);
      messages.push(message);
      if (message.periodic.length) {
        clearTimeout(timer);
        resolve(message);
      }
    });
    socket.once('error', function(error) { clearTimeout(timer); reject(error); });
  });
  assert.deepEqual(messages[0], { type: 'list', revision: 0, periodic: [], missing: [] });
  assert.deepEqual(await responsePromise, messages[0]);
  assert.equal(recovered.periodic[0].name, 'Milk');
  assert.equal(recovered.revision, 1);
  assert.equal(server.exitCode, null);
});
