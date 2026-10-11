import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../jarvis-gemini/web/features.js', import.meta.url), 'utf8');
function setup() {
  class Node {
    constructor(tag = 'div', text) { this.tagName = tag; this.textContent = text || ''; this.children = []; this.value = ''; this.dataset = {}; this.events = {}; }
    append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
    prepend(...children) { children.reverse().forEach(child => { child.parentElement = this; this.children.unshift(child); }); }
    before(...children) { if (!this.parentElement) return; const index = this.parentElement.children.indexOf(this); children.forEach(child => child.parentElement = this.parentElement); this.parentElement.children.splice(index, 0, ...children); }
    after(...children) { if (!this.parentElement) return; const index = this.parentElement.children.indexOf(this); children.forEach(child => child.parentElement = this.parentElement); this.parentElement.children.splice(index + 1, 0, ...children); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(key, value) { this.events[key] = value; }
    showModal() { this.open = true; } close() { this.open = false; }
    cloneNode(deep) { const node = new Node(this.tagName, this.textContent); node.value = this.value; if (deep) node.append(...this.children.map(child => child.cloneNode(true))); return node; }
    get firstElementChild() { return this.children[0]; }
    querySelectorAll(selector) { const match = node => selector === 'article.assistant' ? node.tagName === 'article' && node.className === 'message assistant' : selector.startsWith('.') ? node.className === selector.slice(1) : node.tagName === selector; const found = []; for (const child of this.children) { if (match(child)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const nodes = new Map(); const all = []; const get = id => { const actual = all.find(node => node.id === id); if (actual) return actual; if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
  const body = new Node(); for (const key of ['.right','.left','.center','task-form','search-form','chat-form','read-content','prompt','messages','tasks']) body.append(get(key));
  const values = new Map(), calls = [], copied = []; let lock;
  const context = { document: { body, querySelector: get, createElement: tag => { const node = new Node(tag); all.push(node); return node; } }, $: get,
    el: (tag,text,className) => { const node = new Node(tag,text); all.push(node); node.className = className; return node; },
    window: { jarvisPlatform: { account: () => 'owner', onLock: fn => lock = fn, workerLabel: () => 'Windows conectado' }, addEventListener: () => {} },
    navigator: { clipboard: { writeText: async text => copied.push(text) } },
    sessionStorage: { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key), setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) },
    setTimeout: () => {}, notice: text => calls.push({notice:text}), api: async (path,data) => { calls.push({path,data}); return {id:'new'}; }, refresh: async () => {},
    state: { cloud: true, conversations:[{id:'a',title:'Estudos'},{id:'b',title:'Trabalho'}], messages:[{role:'assistant',content:'A',conversationId:'a'},{role:'assistant',content:'B',conversationId:'b'}], jobs: [], notes:[{id:'n',title:'Uma nota',content:'Exemplo',tags:['JS'],folder:'wiki'}], tasks:[{id:'t',text:'Estudar',priority:'high',project:'Curso',dueDate:'2026-10-12'}], worker:{lastSeen:'2026-10-11T12:00:00Z'} },
    selectedNote: {id:'n',revision:'r1',content:'Exemplo'},
    openRead: async () => get('read-dialog').showModal(), tasksRender: () => { get('tasks').replaceChildren(); context.state.tasks.forEach(() => get('tasks').append(new Node('label'))); },
    notesRender: notes => { context.visibleNotes = notes; },
    messagesRender: () => { get('messages').replaceChildren(); context.state.messages.forEach(message => { const article = new Node('article'); article.className = 'message ' + message.role; const actions = new Node(); actions.className = 'message-actions'; article.append(actions); get('messages').append(article); }); },
    renderAssistantMarkdown: text => { const node = new Node(); const pre = new Node('pre'); pre.append(new Node('code',text)); node.append(pre); return node; }
  };
  vm.createContext(context); vm.runInContext(source, context); context.notesRender(context.state.notes);
  return { context, get, calls, values, copied, logout: () => lock('owner') };
}
test('conversation switching isolates messages and account drafts; logout clears only that account', () => {
  const h = setup(); h.context.messagesRender(); assert.equal(h.get('messages').children.length,1);
  h.get('prompt').value='Rascunho A'; h.get('prompt').events.input(); h.get('conversation-select').value='b'; h.get('conversation-select').onchange(); assert.equal(h.get('prompt').value,'');
  h.get('prompt').value='Rascunho B'; h.get('prompt').events.input(); h.get('conversation-select').value='a'; h.get('conversation-select').onchange(); assert.equal(h.get('prompt').value,'Rascunho A');
  h.values.set('jarvis-draft:other:a','Outra conta'); h.logout(); assert.equal(h.values.size,1); assert.equal(h.values.get('jarvis-draft:other:a'),'Outra conta'); assert.equal(h.get('prompt').value,'');
});
test('explicit context defaults empty and task inclusion can be disabled without reading local vault', () => {
  const h = setup(); assert.deepEqual(JSON.parse(JSON.stringify(h.context.window.jarvisFeatures.chatOptions())),{conversationId:'a',contextNoteIds:[],includeTasks:true});
  h.get('include-tasks').checked=false;
  const details = h.get('context-picker'); const check = details.children.at(-1).children[0].children[0]; check.checked=true; check.onchange();
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.window.jarvisFeatures.chatOptions())),{conversationId:'a',contextNoteIds:['n'],includeTasks:false});
});
test('copy actions copy exact response and code through clipboard without executable HTML', async () => {
  const h = setup(); const markdown = h.context.renderAssistantMarkdown('<script>bad</script>'); await markdown.children[1].onclick(); assert.equal(h.copied[0],'<script>bad</script>');
  h.context.messagesRender(); const action = h.get('messages').children[0].children[0].children[0]; await action.onclick(); assert.equal(h.copied[1],'A'); assert.equal(action.textContent,'Copiado ✓');
});
test('folder and tag filters compose with text search and refresh does not discard prompt', () => {
  const h = setup(); h.get('prompt').value='Ainda escrevendo'; const row = h.get('search-form').parentElement.children[h.get('search-form').parentElement.children.indexOf(h.get('search-form'))+1]; row.children[0].value='raw'; row.children[0].onchange(); assert.equal(h.context.visibleNotes.length,0); row.children[0].value='wiki'; row.children[1].value='js'; row.children[1].oninput(); assert.equal(h.context.visibleNotes.length,1); assert.equal(h.get('prompt').value,'Ainda escrevendo');
});
const sw = await readFile(new URL('../frontend/sw.js',import.meta.url),'utf8');
test('service worker never intercepts API, bearer-authenticated requests or external resources', () => {
 const handlers = {}; vm.runInNewContext(sw,{URL,self:{location:{origin:'https://jarvis.test'},addEventListener:(key,fn)=>handlers[key]=fn}});
 for(const request of [{url:'https://jarvis.test/api/state',method:'GET'}, {url:'https://jarvis.test/style.css',method:'GET',auth:true},{url:'https://else.test/style.css',method:'GET'}]) { let intercepted=false; handlers.fetch({request:{...request,headers:{has:()=>Boolean(request.auth)}},respondWith:()=>intercepted=true}); assert.equal(intercepted,false); }
});

test('accepting an old conversation clears only its unchanged draft and preserves active editing', () => {
 const h=setup(); h.get('prompt').value='Enviado A'; h.get('prompt').events.input(); h.get('conversation-select').value='b'; h.get('conversation-select').onchange(); h.get('prompt').value='Enviado A'; h.get('prompt').events.input();
 h.context.window.jarvisFeatures.acceptedDraft('Enviado A','a'); assert.equal(h.values.has('jarvis-draft:owner:a'),false); assert.equal(h.get('prompt').value,'Enviado A'); assert.equal(h.values.get('jarvis-draft:owner:b'),'Enviado A');
 h.values.set('jarvis-draft:owner:a','Texto revisado'); h.context.window.jarvisFeatures.acceptedDraft('Enviado A','a'); assert.equal(h.values.get('jarvis-draft:owner:a'),'Texto revisado');
});
test('context selection enforces six notes and refresh removes deleted note identifiers', () => {
 const h=setup(); h.context.state.notes=Array.from({length:7},(_,index)=>({id:'n'+index,title:'Nota '+index,content:'Texto',folder:'raw'})); h.context.notesRender(h.context.state.notes); const checks=h.get('context-picker').children.at(-1).children.map(row=>row.children[0]);
 for(const check of checks) { check.checked=true; check.onchange(); }
 assert.equal(h.context.window.jarvisFeatures.chatOptions().contextNoteIds.length,6); assert.equal(checks[6].checked,false);
 h.context.state.notes=h.context.state.notes.slice(1); h.context.notesRender(h.context.state.notes); assert.equal(h.context.window.jarvisFeatures.chatOptions().contextNoteIds.includes('n0'),false);
});

test('migrated conversations never offer an empty legacy destination for chats', () => {
 const h=setup(); assert.ok(h.get('conversation-select').children.every(option=>option.value)); assert.equal(h.get('conversation-select').value,'a');
 h.context.messagesRender(); assert.equal(h.get('messages').children.length,1); assert.equal(h.context.window.jarvisFeatures.chatOptions().conversationId,'a');
});
