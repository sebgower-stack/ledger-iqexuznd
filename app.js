'use strict';
const VERSION='2 Nov, 11:16am';
const K='ledger.vault.v1',KA='ledger.attempts',ITER=600000,IDLE_MS=5*60*1000;
const $=s=>document.querySelector(s),enc=new TextEncoder(),dec=new TextDecoder();
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))),ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const FREQ={weekly:52,fortnightly:26,monthly:12,quarterly:4,annual:1};
const FL={weekly:'Weekly',fortnightly:'Fortnightly',monthly:'Monthly',quarterly:'Quarterly',annual:'Annual'};
const nz=new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD',maximumFractionDigits:0});
const nz2=new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'});
const uid=()=>b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g,'x');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let KEY=null,SALT=null,S=null,hiddenAt=0,view='dash',outView='monthly';

function seed(){const o=(name,freq,notes='')=>({id:uid(),type:'out',name,amount:'',freq,next:'',notes});
 const i=(name,freq,notes='')=>({id:uid(),type:'in',name,amount:'',freq,next:'',notes});
 return{balance:'',items:[o('Southern Cross health insurance','monthly'),o('New Shoots daycare','weekly'),o('Council rates','quarterly','Tauranga City Council'),
 o('Car insurance','monthly'),o('Mortgage','fortnightly'),o('Power','monthly'),o('Internet / phone','monthly'),o('Groceries','weekly'),o('Fuel','weekly'),
 o('KiwiSaver / savings','weekly'),o('Subscriptions','monthly'),o('Other','monthly'),
 i('Seb pay','weekly','Net, after tax'),i('Shelby pay','weekly','Net, after tax'),i('FamilyBoost rebate','quarterly'),i('Other income','monthly')],tx:[],theme:''};}

// ---- crypto ----
async function derive(pass,salt){const base=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITER},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function seal(obj,key,salt){const iv=crypto.getRandomValues(new Uint8Array(12));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(obj)));
 return{v:1,app:'ledger',kdf:'PBKDF2-SHA256',iter:ITER,salt:b64(salt),iv:b64(iv),ct:b64(ct)};}
async function open(blob,pass){const salt=ub64(blob.salt),key=await derive(pass,salt);
 const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(blob.iv)},key,ub64(blob.ct));return{key,salt,data:JSON.parse(dec.decode(pt))};}
async function save(){if(!KEY)return;localStorage.setItem(K,JSON.stringify(await seal(S,KEY,SALT)));}

// ---- lock ----
const vault=()=>{try{return JSON.parse(localStorage.getItem(K))}catch{return null}};
const att=()=>JSON.parse(localStorage.getItem(KA)||'{"n":0,"until":0}');
function lockUI(){const v=vault();$('#lock').classList.remove('hide');$('#app').classList.add('hide');$('#pc1').value='';$('#pc2').value='';
 const first=!v;$('#pc2').classList.toggle('hide',!first);$('#lockwarn').classList.toggle('hide',!first);$('#importfirst').classList.toggle('hide',!first);
 $('#lockbtn').textContent=first?'Create passcode':'Unlock';$('#lockmsg').textContent=first?'Choose a passcode (8+ characters) to encrypt your budget on this device.':'Locked. Enter your passcode.';$('#lockerr').textContent='';}
function lock(){KEY=null;S=null;$('#view').innerHTML='';lockUI();}
$('#lockform').addEventListener('submit',async e=>{e.preventDefault();const p=$('#pc1').value,v=vault(),err=$('#lockerr');
 const a=att();if(Date.now()<a.until){err.textContent=`Too many attempts. Try again in ${Math.ceil((a.until-Date.now())/1000)}s.`;return;}
 $('#lockbtn').disabled=true;err.textContent='Working…';
 try{if(!v){if(p.length<8)throw new Error('Use at least 8 characters.');if(p!==$('#pc2').value)throw new Error('Passcodes don’t match.');
   SALT=crypto.getRandomValues(new Uint8Array(16));KEY=await derive(p,SALT);S=seed();await save();}
  else{try{const r=await open(v,p);KEY=r.key;SALT=r.salt;S=r.data;localStorage.removeItem(KA);}
   catch{a.n++;// slowdown: after 5 wrong attempts, exponential delay
    if(a.n>=5)a.until=Date.now()+Math.min(30000*2**(a.n-5),3600000);localStorage.setItem(KA,JSON.stringify(a));
    throw new Error(a.n>=5?`Wrong passcode. Locked for ${Math.round((a.until-Date.now())/1000)}s.`:`Wrong passcode (${5-a.n} tries before a delay).`);}}
  err.textContent='';start();}
 catch(x){err.textContent=x.message;KEY=null}finally{$('#lockbtn').disabled=false}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();if(KEY)lock();}});
