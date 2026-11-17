import {dbAll,dbMany,dbSet} from './db.js';
export class SyncService{
 constructor({getPlayer,onChange}){this.getPlayer=getPlayer;this.onChange=onChange;this.status='offline';this.pending=0;this.lastSuccess=0;this.active=false;this.timer=null;this.conflicts=0;this.syncing=false;this.started=false;}
 notify(){this.onChange?.({status:this.status,pending:this.pending,lastSuccess:this.lastSuccess,conflicts:this.conflicts,syncing:this.syncing});}
 async recount(){const events=await dbAll('events');this.pending=events.filter(e=>e.status==='pending').length;this.notify();}
 start(){if(this.started)return;this.started=true;window.addEventListener('online',this.boundOnline=()=>this.schedule(100));window.addEventListener('offline',this.boundOffline=()=>{this.status='offline';this.notify();});document.addEventListener('visibilitychange',this.boundVisible=()=>{if(!document.hidden)this.schedule(100);});this.schedule(400);}
 stop(){this.started=false;clearTimeout(this.timer);window.removeEventListener('online',this.boundOnline);window.removeEventListener('offline',this.boundOffline);document.removeEventListener('visibilitychange',this.boundVisible);}
 schedule(delay=18000){clearTimeout(this.timer);if(this.started)this.timer=setTimeout(()=>this.sync(),delay);}
 async sync(){if(this.active)return;const player=this.getPlayer();if(!player){this.status='offline';this.notify();this.schedule(20000);return;}if(!navigator.onLine){this.status='offline';this.notify();this.schedule(10000);return;}
 this.active=true;this.syncing=true;this.notify();const timeout=AbortSignal.timeout(7000);
 try{
   const headers={'Content-Type':'application/json','Authorization':`Bearer ${player.id}.${player.secret}`};
   const health=await fetch('/api/v1/health',{signal:timeout,cache:'no-store'});
   if(!health.ok)throw Error('server');
   // Register is idempotent; the secret never enters the URL.
   const registration=await fetch('/api/v1/register',{method:'POST',headers,body:JSON.stringify({name:player.name}),signal:AbortSignal.timeout(7000)});
   if(!registration.ok)throw Error(registration.status===403?'Código de jogador não reconhecido pelo servidor.':'register');
   const events=await dbAll('events');const outgoing=events.filter(e=>e.status==='pending');
   const res=await fetch('/api/v1/sync',{method:'POST',headers,body:JSON.stringify({events:outgoing}),signal:AbortSignal.timeout(10000),cache:'no-store'});
   if(!res.ok)throw Error(`sync-${res.status}`);
   const data=await res.json();const statusMap=new Map(data.results.map(r=>[r.id,r]));
   const remote=data.events.map(e=>({...e,status:'confirmed'}));
   const updated=outgoing.map(e=>{const r=statusMap.get(e.id);return r?.status==='accepted'||r?.status==='duplicate'?{...e,status:'confirmed',serverSeq:r.serverSeq}:r?.status==='conflict'||r?.status==='rejected'?{...e,status:'rejected',reason:r.reason}:e;});
   // Canonical remote replaces local entries having the same event ID.
   const byId=new Map([...updated,...remote].map(e=>[e.id,e]));
   await dbMany('events',[...byId.values()]);
   this.conflicts=data.results.filter(r=>r.status==='conflict'||r.status==='rejected').length;
   await dbSet('meta',Date.now(),'lastSync');
   this.lastSuccess=Date.now();this.status='online';this.pending=(await dbAll('events')).filter(e=>e.status==='pending').length;
   this.onChange?.({status:this.status,pending:this.pending,lastSuccess:this.lastSuccess,conflicts:this.conflicts,syncing:false,updated:true});
 }catch(e){this.status=navigator.onLine?'server-down':'offline';this.lastError=String(e.message||e);this.notify();}
 finally{this.active=false;this.syncing=false;this.notify();this.schedule(this.status==='online'?20000:10000);}
 }
}
