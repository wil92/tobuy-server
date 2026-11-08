var childProcess = require('child_process');
var path = require('path');
var readline = require('readline');

function createKeepClient(python, env) {
  var child;
  var pending;
  var initial = true;
  var stopped = false;

  function fail(error) {
    if (pending) {
      var current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.reject(error);
    }
  }

  function start() {
    var processChild = childProcess.spawn(python, [path.join(__dirname, 'keep-worker.py')], {
      env: env,
      stdio: ['pipe', 'pipe', 'ignore']
    });
    child = processChild;
    initial = true;
    var output = readline.createInterface({ input: processChild.stdout });
    output.on('line', function(line) {
      if (child !== processChild || !pending) {
        return;
      }
      var response;
      try {
        response = JSON.parse(line);
      } catch (error) {
        fail(new Error('Invalid response from Google Keep helper'));
        child = null;
        processChild.kill();
        return;
      }
      if (!response || typeof response !== 'object' || response.error || !Array.isArray(response.items)) {
        var reason = response && typeof response.error === 'string' ? response.error : 'invalid response';
        fail(new Error('Google Keep helper failed: ' + reason));
        child = null;
        processChild.kill();
        return;
      }
      var current = pending;
      pending = null;
      clearTimeout(current.timer);
      initial = false;
      current.resolve(response);
    });
    processChild.on('error', function(error) {
      if (child === processChild) {
        fail(new Error('Could not start Google Keep helper: ' + (error.code || error.message)));
        child = null;
        processChild.kill();
      }
    });
    processChild.stdin.on('error', function() {
      if (child === processChild) {
        fail(new Error('Google Keep helper input failed'));
        child = null;
        processChild.kill();
      }
    });
    processChild.on('close', function() {
      output.close();
      if (child === processChild) {
        child = null;
        fail(new Error('Google Keep helper stopped unexpectedly'));
      }
    });
  }

  function request(operation, expected, id, checked) {
    if (stopped) {
      return Promise.reject(new Error('Google Keep helper is closed'));
    }
    if (pending) {
      return Promise.reject(new Error('Google Keep helper request already in progress'));
    }
    if (!child) {
      start();
    }
    return new Promise(function(resolve, reject) {
      var processChild = child;
      var timer = setTimeout(function() {
        fail(new Error('Google Keep helper timed out'));
        if (child === processChild) {
          child = null;
          processChild.kill();
        }
      }, initial ? 60000 : 8000);
      pending = { resolve: resolve, reject: reject, timer: timer };
      processChild.stdin.write(JSON.stringify({ operation: operation, expected: expected, id: id, checked: checked }) + '\n');
    });
  }

  return {
    read: function() { return request('read'); },
    write: function(expected, id, checked) { return request('write', expected, id, checked); },
    close: function() {
      stopped = true;
      fail(new Error('Google Keep helper closed'));
      if (child) {
        child.kill();
        child = null;
      }
    }
  };
}

module.exports = createKeepClient;
