import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateSpawns,pointInPolygon,deriveProgress,eligibleToCatch,distanceMeters,pickRarity,randomFrom} from '../src/engine.js';
const campus=JSON.parse(readFileSync(new URL('../data/campus.json',import.meta.url),'utf8'));
const catalog=JSON.parse(readFileSync(new URL('../assets/species.json',import.meta.url),'utf8'));
const now=1763400000000;
const speciesMap=new Map(catalog.species.map(s=>[s.id,s]));

test('all 15 species belong to exactly one campus zone',()=>{
 assert.equal(catalog.species.length,15);
 const all=campus.zones.flatMap(z=>z.species);
 assert.equal(new Set(all).size,15);
 assert.deepEqual([...new Set(all)].sort(),catalog.species.map(s=>s.id).sort());
});
test('deterministic encounters stay inside matching zone',()=>{
 const a=generateSpawns(now,campus.zones,catalog.species);
 const b=generateSpawns(now,campus.zones,catalog.species);
 assert.deepEqual(a,b);assert.equal(a.length,15);
 for(const spawn of a){const zone=campus.zones.find(z=>z.id===spawn.zoneId);
  assert(zone.species.includes(spawn.speciesId));assert(pointInPolygon(spawn.position,zone.boundary));
  const species=speciesMap.get(spawn.speciesId);assert(spawn.sizeCm>=species.sizeCm[0]&&spawn.sizeCm<=species.sizeCm[1]);}
});
test('duplicate encounter IDs never award points twice',()=>{
 const e=[{id:'a',type:'capture',createdAt:1,status:'confirmed',serverSeq:1,payload:{encounterId:'123',speciesId:'frog_star',sizeCm:5}},{id:'b',type:'capture',createdAt:2,status:'pending',payload:{encounterId:'123',speciesId:'frog_star',sizeCm:5}}];
 const p=deriveProgress(e,catalog.species);assert.equal(p.captures.length,1);assert.equal(p.score,145);assert.equal(p.found.size,1);
});
test('capture enforces precision, zone and distance',()=>{
 const s=generateSpawns(now,campus.zones,catalog.species)[0];
 assert(eligibleToCatch(s,s.position,4,campus.zones).ok);
 assert(!eligibleToCatch(s,null,4,campus.zones).ok);
 assert(!eligibleToCatch(s,s.position,150,campus.zones).ok);
 assert(distanceMeters(s.position,s.position)<.1);
});
test('rarity distribution stays close to 60/28/10/2',()=>{
 const rng=randomFrom('test-distribution');const counts={common:0,uncommon:0,rare:0,special:0};for(let i=0;i<50000;i++)counts[pickRarity(rng)]++;
 for(const [k,v] of Object.entries({common:.6,uncommon:.28,rare:.1,special:.02}))assert(Math.abs(counts[k]/50000-v)<.012,k);
});
