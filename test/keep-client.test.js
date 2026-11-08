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
  var original = (await keep.read()).items;
  assert.deepEqual(original, [
    { id: 'milk-id', text: '[PERIODIC] Milk', checked: false },
    { id: 'bread-id', text: 'Bread', checked: false }
  ]);
  var conflict = await keep.write([], 'milk-id', true);
  assert.equal(conflict.conflict, true);
  assert.deepEqual(conflict.items, original);
  var written = await keep.write(original, 'milk-id', true);
  assert.equal(written.conflict, false);
  assert.equal(written.items[0].checked, true);
  assert.deepEqual(written.items[1], original[1]);
  assert.deepEqual((await keep.read()).items, written.items);
});

test('Keep helper reports failures without leaking credentials and can restart', async function(t) {
  var keep = client('test-token', 'fail');
  t.after(function() { keep.close(); });
  var original = (await keep.read()).items;
  await assert.rejects(keep.write(original, 'milk-id', true), /RuntimeError: sync rejected note content: \[redacted\]/);
  assert.deepEqual((await keep.read()).items, original);
  var invalid = client('invalid');
  t.after(function() { invalid.close(); });
  await assert.rejects(invalid.read(), function(error) {
    assert.match(error.message, /ValueError: authentication rejected/);
    assert.doesNotMatch(error.message, /test@example|another-secret|hidden|token=invalid/);
    assert.match(error.message, /\[redacted\]/);
    return true;
  });
  var missing = client('test-token', 'not-found');
  t.after(function() { missing.close(); });
  await assert.rejects(missing.read(), /ValueError: Configured note was not found or is not accessible/);
  var trashed = client('test-token', 'trashed');
  t.after(function() { trashed.close(); });
  await assert.rejects(trashed.read(), /ValueError: Configured note is in the trash/);
  var textNote = client('test-token', 'text-note');
  t.after(function() { textNote.close(); });
  await assert.rejects(textNote.read(), /ValueError: Configured note must be a Keep checklist/);
});

test('Keep helper refuses to change non-periodic checklist items', async function(t) {
  var keep = client();
  t.after(function() { keep.close(); });
  var original = (await keep.read()).items;
  await assert.rejects(keep.write(original, 'bread-id', true), /Invalid periodic checklist update/);
  assert.deepEqual((await keep.read()).items, original);
});

test('Keep helper completes only unchecked non-periodic items', async function(t) {
  var keep = client();
  t.after(function() { keep.close(); });
  var original = (await keep.read()).items;
  await assert.rejects(keep.completeMissing(original, 'milk-id'), /Invalid non-periodic checklist update/);
  assert.deepEqual((await keep.read()).items, original);
  var conflict = await keep.completeMissing([], 'bread-id');
  assert.equal(conflict.conflict, true);
  assert.deepEqual(conflict.items, original);
  var result = await keep.completeMissing(original, 'bread-id');
  assert.equal(result.conflict, false);
  assert.deepEqual(result.items, [original[0], { id: 'bread-id', text: 'Bread', checked: true }]);
  assert.deepEqual((await keep.read()).items, result.items);
  await assert.rejects(keep.completeMissing(result.items, 'bread-id'), /Invalid non-periodic checklist update/);
});

test('Keep helper reports missing interpreter details', async function(t) {
  var keep = createKeepClient('/no/such/python', process.env);
  t.after(function() { keep.close(); });
  await assert.rejects(keep.read(), /Could not start Google Keep helper: ENOENT/);
});
