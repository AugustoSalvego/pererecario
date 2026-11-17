import importlib.util
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import time
import unittest
import uuid

MODULE_PATH = Path(__file__).resolve().parents[1] / 'server' / 'server.py'
spec=importlib.util.spec_from_file_location('game_server',MODULE_PATH)
server=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=server
spec.loader.exec_module(server)

class ApiTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  server.DATA_DIR=Path(self.tmp.name)
  server.DB_PATH=server.DATA_DIR/'data.sqlite3'
  server.init_db()
  self.pid=str(uuid.uuid4()); self.secret=secrets.token_hex(24)
  with server.connection() as c:
   c.execute('INSERT INTO players(id,key_hash,name,created_at) VALUES(?,?,?,?)',(self.pid,server.key_hash(self.secret),'Tester',int(time.time()*1000)))
 def tearDown(self):self.tmp.cleanup()
 def ev(self,typ,payload):return {'id':str(uuid.uuid4()),'type':typ,'payload':payload,'createdAt':int(time.time()*1000)}
 def test_duplicate_and_replay(self):
  p={'encounterId':'123456-computacao-0','speciesId':'frog_drop','zoneId':'computacao','sizeCm':3.5}
  a=self.ev('capture',p);b=self.ev('capture',p)
  with server.connection() as c:
   c.execute('BEGIN IMMEDIATE');r=server.apply_events(c,self.pid,[a,a,b]);c.commit()
   self.assertEqual([i['status'] for i in r],['accepted','duplicate','conflict'])
   self.assertEqual(server.get_stats(server.get_events(c,self.pid))['captures'],1)
 def test_favorite_conflict_and_sync_merge(self):
  p={'encounterId':'123456-biologia-0','speciesId':'frog_leaf','zoneId':'biologia','sizeCm':3.1}
  a=self.ev('capture',p)
  with server.connection() as c:
   c.execute('BEGIN IMMEDIATE');server.apply_events(c,self.pid,[a]);c.commit()
   f1=self.ev('favorite',{'specimenId':a['id'],'value':True,'baseEventId':None})
   f2=self.ev('favorite',{'specimenId':a['id'],'value':False,'baseEventId':None})
   c.execute('BEGIN IMMEDIATE');r=server.apply_events(c,self.pid,[f1,f2]);c.commit()
   self.assertEqual(r[0]['status'],'accepted')
   self.assertEqual(r[1]['status'],'conflict')
   f3=self.ev('favorite',{'specimenId':a['id'],'value':False,'baseEventId':f1['id']})
   c.execute('BEGIN IMMEDIATE');r2=server.apply_events(c,self.pid,[f3]);c.commit()
   self.assertEqual(r2[0]['status'],'accepted')
   self.assertEqual(len(server.get_events(c,self.pid)),3)
 def test_species_zone_restriction(self):
  invalid=self.ev('capture',{'encounterId':'123456-agronomia-0','speciesId':'frog_star','zoneId':'agronomia','sizeCm':4.1})
  self.assertIsNotNone(server.validate_event(invalid))
 def test_database_persists_across_reconnections(self):
  a=self.ev('capture',{'encounterId':'123456-veterinaria-0','speciesId':'frog_clay','zoneId':'veterinaria','sizeCm':3.0})
  with server.connection() as c:
   c.execute('BEGIN IMMEDIATE');server.apply_events(c,self.pid,[a]);c.commit()
  with server.connection() as c:self.assertEqual(len(server.get_events(c,self.pid)),1)

if __name__=='__main__':unittest.main()
