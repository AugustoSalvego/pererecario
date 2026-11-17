"""Live HTTP API integration tests using stdlib only."""
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import sys
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import uuid
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import server

class HTTPFlow(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  server.DATA_DIR=Path(self.tmp.name);server.DB_PATH=server.DATA_DIR/'db.sqlite3';server.init_db()
  self.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
  self.address=f'http://127.0.0.1:{self.http.server_address[1]}'
  self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
  self.id=str(uuid.uuid4());self.secret=secrets.token_hex(24)
  self.auth=f'Bearer {self.id}.{self.secret}'
 def tearDown(self):
  self.http.shutdown();self.http.server_close();self.thread.join(timeout=3);self.tmp.cleanup()
 def api(self,path,data=None,auth=True):
  headers={'Content-Type':'application/json'}
  if auth:headers['Authorization']=self.auth
  req=Request(self.address+path,method='POST' if data is not None else 'GET',headers=headers,data=json.dumps(data).encode() if data is not None else None)
  try:
   with urlopen(req,timeout=5) as r:return r.status,json.loads(r.read().decode())
  except HTTPError as e:return e.code,json.loads(e.read().decode())
 def event(self,kind,payload):return {'id':str(uuid.uuid4()),'type':kind,'payload':payload,'createdAt':int(time.time()*1000),'deviceId':str(uuid.uuid4())}
 def test_register_sync_2_devices_replays_and_conflict(self):
  status,h=self.api('/api/v1/health',auth=False);self.assertEqual(status,200);self.assertEqual(h['players'],0)
  status,_=self.api('/api/v1/register',{'name':'Exploradora 1'});self.assertEqual(status,200)
  a=self.event('capture',{'encounterId':'123456-biologia-0','zoneId':'biologia','speciesId':'frog_leaf','sizeCm':3.2})
  status,data=self.api('/api/v1/sync',{'events':[a]});self.assertEqual(status,200);self.assertEqual(data['results'][0]['status'],'accepted')
  status,data2=self.api('/api/v1/state');self.assertEqual(status,200);self.assertEqual(len(data2['events']),1)
  b=self.event('capture',{'encounterId':'123457-computacao-0','zoneId':'computacao','speciesId':'frog_drop','sizeCm':3.2})
  status,datab=self.api('/api/v1/sync',{'events':[a,b]});self.assertEqual([s['status'] for s in datab['results']],['duplicate','accepted']);self.assertEqual(datab['stats']['captures'],2)
  conflict=self.event('capture',a['payload'])
  status,d=self.api('/api/v1/sync',{'events':[conflict]});self.assertEqual(d['results'][0]['status'],'conflict');self.assertEqual(d['stats']['captures'],2)
  favorA=self.event('favorite',{'specimenId':a['id'],'value':True,'baseEventId':None})
  favorB=self.event('favorite',{'specimenId':a['id'],'value':False,'baseEventId':None})
  status,d=self.api('/api/v1/sync',{'events':[favorA,favorB]});self.assertEqual([x['status'] for x in d['results']],['accepted','conflict'])
  status,leader=self.api('/api/v1/leaderboard',auth=False);self.assertEqual(status,200);self.assertEqual(leader['players'],1);self.assertEqual(leader['ranking'][0]['captures'],2)
  status,_=self.api('/api/v1/health',auth=False);self.assertEqual(status,200)
 def test_wrong_token_rejected(self):
  self.api('/api/v1/register',{'name':'Exploradora 1'})
  self.auth=f'Bearer {self.id}.{secrets.token_hex(24)}'
  status,_=self.api('/api/v1/state');self.assertEqual(status,403)
 def test_static_page_and_manifest(self):
  with urlopen(self.address+'/',timeout=5) as r:self.assertIn(b'Pererec',r.read());self.assertIn('text/html',r.headers['Content-Type'])
  with urlopen(self.address+'/manifest.webmanifest',timeout=5) as r:self.assertIn('manifest+json',r.headers['Content-Type'])

if __name__=='__main__':unittest.main()
