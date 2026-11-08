var assert = require('node:assert/strict');
var childProcess = require('node:child_process');
var http = require('node:http');
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
    socket.once('message', function(data) { resolve(JSON.parse(data)); });
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
