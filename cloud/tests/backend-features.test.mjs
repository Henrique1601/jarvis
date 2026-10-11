import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/index.mjs';
import { prepareContext } from '../lib/context.mjs';
const ID='11111111-1111-4111-8111-111111111111';
const ENV={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',ALLOWED_EMAILS:'alice@example.com'};
async function call(path,data){
 const calls=[];
 const fetcher=async(url,options)=>{const name=new URL(url).pathname.split('/').at(-1);calls.push({name,data:options.body?JSON.parse(options.body):null});return new Response(JSON.stringify(name==='user'?{id:ID,email:'alice@example.com',email_confirmed_at:'2026-10-11',is_anonymous:false}:{id:ID}));};
 const res={setHeader(){},end(s){this.payload=JSON.parse(s);}};
 await createHandler({env:ENV,fetcher})({url:`/api/${path}`,method:'POST',body:data,headers:{authorization:'Bearer owner','content-type':'application/json'}},res);
 return {status:res.statusCode,payload:res.payload,calls};
}
test('conversation endpoints forward scoped identifiers and title only',async()=>{
 const a=await call('conversation',{title:'Estudos',owner_id:'forged'});assert.equal(a.status,201);assert.deepEqual(a.calls.at(-1),{name:'jarvis_conversation_create',data:{p_title:'Estudos'}});
 assert.equal((await call('conversation-update',{id:ID,title:'Projetos'})).status,200);
 assert.equal((await call('conversation-update',{id:'bad',title:'Projetos'})).status,400);
});
test('task details validate calendar dates, priority and optional done',async()=>{
 for(const dueDate of ['2026-02-30','2026-13-01','tomorrow'])assert.equal((await call('task-details',{text:'Estudar',dueDate})).status,400);
 const r=await call('task-details',{text:'Estudar',dueDate:'2026-10-12',priority:'high',project:'JavaScript'});assert.equal(r.status,201);assert.equal(r.calls.at(-1).data.p_due_date,'2026-10-12');assert.equal(r.calls.at(-1).data.p_project,'JavaScript');assert.equal(r.calls.at(-1).data.p_done,null);
 assert.equal((await call('task-details',{text:'Estudar',priority:'urgent'})).status,400);
});
test('note metadata validates revision and bounded tags/folder',async()=>{
 const r=await call('note-metadata',{id:ID,revision:'a'.repeat(64),folder:'wiki',tags:['JS','JS','Estudos']});assert.equal(r.status,200);assert.deepEqual(r.calls.at(-1).data.p_tags,['JS','Estudos']);
 for(const extra of [{revision:'bad'},{tags:Array(11).fill('x')},{tags:['']},{folder:'private'}])assert.equal((await call('note-metadata',{id:ID,revision:'a'.repeat(64),folder:'raw',tags:[],...extra})).status,400);
});
test('queue context explicit empty differs from automatic and excludes forged owner',async()=>{
 const r=await call('chat',{text:'Oi',requestId:ID,conversationId:ID,contextNoteIds:[],includeTasks:false,owner_id:'forged'});assert.equal(r.status,202);assert.deepEqual(r.calls.at(-1),{name:'jarvis_chat_enqueue_options',data:{p_request:'Oi',p_request_id:ID,p_conversation_id:ID,p_context_note_ids:[],p_include_tasks:false}});
 const auto=await call('chat',{text:'Oi',requestId:ID,conversationId:ID});assert.equal(auto.calls.at(-1).data.p_context_note_ids,null);
 for(const extra of [{contextNoteIds:Array(7).fill(ID)},{contextNoteIds:['bad']},{includeTasks:'yes'}])assert.equal((await call('chat',{text:'Oi',requestId:ID,...extra})).status,400);
});
test('explicit unrelated note remains selected while empty context has no sources',()=>{
 const note={id:ID,title:'Biologia',content:'Células e organismos'};
 assert.equal(prepareContext('Explique JavaScript',{notes:[note]}).sources.length,0);
 assert.equal(prepareContext('Explique JavaScript',{notes:[note],explicitNotes:true}).sources.length,1);
 assert.equal(prepareContext('Explique JavaScript',{notes:[],explicitNotes:true}).sources.length,0);
});
