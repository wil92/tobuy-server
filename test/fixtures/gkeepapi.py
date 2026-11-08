import os


class ListItem:
    def __init__(self, id, text, checked=False):
        self.id = id
        self.text = text
        self.checked = checked


class List:
    def __init__(self):
        self.items = [
            ListItem('milk-id', '[PERIODIC] Milk'),
            ListItem('bread-id', 'Bread'),
        ]
        self.trashed = False


class Note:
    trashed = False


class node:
    List = List
    Note = Note


class Keep:
    def __init__(self):
        self.note = List()

    def authenticate(self, email, token):
        if token == 'invalid':
            raise ValueError(
                'authentication rejected for ' + email + ' token=' + token
                + ' access_token=another-secret https://example.invalid/?token=hidden'
            )
        marker = os.environ.get('KEEP_TEST_RETRY_MARKER')
        if marker and not os.path.exists(marker):
            with open(marker, 'w', encoding='utf8') as file:
                file.write('failed')
            raise ValueError('temporary authentication failure')

    def get(self, note_id):
        if note_id == 'trashed':
            self.note.trashed = True
            return self.note
        if note_id == 'text-note':
            return Note()
        if note_id == 'fail':
            self.note.items[0].text = '[PERIODIC] fail'
            return self.note
        return self.note if note_id == 'note-id' else None

    def sync(self):
        if self.note.items[0].text == '[PERIODIC] fail' and self.note.items[0].checked:
            raise RuntimeError('sync rejected note content: ' + self.note.items[0].text)
