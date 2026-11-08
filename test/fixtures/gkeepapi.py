class Note:
    def __init__(self):
        self.text = '## Periodic\n- [ ] Milk\n'
        self.trashed = False


class node:
    Note = Note


class Keep:
    def __init__(self):
        self.note = Note()

    def authenticate(self, email, token):
        if token == 'invalid':
            raise ValueError('sensitive token must not appear')

    def get(self, note_id):
        return self.note if note_id == 'note-id' else None

    def sync(self):
        if self.note.text == 'fail':
            raise RuntimeError('sensitive details must not appear')
