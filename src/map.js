import {generateSpawns,distanceMeters,eligibleToCatch,pointInPolygon} from './engine.js';
const rad=Math.PI/180;
function mercator(p,z){const n=256*2**z;const lat=Math.max(-85.0511,Math.min(85.0511,p[0]));const s=Math.sin(lat*rad);return [(p[1]+180)/360*n,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n];}
function inverse(p,z){const n=256*2**z;const y=Math.PI*(1-2*p[1]/n);return [Math.atan(Math.sinh(y))/rad,p[0]/n*360-180];}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export class CampusMap{
 constructor(element,{campus,species,atlas,onEncounter,getLocation,getProgress}){
  this.el=element;this.campus=campus;this.species=species;this.atlas=atlas;this.onEncounter=onEncounter;this.getLocation=getLocation;this.getProgress=getProgress;
  this.center=[...campus.center];this.zoom=16;this.tileKey='';this.spawns=[];this.currentSlot=-1;this.pointers=new Map();this.drawn=false;
  this.el.innerHTML='<div class="map-scene"></div><div class="map-tiles" aria-hidden="true"></div><svg class="map-polygons" aria-label="Áreas do campus"></svg><div class="map-spawns"></div><div class="map-gps"></div><div class="map-topnote">🗺️ CAMPUS LUIZ MENEGHEL</div><div class="map-attribution">© <a target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors</div><div class="map-control"><button data-map="plus" title="Aproximar" aria-label="Aproximar mapa">+</button><button data-map="minus" title="Afastar" aria-label="Afastar mapa">−</button><button data-map="gps" title="Minha posição" aria-label="Centralizar na minha posição">⌖</button></div>';
  this.el.querySelector('[data-map="plus"]').onclick=()=>this.zoomBy(1);
  this.el.querySelector('[data-map="minus"]').onclick=()=>this.zoomBy(-1);
  this.el.querySelector('[data-map="gps"]').onclick=()=>this.centerGPS();
  this.el.addEventListener('pointerdown',e=>{if(e.target.closest('button,a'))return;this.pointers.set(e.pointerId,[e.clientX,e.clientY]);this.el.setPointerCapture?.(e.pointerId);});
  this.el.addEventListener('pointermove',e=>{const old=this.pointers.get(e.pointerId);if(!old)return;const next=[e.clientX,e.clientY];this.pointers.set(e.pointerId,next);if(this.pointers.size===1){const c=mercator(this.center,this.zoom);this.center=inverse([c[0]-(next[0]-old[0]),c[1]-(next[1]-old[1])],this.zoom);this.draw();}else if(this.pointers.size===2){const xs=[...this.pointers.values()];const currentDist=Math.hypot(xs[0][0]-xs[1][0],xs[0][1]-xs[1][1]);if(this.lastPinch && currentDist>this.lastPinch*1.55){this.zoomBy(1);this.lastPinch=currentDist;}else if(this.lastPinch && currentDist<this.lastPinch*.65){this.zoomBy(-1);this.lastPinch=currentDist;}else this.lastPinch=currentDist;}});
  const end=e=>{this.pointers.delete(e.pointerId);if(this.pointers.size<2)this.lastPinch=null;};this.el.addEventListener('pointerup',end);this.el.addEventListener('pointercancel',end);
  this.el.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.shiftKey)return;e.preventDefault();this.zoomBy(e.deltaY<0?1:-1);},{passive:false});
  this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(this.el);this.draw();
 }
 zoomBy(dir){this.zoom=clamp(this.zoom+dir,14,18);this.tileKey='';this.draw();}
 centerGPS(){const l=this.getLocation();if(l){this.center=[l.latitude,l.longitude];this.draw();}}
 update(){this.draw();}
 point(p){const rect=this.el.getBoundingClientRect(),c=mercator(this.center,this.zoom),g=mercator(p,this.zoom);return [rect.width/2+g[0]-c[0],rect.height/2+g[1]-c[1]];}
 refreshSpawns(){const slot=Math.floor(Date.now()/(30*60*1000));if(this.currentSlot===slot)return;this.currentSlot=slot;this.spawns=generateSpawns(Date.now(),this.campus.zones,this.species);}
 draw(){if(!this.el?.isConnected)return;this.refreshSpawns();const {width,height}=this.el.getBoundingClientRect();if(!width||!height)return;const z=this.zoom,c=mercator(this.center,z);const firstX=Math.floor((c[0]-width/2)/256),lastX=Math.floor((c[0]+width/2)/256),firstY=Math.floor((c[1]-height/2)/256),lastY=Math.floor((c[1]+height/2)/256);const key=`${z}:${firstX}:${lastX}:${firstY}:${lastY}`;const tiles=this.el.querySelector('.map-tiles');if(key!==this.tileKey){this.tileKey=key;tiles.replaceChildren();for(let x=firstX;x<=lastX;x++)for(let y=firstY;y<=lastY;y++){if(x<0||y<0||x>=2**z||y>=2**z)continue;const img=new Image();img.src=`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.className='map-tile';img.dataset.x=String(x);img.dataset.y=String(y);img.onerror=()=>img.remove();tiles.append(img);}}
  for(const tile of tiles.children){const x=+tile.dataset.x,y=+tile.dataset.y;tile.style.left=`${Math.round(width/2+x*256-c[0])}px`;tile.style.top=`${Math.round(height/2+y*256-c[1])}px`;}
  const svg=this.el.querySelector('.map-polygons');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.innerHTML=this.campus.zones.map(zone=>`<polygon points="${zone.boundary.map(p=>this.point(p).map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="${zone.color}" stroke="${zone.color}" stroke-width="3.5" fill-opacity=".24" stroke-opacity=".95"/>`).join('');
  const progress=this.getProgress();const already=new Set(progress.captures.map(c=>c.encounterId));const layer=this.el.querySelector('.map-spawns');layer.replaceChildren();for(const spawn of this.spawns){if(already.has(spawn.id))continue;const [x,y]=this.point(spawn.position);if(x<-70||x>width+70||y<-70||y>height+70)continue;const btn=document.createElement('button');btn.className='spawn-marker';btn.style.left=`${x}px`;btn.style.top=`${y}px`;btn.setAttribute('aria-label','Ver encontro de perereca');btn.innerHTML='<span class="spawn-ring"></span><canvas width="74" height="74"></canvas>';btn.onclick=()=>this.onEncounter(spawn);layer.append(btn);this.drawSprite(btn.querySelector('canvas'),spawn.speciesId);}
  const marker=this.el.querySelector('.map-gps');const gps=this.getLocation();marker.replaceChildren();if(gps){const [x,y]=this.point([gps.latitude,gps.longitude]);if(x>-30&&x<width+30&&y>-30&&y<height+30){const dot=document.createElement('span');dot.className='player-marker';dot.style.left=`${x}px`;dot.style.top=`${y}px`;dot.innerHTML='<i></i>';marker.append(dot);}}
 }
 drawSprite(canvas,speciesId){const s=this.species.find(v=>v.id===speciesId);if(!s||!this.atlas.complete||!this.atlas.naturalWidth)return;const [x,y,w,h]=s.rect,ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;const scale=Math.min(60/w,56/h);ctx.clearRect(0,0,74,74);ctx.drawImage(this.atlas,x,y,w,h,(74-w*scale)/2,(70-h*scale),w*scale,h*scale);}
 destroy(){this.resizeObserver.disconnect();this.el.replaceChildren();}
}
