import json
import os
import re
import sys


def report_error(error, request=None):
    detail = str(error)
    values = [
        os.environ.get('KEEP_EMAIL'),
        os.environ.get('KEEP_MASTER_TOKEN'),
        os.environ.get('KEEP_NOTE_ID'),
    ]
    if isinstance(request, dict) and isinstance(request.get('expected'), list):
        for item in request['expected']:
            if isinstance(item, dict):
                values.extend([item.get('text'), item.get('id')])
    values = sorted((value for value in values if isinstance(value, str) and value),
                    key=len, reverse=True)
    for value in values:
        detail = detail.replace(value, '[redacted]')
    detail = re.sub(r'https?://[^\s]+', '[URL redacted]', detail)
    detail = re.sub(
        r'(?i)(authorization|access[_ -]?token|refresh[_ -]?token|password|secret)'
        r'(["\']?\s*[:=]\s*["\']?)([^\s,}\]"\']+)',
        r'\1\2[redacted]', detail,
    )
    detail = ' '.join(detail.split())[:1024]
    message = type(error).__name__
    if detail:
        message += ': ' + detail
    print(json.dumps({'error': message}, ensure_ascii=True), flush=True)


def get_note(keep, note_id):
    note = keep.get(note_id)
    if note is None:
        raise ValueError('Configured note was not found or is not accessible; check KEEP_NOTE_ID and sharing')
    if note.trashed:
        raise ValueError('Configured note is in the trash')
    if not isinstance(note, gkeepapi.node.List):
        raise ValueError('Configured note must be a Keep checklist')
    return note


def checklist_items(note):
    return [{'id': item.id, 'text': item.text, 'checked': item.checked} for item in note.items]


def main():
    global gkeepapi
    import gkeepapi

    keep = gkeepapi.Keep()
    keep.authenticate(os.environ['KEEP_EMAIL'], os.environ['KEEP_MASTER_TOKEN'])
    note_id = os.environ['KEEP_NOTE_ID']
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            keep.sync()
            note = get_note(keep, note_id)
            items = checklist_items(note)
            if request['operation'] == 'read':
                response = {'items': items}
            elif request['operation'] == 'write':
                if items != request['expected']:
                    response = {'items': items, 'conflict': True}
                else:
                    matches = [item for item in note.items if item.id == request['id']]
                    if (len(matches) != 1 or not matches[0].text.startswith('[PERIODIC]')
                            or not isinstance(request['checked'], bool)):
                        raise ValueError('Invalid periodic checklist update')
                    matches[0].checked = request['checked']
                    keep.sync()
                    response = {'items': checklist_items(get_note(keep, note_id)), 'conflict': False}
            else:
                raise ValueError('Unsupported operation')
            print(json.dumps(response, ensure_ascii=True), flush=True)
        except Exception as error:
            report_error(error, request)
            return 1
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        report_error(error)
        sys.exit(1)
