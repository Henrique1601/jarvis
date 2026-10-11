import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdir, mkdtemp, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('frontend/platform.js', root), 'utf8');
const appSource = await readFile(new URL('../jarvis-gemini/web/app.js', root), 'utf8');
const workspaceSource = await readFile(new URL('../jarvis-gemini/web/workspace.js', root), 'utf8');
const owner = { user: { email: 'owner@example.test' }, access_token: 'fixture-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
const storageKey = 'sb-fixture-auth-token';
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

function harness({ session = null, sessionError = null, signInError = null, configured = true, state = () => response(200, {}), api = () => response(200, {}), signOutError = null, refreshError = null,
  sharedStorage = storage(), tabStorage = storage(), useStoredSession = false } = {}) {
  class Element {
    constructor() { this.hidden = false; this.disabled = false; this.value = ''; this.textContent = ''; this.children = []; }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    getContext() { return new Proxy({}, { get: () => () => {} }); }
    reportValidity() { return true; }
    querySelector(selector) { return selector.startsWith('.') ? this.children.find(child => child.className === selector.slice(1)) || null : this.children[0] || new Element(); }
  }
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  get('auth-email').value = 'owner@example.test'; get('auth-password').value = 'fixture-password';
  const classes = new Set(['cloud-locked']);
  const body = new Element(); body.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
  const calls = []; const subscribers = []; let sdkOptions; let reloads = 0; let ready = false;
  const timers = new Map(); let timerId = 0; let uuidId = 0;
  const documentEvents = new Map(); const windowEvents = new Map();
  const client = { auth: {
    getSession: async () => ({ data: { session: useStoredSession
      ? JSON.parse((sdkOptions?.auth.storage || sharedStorage).getItem(storageKey) || 'null') : session }, error: sessionError }),
    refreshSession: async () => ({ data: { session: refreshError ? null : { ...owner, access_token: 'refreshed-token' } }, error: refreshError }),
    onAuthStateChange: fn => { subscribers.push(fn); },
    signInWithPassword: async () => ({ data: { session: signInError ? null : owner }, error: signInError }),
    signOut: async () => ({ error: signOutError }),
    updateUser: async value => { calls.push({ passwordUpdate: value.password }); return { error: null }; }
  } };
  const context = {
    window: { addEventListener: (name, fn) => windowEvents.set(name, fn) },
    document: { hidden: false, getElementById: get, createElement: () => new Element(), createTextNode: text => ({ textContent: String(text), children: [] }), body, querySelector: get,
      querySelectorAll: selector => selector === 'dialog[open]' ? [...nodes.values()].filter(node => node.open) : [], addEventListener: (name, fn) => documentEvents.set(name, fn) },
    location: { origin: 'https://jarvis.example.test', reload: () => { reloads++; } },
    sessionStorage: tabStorage, localStorage: sharedStorage, queueMicrotask, URL, Blob,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidId).padStart(12, '0')}` },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: () => 0, requestAnimationFrame: () => {}, devicePixelRatio: 1, matchMedia: () => ({ matches: true }),
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === '/api/config') return response(200, configured ? { configured: true, supabaseUrl: 'https://fixture.supabase.co', supabaseAnonKey: 'sb_publishable_fixture' } : { configured: false });
      return url === '/api/state' ? state() : api(url, options);
    },
    __test: { createClient: (_url, _key, options) => { sdkOptions = options; return client; } }
  };
  vm.runInNewContext(source.replace(/^import \{ createClient \} from '@supabase\/supabase-js';/, 'const { createClient } = __test;'), context);
  context.window.jarvisPlatform.ready.then(() => { ready = true; });
  return { context, get, calls, classes, client, get sdkOptions() { return sdkOptions; }, get ready() { return ready; }, get reloads() { return reloads; },
    timers, mountApp: () => vm.runInContext(appSource, context), mountWorkspace: () => vm.runInContext(workspaceSource, context),
    tick: async (ms = 5000) => { const entry = [...timers].find(([, value]) => value.ms === ms); if (entry) { timers.delete(entry[0]); await entry[1].fn(); } await flush(); },
    visibility: async hidden => { context.document.hidden = hidden; documentEvents.get('visibilitychange')?.(); await flush(); },
    online: async () => { windowEvents.get('online')?.(); await flush(); },
    emit: (event, value = session) => subscribers.forEach(fn => fn(event, value)),
    logout: () => get('.header-right').children[0].children[1].onclick() };
}

const jobFixture = { id: '00000000-0000-4000-8000-000000000099', text: 'Pedido de teste', status: 'queued', createdAt: '2026-10-10T08:00:00Z', expiresAt: '2026-10-17T08:00:00Z', position: 2 };
const queueState = (jobs = [jobFixture]) => ({ cloud: true, windows: false, provider: 'Antigravity no Windows', aiInstalled: false,
  worker: { status: 'offline', reason: 'connection_error' }, notes: [], tasks: [], messages: [], jobs, vault: 'Supabase' });
const treeText = node => [node.textContent, ...(node.children || []).map(treeText)].join(' ');

test('idle Windows availability refreshes every 30 seconds and switches to five seconds for pending jobs', async () => {
  let current = queueState([]);
  const h = harness({ session: owner, state: () => response(200, current) });
  await flush(); h.mountApp(); await flush();
  assert.equal([...h.timers.values()][0]?.ms, 30000);
  current = { ...queueState([]), worker: { status: 'ready' } }; await h.tick(30000);
  assert.match(h.get('ai-status').textContent, /Windows conectado/);
  current = queueState(); await h.tick(30000);
  assert.equal([...h.timers.values()][0]?.ms, 5000);
  current = queueState([{ ...jobFixture, status: 'completed' }]); await h.tick();
  assert.equal([...h.timers.values()][0]?.ms, 30000);
  await h.visibility(true); assert.equal(h.timers.size, 0);
  await h.visibility(false); assert.equal([...h.timers.values()][0]?.ms, 30000);
});

test('poll recovery removes its warning and never overwrites an unrelated send error', async () => {
  let failed = false;
  const h = harness({ session: owner, state: () => {
    if (failed) throw Error('synthetic-network-error');
    return response(200, queueState());
  } }); await flush();
  failed = true; await h.tick(); assert.match(h.get('notice').textContent, /Atualização da fila indisponível/);
  failed = false; await h.tick(); assert.equal(h.get('notice').textContent, '');
  failed = true; await h.tick();
  h.get('notice').textContent = 'Não foi possível enviar a mensagem.';
  failed = false; await h.tick(); assert.equal(h.get('notice').textContent, 'Não foi possível enviar a mensagem.');
  failed = true; await h.tick(); assert.equal(h.get('notice').textContent, 'Não foi possível enviar a mensagem.');
});

test('an old poll cannot display its failure or alter the timer after a fresh login', async () => {
  let blocked = false, release;
  const h = harness({ session: owner, state: () => blocked
    ? new Promise(resolve => { release = resolve; }) : response(200, queueState()) }); await flush();
  blocked = true; const pending = h.tick(); await flush();
  h.emit('SIGNED_OUT', null); blocked = false; h.emit('SIGNED_IN', owner); await flush();
  const timer = [...h.timers.keys()][0];
  release(response(503, { error: 'old-request-error' })); await pending;
  assert.equal(h.get('notice').textContent, '');
  assert.equal([...h.timers.keys()][0], timer);
  assert.equal(h.context.window.jarvisPlatform.active(), true);
});

test('queue retries retain the request UUID after uncertain delivery but new text gets a new UUID', async () => {
  let failed = true;
  const h = harness({ session: owner, state: () => response(200, queueState([])), api: () => {
    if (failed) throw Error('synthetic-network-error');
    return response(202, { jobId: jobFixture.id, status: 'queued', expiresAt: jobFixture.expiresAt });
  } }); await flush();
  await assert.rejects(h.context.window.jarvisPlatform.submitChat('Primeiro texto'));
  await assert.rejects(h.context.window.jarvisPlatform.submitChat('Primeiro texto'));
  failed = false; await h.context.window.jarvisPlatform.submitChat('Outro texto');
  await h.context.window.jarvisPlatform.submitChat('Outro texto');
  const bodies = h.calls.filter(call => call.url === '/api/chat').map(call => JSON.parse(call.options.body));
  assert.equal(bodies[0].requestId, bodies[1].requestId);
  assert.notEqual(bodies[1].requestId, bodies[2].requestId);
  assert.notEqual(bodies[2].requestId, bodies[3].requestId);
  assert.match(bodies[0].requestId, /^[a-f0-9-]{36}$/);
});

test('queue polling shares state requests, pauses hidden tabs and slows after terminal jobs', async () => {
  let jobs = [jobFixture]; let release;
  const h = harness({ session: owner, state: () => release ? new Promise(resolve => { release = resolve; }) : response(200, queueState(jobs)) });
  await flush(); await h.context.window.jarvisPlatform.state();
  assert.equal(h.timers.size, 1);
  let emissions = 0; h.context.window.jarvisPlatform.onState(() => { emissions++; });
  release = true;
  const first = h.context.window.jarvisPlatform.state(); const second = h.context.window.jarvisPlatform.state(); await flush();
  assert.equal(h.calls.filter(call => call.url === '/api/state').length, 3);
  const resolveState = release; release = null; resolveState(response(200, queueState(jobs))); await Promise.all([first, second]);
  await h.visibility(true); assert.equal(h.timers.size, 0);
  jobs = [{ ...jobFixture, status: 'completed' }]; await h.visibility(false);
  assert.equal(emissions, 1); assert.equal([...h.timers.values()][0]?.ms, 30000);
});

test('queue renders only noncompleted requests once and cancellation refreshes state', async () => {
  let jobs = [jobFixture, { ...jobFixture, id: 'done', status: 'completed', text: 'Já no histórico' }];
  const h = harness({ session: owner, state: () => response(200, queueState(jobs)), api: (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { jobId: jobFixture.id }); jobs = [{ ...jobFixture, status: 'cancelled' }]; return response(200, {});
  } }); await flush();
  const platform = h.context.window.jarvisPlatform; const box = h.get('messages');
  platform.renderJobs(box, queueState(jobs)); platform.renderJobs(box, queueState(jobs));
  assert.equal(box.children.length, 1); assert.doesNotMatch(treeText(box), /Já no histórico/);
  assert.match(treeText(box), /Posição 2.*7 dias/);
  const cancel = box.children[0].children.find(child => child.className === 'cloud-job').children.find(child => child.textContent === 'Cancelar pedido');
  await cancel.onclick(); assert.match(treeText(box), /Cancelado/);
});

test('SQL jobId payloads retain distinct requests and cancellation uses the selected job', async () => {
  const sqlJob = { ...jobFixture, jobId: jobFixture.id }; delete sqlJob.id;
  const otherJob = { ...sqlJob, jobId: '00000000-0000-4000-8000-000000000088', text: 'Outro pedido', status: 'processing' };
  const h = harness({ session: owner, state: () => response(200, queueState([sqlJob, otherJob])), api: () => response(200, {}) }); await flush();
  h.context.window.jarvisPlatform.renderJobs(h.get('messages'), queueState([sqlJob, otherJob]));
  const rows = h.get('messages').children[0].children.filter(child => child.className === 'cloud-job');
  assert.equal(rows.length, 2);
  const selected = rows.find(row => treeText(row).includes('Outro pedido'));
  await selected.children.find(child => child.textContent === 'Cancelar pedido').onclick();
  assert.deepEqual(JSON.parse(h.calls.find(call => call.url === '/api/chat-cancel').options.body), { jobId: otherJob.jobId });
});

test('cloud composer enqueues while Windows is offline without duplicating pending history', async () => {
  let jobs = [];
  const h = harness({ session: owner, state: () => response(200, queueState(jobs)), api: () => { jobs = [jobFixture]; return response(202, { jobId: jobFixture.id, status: 'queued' }); } });
  await flush(); h.mountApp(); await flush();
  h.get('prompt').value = jobFixture.text; await h.get('chat-form').onsubmit({ preventDefault() {} });
  assert.equal(h.get('prompt').value, ''); assert.equal(h.get('send').disabled, false);
  assert.equal(treeText(h.get('messages')).split(jobFixture.text).length - 1, 1);
  assert.match(h.get('ai-status').textContent, /Windows.*offline/i);
});

test('blocked Antigravity clearly waits for permission but still accepts queued requests and memory', async () => {
  const blocked = { ...queueState(), worker: { status: 'blocked', reason: 'policy_unverified' } };
  const h = harness({ session: owner, state: () => response(200, blocked), api: url => response(url === '/api/chat' ? 202 : 201, { jobId: jobFixture.id, status: 'queued' }) });
  await flush(); h.mountApp(); await flush();
  assert.match(h.get('ai-status').textContent, /Antigravity desativado.*não confirmada.*7 dias/);
  assert.doesNotMatch(h.get('ai-status').textContent, /offline/);
  h.get('prompt').value = 'Pedido aguardando liberação'; await h.get('chat-form').onsubmit({ preventDefault() {} });
  await h.context.window.jarvisPlatform.request('note', { title: 'Memória', content: 'Continua disponível' });
  assert.equal(h.calls.filter(call => call.url === '/api/chat').length, 1);
  assert.equal(h.calls.filter(call => call.url === '/api/note').length, 1);
  assert.equal(h.get('send').disabled, false);
});

test('polling completes a queued conversation once, then resumes on browser connection recovery', async () => {
  let current = queueState();
  const h = harness({ session: owner, state: () => response(200, current) });
  await flush(); h.mountApp(); await flush();
  current = { ...queueState([{ ...jobFixture, status: 'completed' }]), messages: [{ role: 'user', content: jobFixture.text }, { role: 'assistant', content: 'Resposta concluída' }] };
  await h.tick();
  assert.equal(treeText(h.get('messages')).split(jobFixture.text).length - 1, 1);
  assert.equal(treeText(h.get('messages')).split('Resposta concluída').length - 1, 1);
  assert.equal([...h.timers.values()][0]?.ms, 30000);
  current = queueState([{ ...jobFixture, status: 'processing' }]); await h.online();
  assert.equal(h.timers.size, 1); assert.match(treeText(h.get('messages')), /Processando no Windows/);
  const count = h.calls.length; await h.tick(); assert.equal(h.calls.length, count + 1); assert.equal(h.timers.size, 1);
});

test('temporary queue outage preserves visible pending jobs and continues polling', async () => {
  let current = queueState();
  const h = harness({ session: owner, state: () => response(200, current) }); await flush(); h.mountApp(); await flush();
  current = { ...queueState(), queuesUnavailable: true, worker: { status: 'error', reason: 'connection_error' } }; delete current.jobs;
  await h.tick();
  assert.match(treeText(h.get('messages')), /Pedido de teste/); assert.equal(h.timers.size, 1);
  current = queueState([{ ...jobFixture, status: 'cancelled' }]); await h.tick(); assert.equal([...h.timers.values()][0]?.ms, 30000);
});

test('a slow refresh cannot release the composer while a subsequent POST is pending', async () => {
  let readBlocked = false, resolveRead, resolveSecondPost; let posts = 0;
  const h = harness({ session: owner, state: () => readBlocked ? new Promise(resolve => { resolveRead = resolve; }) : response(200, queueState([])),
    api: () => ++posts === 1 ? response(202, { jobId: jobFixture.id, status: 'queued' }) : new Promise(resolve => { resolveSecondPost = resolve; }) });
  await flush(); h.mountApp(); await flush(); readBlocked = true;
  h.get('prompt').value = 'Primeiro'; const first = h.get('chat-form').onsubmit({ preventDefault() {} }); await flush();
  assert.equal(h.get('send').disabled, false);
  h.get('prompt').value = 'Segundo'; const second = h.get('chat-form').onsubmit({ preventDefault() {} }); await flush(); assert.equal(h.get('send').disabled, true);
  readBlocked = false; resolveRead(response(200, queueState())); await first;
  assert.equal(h.get('send').disabled, true);
  resolveSecondPost(response(202, { jobId: jobFixture.id, status: 'queued' })); await second;
  assert.equal(h.get('send').disabled, false); assert.equal(posts, 2);
});

test('queue labels never echo unknown worker or CLI details and render requests as text', async () => {
  const h = harness({ session: owner }); await flush();
  const data = { ...queueState([{ ...jobFixture, text: '<script>fixture</script>', status: 'failed', errorCode: 'PRIVATE_CLI_DETAIL' }]), worker: { status: 'error', reason: 'PRIVATE_WORKER_DETAIL' } };
  h.context.window.jarvisPlatform.renderJobs(h.get('messages'), data);
  assert.doesNotMatch(treeText(h.get('messages')), /PRIVATE_CLI_DETAIL|PRIVATE_WORKER_DETAIL/);
  assert.match(treeText(h.get('messages')), /<script>fixture<\/script>/);
  assert.equal(h.get('messages').children[0].children.find(child => child.className === 'cloud-job').children[0].children.length, 0);
  for (const [reason, pattern] of [['login_required', /Google/], ['quota_exceeded', /Limite/], ['policy_unverified', /inicialização/], ['connection_error', /Sem conexão/]])
    assert.match(h.context.window.jarvisPlatform.workerLabel({ status: 'paused', reason }), pattern);
});

test('definite chat rejection releases its UUID while a server error retains it', async () => {
  let status = 503;
  const h = harness({ session: owner, state: () => response(200, queueState([])), api: () => response(status, { error: 'Erro seguro' }) }); await flush();
  for (const next of [503, 400, 400]) { status = next; await assert.rejects(h.context.window.jarvisPlatform.submitChat('Mesmo texto')); }
  const bodies = h.calls.filter(call => call.url === '/api/chat').map(call => JSON.parse(call.options.body));
  assert.equal(bodies[0].requestId, bodies[1].requestId); assert.notEqual(bodies[1].requestId, bodies[2].requestId);
});

test('account change before queue refresh prevents a request under the new account', async () => {
  const sharedStorage = storage({ [storageKey]: JSON.stringify(owner) });
  const h = harness({ sharedStorage, useStoredSession: true, state: () => response(200, queueState()) }); await flush();
  sharedStorage.setItem(storageKey, JSON.stringify({ ...owner, user: { email: 'another@example.test' } }));
  const count = h.calls.length;
  await assert.rejects(h.context.window.jarvisPlatform.state(), /conta mudou/);
  assert.equal(h.calls.length, count); assert.ok(h.classes.has('cloud-locked')); assert.equal(h.timers.size, 0);
});

test('cloud diagnostics checks a blocked Windows worker without Gemini API configuration advice', async () => {
  const worker = { status: 'blocked', reason: 'policy_unverified' };
  const h = harness({ session: owner, state: () => response(200, queueState()), api: () => response(200, { cloud: true, provider: 'antigravity_windows', compatible: false, worker,
    version: 'fixture', cli: 'Worker no Windows', login: 'Conta Jarvis autorizada', issues: [] }) });
  await flush(); h.mountApp(); h.mountWorkspace(); await flush();
  const tools = h.get('.right').children[0]; await tools.children[1].onclick();
  assert.match(treeText(h.get('diagnostic-content')), /Antigravity no Windows.*inicialização não confirmada/);
  assert.doesNotMatch(treeText(h.get('diagnostic-content')), /Gemini API|GEMINI_API_KEY/);
  assert.equal(h.get('test-ai').disabled, false); assert.equal(h.get('test-ai').textContent, 'Verificar worker ↗');
});

test('logout and account changes discard in-flight queue state and stop private polling', async () => {
  let release = null;
  const h = harness({ session: owner, state: () => release ? new Promise(resolve => { release = resolve; }) : response(200, queueState()) });
  await flush(); await h.context.window.jarvisPlatform.state();
  let emissions = 0; h.context.window.jarvisPlatform.onState(() => { emissions++; });
  release = true; const pending = h.context.window.jarvisPlatform.state(); await flush();
  h.emit('SIGNED_OUT', null); const resolveState = release; release = null; resolveState(response(200, queueState()));
  await assert.rejects(pending); await flush();
  assert.equal(emissions, 0); assert.equal(h.timers.size, 0);
  const count = h.calls.length; await h.visibility(false); await h.online(); assert.equal(h.calls.length, count);
});

test('confirmed logout closes private dialogs and stops queue polling even without an SDK event', async () => {
  const h = harness({ session: owner, state: () => response(200, queueState()) }); await flush();
  h.get('note-dialog').showModal(); await h.logout();
  assert.equal(h.get('note-dialog').open, false); assert.ok(h.classes.has('cloud-locked')); assert.equal(h.timers.size, 0);
  await assert.rejects(h.context.window.jarvisPlatform.state(), /Entre/);
});

test('unconfigured auth stays locked and never creates an SDK client', async () => {
  const h = harness({ configured: false }); await flush();
  assert.equal(h.sdkOptions, undefined); assert.equal(h.ready, false);
  assert.ok(h.classes.has('cloud-locked')); assert.equal(h.get('auth-submit').disabled, true);
  assert.equal(h.get('auth-signup').disabled, true); assert.equal(h.get('auth-reset').disabled, true);
  assert.match(h.get('auth-notice').textContent, /configuração/);
});

test('session recovery error permits a fresh login while private UI stays locked', async () => {
  const h = harness({ sessionError: Error('synthetic-initial-session-error') }); await flush();
  assert.equal(h.ready, false); assert.ok(h.classes.has('cloud-locked'));
  assert.equal(h.calls.filter(call => call.url === '/api/state').length, 0);
  assert.match(h.get('auth-notice').textContent, /Entre novamente/);
  for (const id of ['auth-submit', 'auth-signup', 'auth-reset']) assert.equal(h.get(id).disabled, false);
  let signIns = 0;
  h.client.auth.signInWithPassword = async () => { signIns++; return { data: { session: owner }, error: null }; };
  await h.get('cloud-login').onsubmit({ preventDefault() {} }); await flush();
  assert.equal(signIns, 1); assert.equal(h.ready, true); assert.equal(h.reloads, 1);
  assert.equal(h.calls.filter(call => call.url === '/api/state').length, 1);
  assert.equal(h.get('auth-password').value, '');
});

for (const [label, fields, expected] of [
  ['invalid credentials', { code: 'invalid_credentials', status: 400 }, /E-mail ou senha incorretos.*Esqueci minha senha/],
  ['unconfirmed email', { code: 'email_not_confirmed', status: 400 }, /confirme seu e-mail/i],
  ['rate limit code', { code: 'over_request_rate_limit' }, /Aguarde alguns minutos/],
  ['rate limit status', { status: 429 }, /Aguarde alguns minutos/],
  ['retryable fetch', { name: 'AuthRetryableFetchError' }, /conexão.*indisponível/],
  ['request timeout', { code: 'request_timeout' }, /conexão.*indisponível/],
  ['service failure', { status: 503 }, /conexão.*indisponível/],
  ['unknown provider detail', { code: 'unrecognized_fixture_error', status: 400 }, /Não foi possível entrar/]
]) {
  test(`login maps ${label} safely and keeps private UI locked`, async () => {
    const h = harness({ signInError: { ...fields, message: 'PRIVATE_PROVIDER_DETAIL_FIXTURE' } }); await flush();
    await h.get('cloud-login').onsubmit({ preventDefault() {} }); await flush();
    assert.match(h.get('auth-notice').textContent, expected);
    assert.doesNotMatch(h.get('auth-notice').textContent, /PRIVATE_PROVIDER_DETAIL_FIXTURE|unrecognized_fixture_error/);
    assert.equal(h.ready, false); assert.ok(h.classes.has('cloud-locked'));
    assert.equal(h.get('cloud-auth').hidden, false);
    assert.equal(h.calls.filter(call => call.url === '/api/state').length, 0);
    assert.equal(h.get('auth-submit').disabled, false);
  });
}

test('unexpected login rejection never echoes provider details', async () => {
  const h = harness(); await flush();
  h.client.auth.signInWithPassword = async () => { throw Error('PRIVATE_PROVIDER_DETAIL_FIXTURE'); };
  await h.get('cloud-login').onsubmit({ preventDefault() {} });
  assert.match(h.get('auth-notice').textContent, /Não foi possível entrar/);
  assert.doesNotMatch(h.get('auth-notice').textContent, /PRIVATE_PROVIDER_DETAIL_FIXTURE/);
  assert.equal(h.ready, false); assert.ok(h.classes.has('cloud-locked'));
  assert.equal(h.get('auth-submit').disabled, false);
});

test('session alone never unlocks: state must first authorize the account', async () => {
  let authorize;
  const h = harness({ session: owner, state: () => new Promise(resolve => { authorize = resolve; }) });
  await flush(); assert.equal(h.ready, false); assert.ok(h.classes.has('cloud-locked'));
  authorize(response(200, {})); await flush();
  assert.equal(h.ready, true); assert.equal(h.get('cloud-auth').hidden, true);
  const stateCall = h.calls.find(call => call.url === '/api/state');
  assert.equal(stateCall.options.headers.Authorization, 'Bearer fixture-token');
});

test('403 retains its cause and token refresh cannot unlock an unauthorized account', async () => {
  const h = harness({ session: owner, state: () => response(403, { error: 'Conta não autorizada.' }) });
  await flush(); const before = h.calls.length;
  assert.equal(h.ready, false); assert.match(h.get('auth-notice').textContent, /não autorizada/);
  h.emit('TOKEN_REFRESHED', owner); await flush();
  assert.ok(h.classes.has('cloud-locked')); assert.equal(h.get('cloud-auth').hidden, false);
  assert.equal(h.calls.length, before);
});

test('API requests send bearer tokens and a later 401 restores the login panel', async () => {
  const h = harness({ session: owner, api: () => response(401, { error: 'Sua sessão expirou.' }) });
  await flush(); assert.equal(h.ready, true);
  await assert.rejects(h.context.window.jarvisPlatform.request('task', { text: 'Fixture' }), /expirou/);
  const call = h.calls.find(call => call.url === '/api/task');
  assert.equal(call.options.headers.Authorization, 'Bearer fixture-token');
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.equal(call.options.headers['X-Jarvis-Token'], undefined);
  assert.ok(h.classes.has('cloud-locked')); assert.equal(h.get('cloud-auth').hidden, false);
  h.emit('TOKEN_REFRESHED', owner); await flush(); assert.ok(h.classes.has('cloud-locked'));
});

test('failed session refresh restores login before any protected API call', async () => {
  const h = harness({ session: { ...owner, expires_at: 1 }, refreshError: Error('synthetic-sdk-error') });
  await flush();
  await assert.rejects(h.context.window.jarvisPlatform.request('task', {}), /expirou/);
  assert.equal(h.calls.filter(call => call.url === '/api/task').length, 0);
  assert.ok(h.classes.has('cloud-locked')); assert.equal(h.get('cloud-auth').hidden, false);
});

test('logout reports SDK failure without pretending success, and success reloads', async () => {
  const failed = harness({ session: owner, signOutError: Error('synthetic-sdk-error') }); await flush();
  await failed.logout(); assert.equal(failed.reloads, 0); assert.match(failed.get('notice').textContent, /sessão continua aberta/);
  const ok = harness({ session: owner }); await flush(); await ok.logout(); assert.equal(ok.reloads, 1);
});

test('email recovery uses a flow without a tab-local verifier and hides private UI', async () => {
  const h = harness(); await flush();
  assert.equal(h.sdkOptions.auth.flowType, 'implicit');
  assert.equal(h.sdkOptions.auth.storage, undefined, 'SDK browser default shares localStorage across tabs.');
  h.emit('PASSWORD_RECOVERY', owner); await flush();
  assert.ok(h.classes.has('cloud-locked')); assert.equal(h.get('cloud-login').hidden, true);
  assert.equal(h.get('cloud-recovery').hidden, false);
  h.get('auth-new-password').value = 'new-fixture-password';
  await h.get('cloud-recovery').onsubmit({ preventDefault() {}, currentTarget: h.get('cloud-recovery') });
  assert.equal(h.calls.find(call => call.passwordUpdate)?.passwordUpdate, 'new-fixture-password');
  assert.equal(h.get('auth-new-password').value, ''); assert.equal(h.reloads, 1);
});

test('SIGNED_IN broadcast with no stored session cannot unlock the original tab', async () => {
  const h = harness(); await flush();
  h.emit('SIGNED_IN', owner); await flush();
  assert.equal(h.ready, false);
  assert.ok(h.classes.has('cloud-locked'));
  assert.equal(h.calls.filter(call => call.url === '/api/state').length, 0);
});

test('login in a second tab makes the original tab ready and API calls use its shared session', async () => {
  const sharedStorage = storage();
  const first = harness({ sharedStorage, useStoredSession: true });
  const second = harness({ sharedStorage, useStoredSession: true });
  await flush(); assert.equal(first.ready, false); assert.equal(second.ready, false);
  // The SDK in the signing-in tab writes before publishing SIGNED_IN.
  sharedStorage.setItem(storageKey, JSON.stringify(owner));
  first.emit('SIGNED_IN', owner); second.emit('SIGNED_IN', owner); await flush();
  assert.equal(first.ready, true); assert.equal(second.ready, true);
  await first.context.window.jarvisPlatform.request('task', { text: 'Fixture' });
  assert.equal(first.calls.find(call => call.url === '/api/task').options.headers.Authorization, 'Bearer fixture-token');
});

test('existing tab session migrates once into shared storage without overwriting a newer login', async () => {
  const legacy = { ...owner, refresh_token: 'fixture-refresh' };
  const tabStorage = storage({ [storageKey]: JSON.stringify(legacy), 'other-project-auth': 'untouched' });
  const sharedStorage = storage();
  const h = harness({ tabStorage, sharedStorage, useStoredSession: true }); await flush();
  assert.equal(h.ready, true); assert.deepEqual(JSON.parse(sharedStorage.getItem(storageKey)), legacy);
  assert.equal(tabStorage.getItem(storageKey), null); assert.equal(tabStorage.getItem('other-project-auth'), 'untouched');
  const newer = { ...legacy, access_token: 'newer-fixture-token' };
  const olderTab = storage({ [storageKey]: JSON.stringify(legacy) });
  sharedStorage.setItem(storageKey, JSON.stringify(newer));
  harness({ tabStorage: olderTab, sharedStorage, useStoredSession: true }); await flush();
  assert.equal(JSON.parse(sharedStorage.getItem(storageKey)).access_token, 'newer-fixture-token');
  assert.equal(olderTab.getItem(storageKey), null);
});

test('changing the shared account reloads with the previous private UI hidden', async () => {
  const sharedStorage = storage({ [storageKey]: JSON.stringify(owner) });
  const h = harness({ sharedStorage, useStoredSession: true }); await flush();
  assert.equal(h.ready, true);
  const another = { ...owner, user: { email: 'another@example.test' } };
  sharedStorage.setItem(storageKey, JSON.stringify(another));
  h.emit('SIGNED_IN', another); await flush();
  assert.equal(h.reloads, 1); assert.ok(h.classes.has('cloud-locked'));
});

test('build exports only browser assets and excludes vault, runtime, conversation and environment secrets', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'jarvis-cloud-build-'));
  try {
    const cloud = join(temporary, 'cloud'); const shared = join(temporary, 'jarvis-gemini', 'web');
    await mkdir(join(cloud, 'frontend'), { recursive: true }); await mkdir(shared, { recursive: true });
    for (const asset of ['index.html', 'style.css', 'workspace.css', 'app.js', 'workspace.js'])
      await copyFile(new URL('../jarvis-gemini/web/' + asset, root), join(shared, asset));
    await copyFile(new URL('frontend/cloud.css', root), join(cloud, 'frontend', 'cloud.css'));
    const require = createRequire(import.meta.url);
    const sdk = require.resolve('@supabase/supabase-js').replaceAll('\\', '/');
    await writeFile(join(cloud, 'frontend', 'platform.js'), source.replace("'@supabase/supabase-js'", JSON.stringify(sdk)));
    const esbuild = pathToFileURL(require.resolve('esbuild')).href;
    const build = await readFile(new URL('build.mjs', root), 'utf8');
    await writeFile(join(cloud, 'build.mjs'), build.replace("'esbuild'", JSON.stringify(esbuild)));
    const privateMarker = 'SYNTHETIC-DO-NOT-PUBLISH';
    await mkdir(join(temporary, 'jarvis-gemini', 'vault'), { recursive: true });
    await mkdir(join(temporary, 'jarvis-gemini', '.tools', 'antigravity'), { recursive: true });
    await writeFile(join(temporary, 'jarvis-gemini', 'vault', 'private.md'), privateMarker);
    await writeFile(join(temporary, 'jarvis-gemini', '.tools', 'antigravity', 'agy.exe'), privateMarker);
    await writeFile(join(temporary, 'CONVERSA-JARVIS.md'), privateMarker);
    await writeFile(join(cloud, '.env'), 'GEMINI_API_KEY=' + privateMarker);
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
      TMP: process.env.TMP, GEMINI_API_KEY: privateMarker };
    await promisify(execFile)(process.execPath, [join(cloud, 'build.mjs')], { env, timeout: 30_000 });
    const assets = (await readdir(join(cloud, 'public'))).sort();
    assert.deepEqual(assets, ['app.js', 'cloud.css', 'index.html', 'platform.js', 'style.css', 'workspace.css', 'workspace.js']);
    for (const asset of assets) assert.ok(!(await readFile(join(cloud, 'public', asset), 'utf8')).includes(privateMarker), asset);
    const html = await readFile(join(cloud, 'public', 'index.html'), 'utf8');
    assert.ok(html.indexOf('src="/platform.js"') < html.indexOf('src="/app.js"'));
    assert.match(html, /id="cloud-recovery"/); assert.match(html, /class="cloud-locked"/);
    assert.match(html, /Antigravity no Windows/); assert.match(html, /CONFIGURAR-WORKER\.bat/);
    assert.doesNotMatch(html, /Gemini API|GEMINI_API_KEY/);
    assert.ok(!html.includes('CONFIGURAR-ANTIGRAVITY.bat'));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
