const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const save=between('function saveNow(){',"window.addEventListener('beforeunload'");
const overlap=between('function shiftsOverlap(a,b){','\n(()=>{let pending=');
function context(){
 const elements=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',inert:false,onclick:null,classList:{add(){},remove(){}},style:{removeProperty(){}},replaceChildren(){}});return elements.get(id)};
 const c=vm.createContext({console,Date,JSON,clearTimeout,Promise,requests:[],toasts:[],el});
 vm.runInContext(`let project={id:'A'},user={id:'owner'},projects=[project],schedule={people:[],shifts:[]},dirty=true,loading=false,savingPromise=null,changeVersion=0,sessionVersion=0,loadVersion=0,saveTimer=null,page='schedule',appEntering=false;
 const $=el,blank=()=>({people:[],shifts:[]}),norm=x=>x;
 const toast=(...x)=>toasts.push(x),renderProjects=()=>{},nameSide=()=>{},closeModal=()=>{},renderAll=()=>{};
 const sb={from:()=>({upsert:payload=>new Promise((resolve,reject)=>requests.push({payload,resolve,reject})),select:()=>({eq:()=>({maybeSingle:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))})})})};
 ${save}
 ${between('async function selectProject(id){','\nfunction updatePage()')}
 ${overlap}`,c);return c;
}
const tick=()=>new Promise(r=>setImmediate(r));
test('all inline scripts, manifest and worker parse',()=>{
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
 JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 new vm.Script(fs.readFileSync(path.join(root,'sw.js'),'utf8'));
});
test('writes are serialized; latest edit is sent after first response',async()=>{
 const c=context();vm.runInContext('a=saveNow();schedule.shifts.push({id:1});changeVersion++;b=saveNow()',c);
 assert.equal(c.requests.length,1);assert.equal(c.a,c.b);
 c.requests[0].resolve({error:null});await tick();assert.equal(c.requests.length,2);
 assert.equal(c.requests[1].payload.schedule.shifts.length,1);
 c.requests[1].resolve({error:null});assert.equal(await c.a,true);
 assert.equal(vm.runInContext('dirty',c),false);
});
for(const mode of ['response','exception'])test(`failed ${mode} retains changes and allows retry`,async()=>{
 const c=context();vm.runInContext('a=saveNow()',c);
 if(mode==='response')c.requests[0].resolve({error:{message:'offline'}});else c.requests[0].reject(Error('offline'));
 assert.equal(await c.a,false);assert.equal(vm.runInContext('dirty',c),true);
 vm.runInContext('b=flushSchedule()',c);assert.equal(c.requests.length,2);
 c.requests[1].resolve({error:null});assert.equal(await c.b,true);
});
test('failed save blocks switching projects',async()=>{
 const c=context();vm.runInContext("projects.push({id:'B'});a=selectProject('B')",c);
 c.requests[0].resolve({error:{message:'offline'}});await c.a;
 assert.equal(vm.runInContext('project.id',c),'A');assert.equal(c.requests.length,1);
});
test('failed load blocks editing and saving; retry loads original data',async()=>{
 const c=context();vm.runInContext("dirty=false;a=selectProject('A')",c);await tick();
 c.requests[0].resolve({error:{message:'offline'}});await c.a;
 assert.equal(vm.runInContext('project',c),null);await vm.runInContext('saveNow()',c);assert.equal(c.requests.length,1);
 const retry=c.el('retrySchedule').onclick();await tick();
 c.requests[1].resolve({data:{schedule:{people:[{id:1}],shifts:[]}},error:null});await retry;
 assert.equal(vm.runInContext('schedule.people.length',c),1);
});
test('late load from an old session cannot restore its schedule',async()=>{
 const c=context();vm.runInContext("dirty=false;a=selectProject('A')",c);await tick();
 vm.runInContext('sessionVersion++;loadVersion++;project=null;user=null;schedule=blank()',c);
 c.requests[0].resolve({data:{schedule:{people:[{id:99}],shifts:[]}},error:null});await c.a;
 assert.equal(vm.runInContext('schedule.people.length',c),0);
});
test('sign out clears state and inline display overrides',()=>{
 const c=context();const removed=[];for(const id of ['auth','app'])c.el(id).style.removeProperty=p=>removed.push(id+':'+p);
 const body=between("}else if(event==='SIGNED_OUT'){",'\n  }\n});').split("SIGNED_OUT'){")[1];
 vm.runInContext(body,c);
 assert.equal(vm.runInContext('project',c),null);assert.equal(vm.runInContext('projects.length',c),0);
 assert.deepEqual(removed,['auth:display','app:display']);assert.equal(c.el('app').inert,false);
});
test('night overlaps, weekly wrap, touching boundaries and employee isolation',()=>{
 const c=context();const check=(a,b)=>{c.a=a;c.b=b;return vm.runInContext('shiftsOverlap(a,b)',c)};
 const night={id:1,p:1,d:0,s:'22:00',e:'06:00'};
 assert(check(night,{id:2,p:1,d:1,s:'05:00',e:'09:00'}));
 assert(check(night,{id:2,p:1,d:0,s:'23:00',e:'23:30'}));
 assert(check({...night,d:6},{id:2,p:1,d:0,s:'05:00',e:'09:00'}));
 assert(!check(night,{id:2,p:1,d:1,s:'06:00',e:'09:00'}));
 assert(!check(night,{id:2,p:2,d:1,s:'05:00',e:'09:00'}));
 assert(!check(night,night));
});
test('update handler waits for pending writes and stops on failure',async()=>{
 const c=context();c.posted=false;c.reg={waiting:{postMessage:()=>{c.posted=true}}};c.apply={};c.box={remove(){}};
 const handler=between("apply.addEventListener('click',async()=>{",'\n    });').replace("apply.addEventListener('click',",'(')+'})';
 vm.runInContext('updating='+handler+'()',c);assert.equal(c.posted,false);
 c.requests[0].resolve({error:{message:'offline'}});await c.updating;assert.equal(c.posted,false);
 vm.runInContext('updating='+handler+'()',c);c.requests[1].resolve({error:null});await c.updating;assert.equal(c.posted,true);
});
test('sign-out waits for saving and refuses to leave on failure',async()=>{
 const c=context();c.signedOut=0;
 vm.runInContext('sb.auth={signOut:async()=>{signedOut++;return {error:null}}}',c);
 const handler=between("$('logoutBtn').onclick=async()=>{",";window.addEventListener('pagehide'").replace("$('logoutBtn').onclick=",'(')+')';
 vm.runInContext('leaving='+handler+'()',c);assert.equal(c.signedOut,0);
 c.requests[0].resolve({error:{message:'offline'}});await c.leaving;assert.equal(c.signedOut,0);
 vm.runInContext('leaving='+handler+'()',c);c.requests[1].resolve({error:null});await c.leaving;assert.equal(c.signedOut,1);
});
test('controller change waits for pending writes before reload',async()=>{
 const c=context();c.reloads=0;c.window={location:{reload:()=>c.reloads++}};
 vm.runInContext('let reloading=false',c);
 const handler=between("navigator.serviceWorker.addEventListener('controllerchange',()=>{",'\n   });').replace("navigator.serviceWorker.addEventListener('controllerchange',",'(')+'})';
 vm.runInContext(handler+'()',c);assert.equal(c.reloads,0);
 c.requests[0].resolve({error:null});await tick();assert.equal(c.reloads,1);
});