let idleT;const bump=()=>{clearTimeout(idleT);idleT=setTimeout(()=>KEY&&lock(),IDLE_MS)};['pointerdown','keydown'].forEach(ev=>addEventListener(ev,bump));
$('#lockNow').onclick=lock;

// ---- maths ----
const num=x=>{const n=parseFloat(String(x).replace(/[,$\s]/g,''));return isFinite(n)?n:0};
const yearly=it=>num(it.amount)*(FREQ[it.freq]||12);
function totals(){const r={inY:0,outY:0};S.items.forEach(it=>{if(it.type==='in')r.inY+=yearly(it);else r.outY+=yearly(it)});r.inM=r.inY/12;r.outM=r.outY/12;r.netM=r.inM-r.outM;r.rate=r.inY?(r.inY-r.outY)/r.inY:0;return r;}
const addP=(d,f)=>{d=new Date(d);if(f==='weekly')d.setDate(d.getDate()+7);else if(f==='fortnightly')d.setDate(d.getDate()+14);else d.setMonth(d.getMonth()+({monthly:1,quarterly:3,annual:12}[f]||1));return d};
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
function occurrences(it,from,to){const out=[];if(!num(it.amount))return out;let d=it.next?new Date(it.next+'T00:00'):null;
 if(!d){return null}while(d<from)d=addP(d,it.freq);while(d<=to){out.push(new Date(d));d=addP(d,it.freq)}return out;}
function projection(){const t0=today(),pts=[];let bal=num(S.balance);
 for(let m=0;m<12;m++){const a=new Date(t0.getFullYear(),t0.getMonth()+m,m?1:t0.getDate()),b=new Date(t0.getFullYear(),t0.getMonth()+m+1,0);
  S.items.forEach(it=>{const occ=occurrences(it,a,b);const amt=occ?occ.length*num(it.amount):yearly(it)/12;bal+=it.type==='in'?amt:-amt});
  S.tx.forEach(x=>{const d=new Date(x.date+'T00:00');if(d>=a&&d<=b&&d>t0)bal+=x.type==='in'?num(x.amount):-num(x.amount)});
  pts.push({label:a.toLocaleDateString('en-NZ',{month:'short'}),bal});}return pts;}
function upcoming(){const a=today(),b=new Date(+a+14*864e5),r=[];S.items.filter(i=>i.type==='out').forEach(it=>(occurrences(it,a,b)||[]).forEach(d=>r.push({d,it})));
 S.tx.filter(x=>x.type==='out').forEach(x=>{const d=new Date(x.date+'T00:00');if(d>=a&&d<=b)r.push({d,it:{name:x.name,amount:x.amount}})});return r.sort((x,y)=>x.d-y.d);}

// ---- charts ----
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function cv(el,h){const dpr=devicePixelRatio||1,w=el.clientWidth;el.width=w*dpr;el.height=h*dpr;el.style.height=h+'px';const c=el.getContext('2d');c.scale(dpr,dpr);return[c,w,h];}
const PAL=['#14a06b','#e0663f','#3b82f6','#f2b134','#8b5cf6','#06b6d4','#ef4444','#84cc16','#ec4899','#64748b','#f97316','#0ea5e9'];
function donut(el,data){const[c,w,h]=cv(el,200),tot=data.reduce((s,d)=>s+d.v,0),cx=w/2,cy=100,R=88,r=58;let a=-Math.PI/2;
 if(!tot){c.strokeStyle=css('--bd');c.lineWidth=R-r;c.beginPath();c.arc(cx,cy,(R+r)/2,0,7);c.stroke();}
 data.forEach((d,i)=>{const e=a+d.v/tot*Math.PI*2;c.beginPath();c.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);c.arc(cx,cy,R,a,e);c.arc(cx,cy,r,e,a,true);c.closePath();c.fillStyle=PAL[i%PAL.length];c.fill();a=e});
 c.fillStyle=css('--tx');c.textAlign='center';c.font='700 18px system-ui';c.fillText(nz.format(tot),cx,cy+2);c.font='12px system-ui';c.fillStyle=css('--mu');c.fillText('per month',cx,cy+20);}
