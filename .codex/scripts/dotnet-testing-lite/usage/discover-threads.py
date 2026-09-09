"""Read only exact-root spawn metadata from a version-specific Codex state database."""
import json
import sqlite3
import sys
import uuid
from pathlib import Path


def discover(connection, root_id):
    uuid.UUID(root_id)
    root = connection.execute('SELECT id,cli_version,history_mode FROM threads WHERE id=?', (root_id,)).fetchone()
    if not root:
        raise ValueError('Exact root ID missing from database')
    pending = [root_id]
    seen = {root_id}
    edges = []
    while pending:
        parent = pending.pop()
        for child, status in connection.execute(
                'SELECT child_thread_id,status FROM thread_spawn_edges WHERE parent_thread_id=?', (parent,)):
            if child in seen:
                raise ValueError('Duplicate or cyclic thread relationship')
            seen.add(child)
            pending.append(child)
            edges.append({'parentThreadId': parent, 'childThreadId': child, 'status': status})
    return {'rootThreadId': root_id, 'cliVersion': root[1], 'historyMode': root[2], 'edges': edges,
            'source': 'codex-state-db-read-only', 'completeness': 'partial',
            'limitations': ['Internal schema; only observed persisted edges, not proof of all live descendants']}


if __name__ == '__main__':
    database, root_id, output = sys.argv[1:]
    connection = sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True)
    try:
        result = discover(connection, root_id)
    finally:
        connection.close()
    with open(output, 'x', encoding='utf-8') as target:
        json.dump(result, target, indent=2)
        target.write('\n')
    print(json.dumps(result))
