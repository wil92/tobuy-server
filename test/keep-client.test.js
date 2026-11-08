var assert = require('node:assert/strict');
var path = require('node:path');
var test = require('node:test');
var createKeepClient = require('../services/keep-client');

function client(token, noteId) {
  return createKeepClient('python3', Object.assign({}, process.env, {
    PYTHONPATH: path.join(__dirname, 'fixtures'),
    KEEP_EMAIL: 'test@example.invalid',
    KEEP_MASTER_TOKEN: token || 'test-token',
    KEEP_NOTE_ID: noteId || 'note-id'
  }));
}

test('Keep helper reads, checks stale writes and updates the existing note', async function(t) {
  var keep = client();
  t.after(function() { keep.close(); });
  var original = (await keep.read()).text;
  assert.equal(original, '## Periodic\n- [ ] Milk\n');
  var conflict = await keep.write('stale text', 'new text');
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.text, original);
  var written = await keep.write(original, 'new text');
  assert.equal(written.conflict, false);
  assert.equal(written.text, 'new text');
  assert.equal((await keep.read()).text, 'new text');
});

test('Keep helper reports failures without leaking credentials and can restart', async function(t) {
  var keep = client();
  t.after(function() { keep.close(); });
  var original = (await keep.read()).text;
  await assert.rejects(keep.write(original, 'fail'), /Google Keep helper failed: RuntimeError/);
  assert.equal((await keep.read()).text, original);
  var invalid = client('invalid');
  t.after(function() { invalid.close(); });
  await assert.rejects(invalid.read(), function(error) {
    assert.match(error.message, /ValueError/);
    assert.doesNotMatch(error.message, /sensitive|invalid/);
    return true;
  });
  var missing = client('test-token', 'not-found');
  t.after(function() { missing.close(); });
  await assert.rejects(missing.read(), /ValueError/);
});