function line(el,pts){const[c,w,h]=cv(el,180),p=28,vals=pts.map(x=>x.bal),mn=Math.min(0,...vals),mx=Math.max(1,...vals),X=i=>p+i*(w-p-8)/(pts.length-1),Y=v=>10+(h-36)*(1-(v-mn)/(mx-mn||1));
 c.strokeStyle=css('--bd');c.beginPath();c.moveTo(p,Y(0));c.lineTo(w-8,Y(0));c.stroke();
 const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#14a06b55');g.addColorStop(1,'#14a06b00');
 c.beginPath();pts.forEach((q,i)=>i?c.lineTo(X(i),Y(q.bal)):c.moveTo(X(i),Y(q.bal)));c.lineTo(X(pts.length-1),Y(mn));c.lineTo(X(0),Y(mn));c.fillStyle=g;c.fill();
 c.beginPath();pts.forEach((q,i)=>i?c.lineTo(X(i),Y(q.bal)):c.moveTo(X(i),Y(q.bal)));c.strokeStyle=vals.at(-1)<0?'#e0663f':'#14a06b';c.lineWidth=2.5;c.stroke();
 c.fillStyle=css('--mu');c.font='10px system-ui';c.textAlign='center';pts.forEach((q,i)=>i%2===0&&c.fillText(q.label,X(i),h-6));}
function bars(el,inM,outM){const[c,w,h]=cv(el,70),mx=Math.max(inM,outM,1);[['In',inM,'#14a06b'],['Out',outM,'#e0663f']].forEach(([l,v,col],i)=>{const y=8+i*30;
 c.fillStyle=css('--bd');c.fillRect(40,y,w-130,20);c.fillStyle=col;c.fillRect(40,y,(w-130)*v/mx,20);c.fillStyle=css('--tx');c.font='600 13px system-ui';c.textAlign='left';c.fillText(l,0,y+15);c.textAlign='right';c.fillText(nz.format(v),w,y+15)});}

// ---- views ----
function render(){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===view));const V=$('#view');
 if(view==='dash')return dash(V);if(view==='out'||view==='in')return list(V,view);if(view==='tx')return txs(V);return settings(V);}
