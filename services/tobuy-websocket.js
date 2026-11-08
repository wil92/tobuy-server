var WebSocket = require('ws');

var MAX_MESSAGE_BYTES = 8192;

function isSetPeriodicMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return false;
  }
  var keys = Object.keys(message).sort();
  return keys.length === 3 &&
    keys[0] === 'id' &&
    keys[1] === 'needed' &&
    keys[2] === 'type' &&
    message.type === 'set_periodic' &&
    typeof message.id === 'string' &&
    message.id.length > 0 &&
    Buffer.byteLength(message.id, 'utf8') <= 32 &&
    typeof message.needed === 'boolean';
}

function attachWebSocketServer(server, store, setPeriodic) {
  setPeriodic = setPeriodic || store.setPeriodic;
  var webSocketServer = new WebSocket.Server({
    server: server,
    path: '/ws',
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false
  });

  function broadcastSnapshot() {
    var payload = store.serialize();
    webSocketServer.clients.forEach(function(client) {
      if (client.readyState === WebSocket.OPEN) {
        send(client, payload);
      }
    });
  }

  function send(socket, payload) {
    socket.send(payload, function(error) {
      if (error) {
        console.error('Arduino WebSocket message error:', error);
      }
    });
  }

  store.on('change', broadcastSnapshot);
  webSocketServer.on('close', function() {
    store.removeListener('change', broadcastSnapshot);
  });
  webSocketServer.on('error', function(error) {
    console.error('Arduino WebSocket server error:', error);
  });
  webSocketServer.on('connection', function(socket) {
    send(socket, store.serialize());
    socket.on('message', function(data, isBinary) {
      if (isBinary) {
        socket.close(1003, 'Text messages only');
        return;
      }

      var message;
      try {
        message = JSON.parse(data.toString('utf8'));
      } catch (error) {
        socket.close(1008, 'Invalid protocol message');
        return;
      }
      if (!isSetPeriodicMessage(message)) {
        socket.close(1008, 'Invalid protocol message');
        return;
      }

      Promise.resolve().then(function() {
        return setPeriodic(message.id, message.needed);
      }).then(function(result) {
        if (!result.changed) {
          broadcastSnapshot();
        }
      }).catch(function(error) {
        console.error('Arduino periodic update failed:', error.message);
        broadcastSnapshot();
      });
    });
    socket.on('error', function(error) {
      console.error('Arduino WebSocket client error:', error);
    });
  });

  return webSocketServer;
}

module.exports = attachWebSocketServer;
