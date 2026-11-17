#!/usr/bin/env python3
"""Pererecario API + PWA static hosting. Requires only Python 3.11+.

Use an HTTPS reverse proxy in production and a persistent DATA_DIR volume.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from contextlib import contextmanager
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get('DATA_DIR', str(ROOT / '.local-data')))
DB_PATH = DATA_DIR / 'players.sqlite3'
LOCK = threading.RLock()
MAX_BODY = 256 * 1024
PLAYER_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
SECRET_PATTERN = re.compile(r'^[0-9a-f]{48}$')
EVENT_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f-]{27,42}$')
SPECIES = {s['id']: s for s in json.loads((ROOT / 'assets/species.json').read_text(encoding='utf-8'))['species']}
ZONES = {z['id']: z for z in json.loads((ROOT / 'data/campus.json').read_text(encoding='utf-8'))['zones']}
POINTS = {'common': 10, 'uncommon': 20, 'rare': 45, 'special': 120}


@contextmanager
def connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    try:
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA journal_mode=WAL')
        c.execute('PRAGMA foreign_keys=ON')
        yield c
        if c.in_transaction: c.commit()
    except Exception:
        if c.in_transaction: c.rollback()
        raise
    finally:
        c.close()


def init_db():
    with LOCK, connection() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, name TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id TEXT NOT NULL REFERENCES players(id),
          id TEXT NOT NULL, type TEXT NOT NULL,
          payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, received_at INTEGER NOT NULL,
          encounter_id TEXT, UNIQUE(player_id, id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_capture ON events(player_id, encounter_id)
          WHERE encounter_id IS NOT NULL;
        CREATE TABLE IF NOT EXISTS favorite_heads (
          player_id TEXT NOT NULL REFERENCES players(id),
          specimen_id TEXT NOT NULL, last_event_id TEXT NOT NULL,
          PRIMARY KEY(player_id, specimen_id)
        );
        ''')


def key_hash(secret):
    return hashlib.sha256(secret.encode()).hexdigest()


def get_events(c, player_id):
    rows = c.execute('SELECT seq, id, type, payload_json, created_at FROM events WHERE player_id=? ORDER BY seq', (player_id,)).fetchall()
    return [{'id': row['id'], 'type': row['type'], 'payload': json.loads(row['payload_json']),
             'createdAt': row['created_at'], 'serverSeq': row['seq']} for row in rows]


def get_stats(rows):
    seen = set()
    found = set()
    score = 0
    captures = 0
    for e in rows:
        if e['type'] != 'capture':
            continue
        p = e['payload']
        if p['encounterId'] in seen:
            continue
        seen.add(p['encounterId'])
        s = SPECIES.get(p['speciesId'])
        if s is None:
            continue
        captures += 1
        score += POINTS[s['tier']]
        if s['id'] not in found:
            score += 25
            found.add(s['id'])
    return {'score': score, 'captures': captures, 'discovered': len(found)}


def validate_event(event):
    if not isinstance(event, dict) or not EVENT_PATTERN.fullmatch(str(event.get('id', ''))):
        return 'Identificador de evento inválido.'
    if event.get('type') not in ('capture', 'favorite'):
        return 'Tipo de evento desconhecido.'
    p = event.get('payload')
    if not isinstance(p, dict):
        return 'Dados inválidos.'
    if event['type'] == 'capture':
        if p.get('demo') is True:
            return 'Eventos de demonstração não entram no ranking oficial.'
        species = SPECIES.get(p.get('speciesId'))
        zone = ZONES.get(p.get('zoneId'))
        if not species or not zone or species['id'] not in zone['species']:
            return 'Espécie não pertence a essa zona do campus.'
        encounter = p.get('encounterId')
        if not isinstance(encounter, str) or not re.fullmatch(r'\d{5,9}-(computacao|biologia|enfermagem|veterinaria|agronomia)-[0-2]', encounter):
            return 'Identificador do encontro inválido.'
        if not encounter.split('-')[1] == zone['id']:
            return 'O encontro não pertence à zona informada.'
        size = p.get('sizeCm')
        low, high = species['sizeCm']
        if not isinstance(size, (int, float)) or isinstance(size, bool) or not low <= size <= high:
            return 'Tamanho de exemplar inválido.'
    else:
        if not EVENT_PATTERN.fullmatch(str(p.get('specimenId', ''))):
            return 'Exemplar inválido.'
        if not isinstance(p.get('value'), bool):
            return 'Favorito inválido.'
        if p.get('baseEventId') is not None and not EVENT_PATTERN.fullmatch(str(p['baseEventId'])):
            return 'Versão anterior inválida.'
    created = event.get('createdAt')
    if not isinstance(created, (int, float)) or not 0 < created < 9999999999999:
        return 'Data do evento inválida.'
    return None


def apply_events(c, player_id, events):
    results = []
    now = int(time.time() * 1000)
    for event in events:
        event_id = event.get('id') if isinstance(event, dict) else None
        error = validate_event(event)
        if error:
            results.append({'id': event_id, 'status': 'rejected', 'reason': error})
            continue
        old = c.execute('SELECT seq FROM events WHERE player_id=? AND id=?', (player_id, event_id)).fetchone()
        if old:
            results.append({'id': event_id, 'status': 'duplicate', 'serverSeq': old['seq']})
            continue
        payload = event['payload']
        if event['type'] == 'capture':
            clash = c.execute('SELECT id FROM events WHERE player_id=? AND encounter_id=?', (player_id, payload['encounterId'])).fetchone()
            if clash:
                results.append({'id': event_id, 'status': 'conflict', 'reason': 'Encontro já registrado em outro dispositivo.'})
                continue
        if event['type'] == 'favorite':
            valid_specimen = c.execute('SELECT 1 FROM events WHERE player_id=? AND id=? AND type="capture"', (player_id, payload['specimenId'])).fetchone()
            if not valid_specimen:
                results.append({'id': event_id, 'status': 'rejected', 'reason': 'O exemplar ainda não foi sincronizado.'})
                continue
            head = c.execute('SELECT last_event_id FROM favorite_heads WHERE player_id=? AND specimen_id=?', (player_id, payload['specimenId'])).fetchone()
            latest = head['last_event_id'] if head else None
            if latest != payload.get('baseEventId'):
                results.append({'id': event_id, 'status': 'conflict', 'reason': 'Favorito alterado em outro aparelho; prevaleceu a versão já registrada no servidor.'})
                continue
        c.execute('INSERT INTO events(player_id,id,type,payload_json,created_at,received_at,encounter_id) VALUES (?,?,?,?,?,?,?)',
                  (player_id, event_id, event['type'], json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
                   int(event['createdAt']), now, payload['encounterId'] if event['type'] == 'capture' else None))
        seq = c.execute('SELECT last_insert_rowid() AS id').fetchone()['id']
        if event['type'] == 'favorite':
            c.execute('INSERT INTO favorite_heads(player_id,specimen_id,last_event_id) VALUES(?,?,?) ON CONFLICT(player_id,specimen_id) DO UPDATE SET last_event_id=excluded.last_event_id',
                      (player_id, payload['specimenId'], event_id))
        results.append({'id': event_id, 'status': 'accepted', 'serverSeq': seq})
    return results


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.webmanifest':'application/manifest+json', '.js':'text/javascript', '.webp':'image/webp'}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('X-Frame-Options', 'DENY')
        if self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def respond(self, status, data):
        body = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/api/v1/health':
            with connection() as c:
                players = c.execute('SELECT COUNT(*) FROM players').fetchone()[0]
            return self.respond(200, {'ok': True, 'server': 'Pererecario', 'players': players})
        if route == '/api/v1/leaderboard':
            with connection() as c:
                rows = c.execute('SELECT id,name FROM players').fetchall()
                ranking = []
                for player in rows:
                    stats = get_stats(get_events(c, player['id']))
                    ranking.append({'name': player['name'], **stats})
            ranking.sort(key=lambda p: (-p['score'], -p['captures'], p['name'].lower()))
            return self.respond(200, {'players': len(ranking), 'ranking': ranking[:30]})
        if route == '/api/v1/state':
            with connection() as c:
                p = self.authorized(c)
                if p is None:
                    return
                return self.respond(200, {'name': p['name'], 'events': get_events(c, p['id'])})
        if route.startswith('/api/'):
            return self.respond(404, {'error': 'Rota inexistente.'})
        if route == '/':
            self.path = '/index.html'
        elif '.' not in route.split('/')[-1]:
            self.path = '/index.html'
        super().do_GET()

    def authorized(self, c, quiet=False):
        token = self.headers.get('Authorization', '').removeprefix('Bearer ').strip()
        player_id, sep, secret = token.partition('.')
        if not sep or not PLAYER_PATTERN.fullmatch(player_id) or not SECRET_PATTERN.fullmatch(secret):
            if not quiet: self.respond(401, {'error': 'Identificação necessária.'})
            return None
        row = c.execute('SELECT * FROM players WHERE id=?', (player_id,)).fetchone()
        if row is None or not hmac.compare_digest(row['key_hash'], key_hash(secret)):
            if not quiet: self.respond(403, {'error': 'Código de recuperação incorreto.'})
            return None
        return row

    def read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY: raise ValueError('Tamanho de requisição inválido.')
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict): raise ValueError('Objeto JSON obrigatório.')
            return value
        except (ValueError, UnicodeDecodeError):
            self.respond(400, {'error': 'JSON inválido ou excede o limite.'})
            return None

    def do_POST(self):
        route = urlsplit(self.path).path
        if route not in ('/api/v1/register', '/api/v1/sync'):
            return self.respond(404, {'error': 'Rota inexistente.'})
        data = self.read_json()
        if data is None: return
        with LOCK, connection() as c:
            if route == '/api/v1/register':
                name = str(data.get('name', '')).strip()[:32]
                if not name: return self.respond(400, {'error': 'Informe seu nome.'})
                token = self.headers.get('Authorization', '').removeprefix('Bearer ').strip()
                pid, sep, secret = token.partition('.')
                if not sep or not PLAYER_PATTERN.fullmatch(pid) or not SECRET_PATTERN.fullmatch(secret):
                    return self.respond(401, {'error': 'Identificação inválida.'})
                c.execute('BEGIN IMMEDIATE')
                row = c.execute('SELECT * FROM players WHERE id=?', (pid,)).fetchone()
                if row and not hmac.compare_digest(row['key_hash'], key_hash(secret)):
                    c.rollback();return self.respond(403, {'error': 'Chave não confere.'})
                if not row:
                    c.execute('INSERT INTO players(id,key_hash,name,created_at) VALUES (?,?,?,?)', (pid, key_hash(secret), name, int(time.time()*1000)))
                c.commit()
                return self.respond(200, {'ok': True, 'name': row['name'] if row else name, 'created': not bool(row)})
            player = self.authorized(c)
            if player is None: return
            events = data.get('events')
            if not isinstance(events, list) or len(events) > 150:
                return self.respond(400, {'error': 'Lote de eventos inválido.'})
            try:
                c.execute('BEGIN IMMEDIATE')
                results = apply_events(c, player['id'], events)
                canonical = get_events(c, player['id'])
                c.commit()
            except sqlite3.Error:
                c.rollback()
                return self.respond(503, {'error': 'Falha de armazenamento. Tente novamente.'})
            return self.respond(200, {'results': results, 'events': canonical, 'stats': get_stats(canonical)})


def serve(port=8000):
    init_db()
    httpd = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'Pererecario PWA: http://localhost:{port} | DATA_DIR={DATA_DIR}', flush=True)
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass
    finally: httpd.server_close()

if __name__ == '__main__':
    serve(int(os.environ.get('PORT', '8000')))