function dash(V){const t=totals(),pr=projection(),up=upcoming(),filled=S.items.filter(i=>num(i.amount)).length;
 const st=!t.inY?['Add your income to start','ok']:t.rate>=.15?['On track 🎉','good']:t.rate>=0?['Tight but positive','ok']:['Spending more than earning','bad'];
 const cats=S.items.filter(i=>i.type==='out'&&num(i.amount)).map(i=>({n:i.name,v:yearly(i)/12})).sort((a,b)=>b.v-a.v);
 V.innerHTML=`<section class="card hero"><h2>Net per month</h2><div class="big">${nz.format(t.netM)}</div>
 <span class="pill ${st[1]}">${st[0]}</span><div class="grid mt"><div class="stat">In / month<b>${nz.format(t.inM)}</b></div><div class="stat">Out / month<b>${nz.format(t.outM)}</b></div>
 <div class="stat">Savings rate<b>${t.inY?Math.round(t.rate*100)+'%':'—'}</b></div><div class="stat">Net / year<b>${nz.format(t.inY-t.outY)}</b></div></div></section>
 ${filled<3?`<section class="card"><h2>Get started</h2><p>Fill in amounts on the <b>Out</b> and <b>In</b> tabs, and set your current balance in <b>Settings</b>. ${filled}/${S.items.length} filled.</p></section>`:''}
 <section class="card"><h2>In vs out · monthly</h2><canvas id="cb"></canvas><div class="tiny muted">Weekly: in ${nz.format(t.inY/52)} · out ${nz.format(t.outY/52)}</div></section>
 <section class="card"><h2>Balance projection · 12 months</h2><canvas id="cl"></canvas><div class="tiny muted">From current balance ${nz.format(num(S.balance))} → ${nz.format(pr.at(-1).bal)}</div></section>
 <section class="card"><h2>Where it goes</h2><canvas id="cd"></canvas><div class="legend">${cats.map((c,i)=>`<span><i></i>${esc(c.n)}</span>`).join('')||'<span class="empty">No expenses entered yet</span>'}</div></section>
 <section class="card"><h2>Bills in the next 14 days</h2>${up.length?up.map(u=>`<div class="row"><div><div class="n">${esc(u.it.name)}</div><div class="s">${u.d.toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short'})}</div></div><div class="amt o">${nz2.format(num(u.it.amount))}</div></div>`).join(''):'<div class="empty">Nothing due — set “next due” dates on your bills.</div>'}</section>`;
 // canvas legend colours are data-driven; CSP blocks inline style attrs? style-src 'self' blocks style attributes -> set via JS
 V.querySelectorAll('.legend i').forEach((el,i)=>el.style.background=PAL[i%PAL.length]);
 bars($('#cb'),t.inM,t.outM);line($('#cl'),pr);donut($('#cd'),cats);}
function list(V,type){const items=S.items.filter(i=>i.type===type),sum=items.reduce((s,i)=>s+yearly(i),0),div={weekly:52,monthly:12,yearly:1}[outView];
 V.innerHTML=`<section class="card"><h2>${type==='out'?'Recurring money out':'Money in'}</h2><div class="seg">${['weekly','monthly','yearly'].map(k=>`<button data-k="${k}" class="${k===outView?'on':''}">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div>
 <div class="big amt ${type==='out'?'o':'i'}">${nz.format(sum/div)}<span class="tiny muted"> / ${outView.replace('ly','').replace('dai','day')}</span></div></section>
 <section class="card">${items.map(i=>`<div class="row" data-id="${i.id}"><div><div class="n">${esc(i.name)}</div><div class="s">${FL[i.freq]}${i.next?' · next '+new Date(i.next+'T00:00').toLocaleDateString('en-NZ',{day:'numeric',month:'short'}):''}${i.notes?' · '+esc(i.notes):''}</div></div>
 <div class="amt ${type==='out'?'o':'i'}">${num(i.amount)?nz2.format(num(i.amount))+'<div class="s">≈ '+nz.format(yearly(i)/div)+'/'+outView.slice(0,-2).replace('year','yr').replace('week','wk').replace('month','mo')+'</div>':'<span class="empty">Tap to add</span>'}</div></div>`).join('')}</section>
 <button class="fab" aria-label="Add">+</button>`;
 V.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{outView=b.dataset.k;render()});
 V.querySelectorAll('.row').forEach(r=>r.onclick=()=>editItem(S.items.find(i=>i.id===r.dataset.id)));V.querySelector('.fab').onclick=()=>editItem({id:uid(),type,name:'',amount:'',freq:'monthly',next:'',notes:''},true);}
function txs(V){const l=[...S.tx].sort((a,b)=>b.date.localeCompare(a.date));
 V.innerHTML=`<section class="card"><h2>One-off transactions</h2>${l.length?l.map(x=>`<div class="row" data-id="${x.id}"><div><div class="n">${esc(x.name)}</div><div class="s">${new Date(x.date+'T00:00').toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}${x.notes?' · '+esc(x.notes):''}</div></div><div class="amt ${x.type==='out'?'o':'i'}">${x.type==='out'?'−':'+'}${nz2.format(num(x.amount))}</div></div>`).join(''):'<div class="empty">None yet. Future-dated one-offs feed the balance projection.</div>'}</section><button class="fab" aria-label="Add">+</button>`;
 V.querySelectorAll('.row').forEach(r=>r.onclick=()=>editTx(S.tx.find(x=>x.id===r.dataset.id)));V.querySelector('.fab').onclick=()=>editTx({id:uid(),type:'out',name:'',amount:'',date:new Date().toLocaleDateString('en-CA'),notes:''},true);}
function settings(V){V.innerHTML=`<section class="card"><h2>Current balance</h2><input id="bal" inputmode="decimal" placeholder="e.g. 5000" value="${esc(S.balance)}"><div class="tiny muted">Starting point for the 12‑month projection.</div></section>
 <section class="card"><h2>Encrypted backup</h2><p class="tiny muted">The file stays encrypted with your passcode. Save it to iCloud/Drive, or import it on Shelby’s phone (same passcode).</p><div class="btns"><button id="exp" class="btn">Export backup</button><button id="imp" class="btn">Import backup</button></div></section>
 <section class="card"><h2>Passcode</h2><button id="chg" class="btn">Change passcode</button><p class="warn mt">Forgotten passcode = data can’t be recovered. Keep a backup.</p></section>
 <section class="card"><h2>Privacy</h2><p class="tiny">All data is stored only on this device, encrypted with AES‑256‑GCM. The key is derived from your passcode (PBKDF2‑SHA256, ${ITER.toLocaleString()} iterations, random salt) and never stored. No analytics, no servers, no third‑party code. Locks when you leave the app or after 5 minutes idle.</p></section>
 <section class="card"><button id="wipe" class="btn danger">Erase all data on this device</button></section><p class="tiny muted">Version ${VERSION}</p>`;
 $('#bal').onchange=e=>{S.balance=e.target.value;save()};$('#exp').onclick=exportB;$('#imp').onclick=()=>$('#file').click();$('#chg').onclick=changePass;
 $('#wipe').onclick=()=>{if(confirm('Erase everything on this device? This cannot be undone.')){localStorage.removeItem(K);lock()}};}

// ---- dialogs ----
function dialog(html,onSave,onDel){const f=$('#dform');f.innerHTML=html+`<div class="btns">${onDel?'<button type="button" id="ddel" class="btn danger">Delete</button>':''}<button type="button" id="dcan" class="btn">Cancel</button><button type="submit" class="btn primary">Save</button></div>`;
 const d=$('#dlg');f.onsubmit=e=>{e.preventDefault();onSave(new FormData(f));d.close();save();render()};$('#dcan').onclick=()=>d.close();
 if(onDel)$('#ddel').onclick=()=>{if(confirm('Delete this?')){onDel();d.close();save();render()}};d.showModal();}
const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${k===v?'selected':''}>${l}</option>`).join('');
function editItem(it,isNew){dialog(`<h3>${isNew?'Add':'Edit'} ${it.type==='out'?'expense':'income'}</h3><label>Name</label><input name="name" required value="${esc(it.name)}">
 <label>Amount (NZD per payment)</label><input name="amount" inputmode="decimal" value="${esc(it.amount)}" placeholder="0.00"><label>Frequency</label><select name="freq">${opt(FL,it.freq)}</select>
 <label>Next due / paid date</label><input name="next" type="date" value="${esc(it.next)}"><label>Notes</label><textarea name="notes" rows="2">${esc(it.notes)}</textarea>`,
 fd=>{Object.assign(it,{name:fd.get('name'),amount:fd.get('amount'),freq:fd.get('freq'),next:fd.get('next'),notes:fd.get('notes')});if(isNew)S.items.push(it)},isNew?null:()=>S.items=S.items.filter(i=>i!==it));}
function editTx(x,isNew){dialog(`<h3>${isNew?'Add':'Edit'} one-off</h3><label>Type</label><select name="type">${opt({out:'Money out',in:'Money in'},x.type)}</select><label>Description</label><input name="name" required value="${esc(x.name)}">
 <label>Amount (NZD)</label><input name="amount" inputmode="decimal" required value="${esc(x.amount)}"><label>Date</label><input name="date" type="date" required value="${esc(x.date)}"><label>Notes</label><textarea name="notes" rows="2">${esc(x.notes)}</textarea>`,
 fd=>{Object.assign(x,{type:fd.get('type'),name:fd.get('name'),amount:fd.get('amount'),date:fd.get('date'),notes:fd.get('notes')});if(isNew)S.tx.push(x)},isNew?null:()=>S.tx=S.tx.filter(i=>i!==x));}
function changePass(){dialog(`<h3>Change passcode</h3><label>New passcode (8+)</label><input name="a" type="password" minlength="8" required><label>Confirm</label><input name="b" type="password" required>`,
 async fd=>{if(fd.get('a')!==fd.get('b')){alert('Passcodes don’t match');return}SALT=crypto.getRandomValues(new Uint8Array(16));KEY=await derive(fd.get('a'),SALT);await save();alert('Passcode changed. Old backups still need the old passcode.')});}
async function exportB(){await save();const blob=new Blob([localStorage.getItem(K)],{type:'application/json'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`ledger-backup-${new Date().toLocaleDateString('en-CA')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
$('#file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const b=JSON.parse(await f.text());if(b.app!=='ledger'||!b.ct)throw 0;
 const p=prompt('Passcode for this backup:');if(p==null)return;const r=await open(b,p);if(KEY&&!confirm('Replace the data on this device with the backup?'))return;
 localStorage.setItem(K,JSON.stringify(b));KEY=r.key;SALT=r.salt;S=r.data;start();}catch{alert('Could not open that backup (wrong passcode or not a Ledger file).')}};
$('#importfirst').onclick=()=>$('#file').click();

// ---- shell ----
function applyTheme(){const t=(S&&S.theme)||localStorage.getItem('ledger.theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}
$('#theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';localStorage.setItem('ledger.theme',t);S.theme=t;applyTheme();save();render()};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.v;render();scrollTo(0,0)});
function start(){$('#lock').classList.add('hide');$('#app').classList.remove('hide');applyTheme();render();bump();}
addEventListener('resize',()=>KEY&&view==='dash'&&render());
$('#ver').textContent='Updated '+VERSION;applyTheme();lockUI();
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').then(r=>{setInterval(()=>r.update(),60000);document.addEventListener('visibilitychange',()=>!document.hidden&&r.update())}).catch(()=>{});
 const hadCtl=!!navigator.serviceWorker.controller;let rl=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadCtl&&!rl&&!KEY&&!$('#lockbtn').disabled&&!$('#pc1').value){rl=true;location.reload()}});}
