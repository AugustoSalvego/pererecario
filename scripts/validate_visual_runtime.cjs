/* Lightweight DOM-independent smoke test for the presentation JS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const preview = fs.readFileSync(path.join(root, 'preview.html'), 'utf8');
const speciesJson = JSON.parse(fs.readFileSync(path.join(root, 'assets/species.json'), 'utf8'));
const tiers = speciesJson.tiers;
const species = speciesJson.species;
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {
    innerHTML:'', value:'', hidden:false, className:'', textContent:'',
    dataset:{}, classList:{toggle(){},add(){},remove(){}},
    addEventListener(){}, setAttribute(){}, focus(){},setSelectionRange(){},
  });
  return elements.get(id);
}
class FakeImage {constructor(){this.complete=true;this.naturalWidth=0;this.onload=null;}set src(v){this._src=v;}}
const sandbox = {
  console, Image:FakeImage, performance:{now:()=>2000},
  matchMedia:()=>({matches:false}),
  document:{getElementById:el, querySelectorAll:()=>[],addEventListener(){}},
  window:{scrollTo(){}}, requestAnimationFrame:()=>{},
};
vm.createContext(sandbox);
vm.runInContext('const DATA = '+JSON.stringify({tiers,species})+'; const ATLAS = "placeholder";',sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'visual/app.js'),'utf8'),sandbox);
vm.runInContext('art.onload()',sandbox);
assert.match(el('home').innerHTML,/O Pererecário/);
assert.match(el('home').innerHTML,/Pequenas criaturas/);
assert.match(el('camera').innerHTML,/ENCONTRO DE DEMONSTRAÇÃO/);
assert.match(el('inventory').innerHTML,/Meu Brejo/);
assert.match(el('guide').innerHTML,/Guia de campo/);
vm.runInContext('openDetail("frog_star")',sandbox);
assert.match(el('modal').innerHTML,/Constelação viva/);
vm.runInContext('closeModal();go("camera");state.captureId="frog_guava";state.cameraPose=0;shutter()',sandbox);
assert.match(el('modal').innerHTML,/Você encontrou Goiabinha/);
assert.equal(vm.runInContext('state.found.size',sandbox),8);
vm.runInContext('closeModal();go("camera");state.captureId="frog_guava";state.cameraPose=0;shutter()',sandbox);
assert.match(el('modal').innerHTML,/Mais um Goiabinha/);
assert.equal(vm.runInContext('state.owned.length',sandbox),11);
console.log('Visual runtime OK: navigation, modal, new discovery, duplicate capture');
