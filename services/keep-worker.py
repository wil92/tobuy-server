import json
import os
import sys

import gkeepapi


def get_note(keep, note_id):
    note = keep.get(note_id)
    if not isinstance(note, gkeepapi.node.Note) or note.trashed:
        raise ValueError('Configured note is missing, trashed, or not a text note')
    return note


def main():
    keep = gkeepapi.Keep()
    keep.authenticate(os.environ['KEEP_EMAIL'], os.environ['KEEP_MASTER_TOKEN'])
    note_id = os.environ['KEEP_NOTE_ID']
    for line in sys.stdin:
        try:
            request = json.loads(line)
            keep.sync()
            note = get_note(keep, note_id)
            if request['operation'] == 'read':
                response = {'text': note.text}
            elif request['operation'] == 'write':
                if note.text != request['expected']:
                    response = {'text': note.text, 'conflict': True}
                else:
                    note.text = request['text']
                    keep.sync()
                    response = {'text': get_note(keep, note_id).text, 'conflict': False}
            else:
                raise ValueError('Unsupported operation')
            print(json.dumps(response, ensure_ascii=True), flush=True)
        except Exception as error:
            print(json.dumps({'error': type(error).__name__}), flush=True)
            return 1
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'error': type(error).__name__}), flush=True)
        sys.exit(1)
