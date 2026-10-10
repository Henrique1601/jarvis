import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../api/index.mjs';
import { prepareContext, rankNotes, PROMPT_LIMIT } from '../lib/context.mjs';
import { generate } from '../lib/gemini.mjs';
import { BODY_BYTES, body, settings } from '../lib/http.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const SLOT = '22222222-2222-4222-8222-222222222222';
const REV = 'a'.repeat(64);
const ENV = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test',
  JARVIS_AI_PROVIDER: 'gemini_api',
  ALLOWED_EMAILS: 'alice@example.com, bob@example.com', GEMINI_API_KEY: 'private-test-secret', GEMINI_MODEL: 'test-model' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const user = (token = 'alice') => ({ id: token === 'alice' ? ID : SLOT, email: `${token}@example.com`, email_confirmed_at: '2026-10-09T00:00:00Z', is_anonymous: false });

async function invoke({ path = 'state', method = 'GET', data, token = 'alice', env = ENV, fetcher } = {}) {
  const req = { url: `/api/${path}`, method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(data === undefined ? {} : { body: data }) };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.payload = JSON.parse(value); } };
  await createHandler({ env, fetcher })(req, res);
  return { status: res.statusCode, payload: res.payload, headers: res.headers };
}

function fixture(routes = {}, options = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const parsed = new URL(url); const path = parsed.pathname; const token = init.headers?.Authorization?.slice(7);
    calls.push({ path, token, init, data: init.body ? JSON.parse(init.body) : undefined });
    if (path === '/auth/v1/user') return json(options.user ?? user(token));
    if (path.includes(':generateContent')) return json(options.model ?? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Resposta sintética.' }] } }] }, options.modelStatus || 200);
    const name = path.split('/').at(-1);
    if (Object.hasOwn(routes, name)) {
      const value = routes[name]; return typeof value === 'function' ? value(calls.at(-1)) : json(value);
    }
    if (name === 'jarvis_queue_state') return json({ jobs: [], worker: { status: 'offline', lastSeen: null, reason: 'offline' } });
    if (name === 'jarvis_context') return json({ notes: [], tasks: [], messages: [] });
    if (name === 'jarvis_chat_reserve') return json(SLOT);
    if (name === 'jarvis_chat_append') return json({ id: ID, role: 'assistant', content: 'Resposta sintética.', time: '2026-10-09', sources: [] });
    throw new Error(`Unexpected test route ${name}`);
  };
  return { fetcher, calls };
}

test('public config contains only publishable settings; missing allowlist fails closed', async () => {
  const result = await invoke({ path: 'config', token: null, fetcher: () => { throw new Error('must not fetch'); } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, { configured: true, supabaseUrl: ENV.SUPABASE_URL, supabaseAnonKey: ENV.SUPABASE_ANON_KEY });
  assert.ok(!JSON.stringify(result.payload).includes(ENV.GEMINI_API_KEY));
  const env = { ...ENV, ALLOWED_EMAILS: '' };
  const missing = await invoke({ path: 'config', token: null, env });
  assert.equal(missing.payload.configured, false);
  assert.equal((await invoke({ path: 'health', token: null, env })).status, 503);
  assert.equal((await invoke({ env, token: 'alice' })).status, 503);
  assert.equal(settings({ ...ENV, SUPABASE_ANON_KEY: 'sb_secret_hidden' }).configured, false);
  const adminJWT = `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.equal(settings({ ...ENV, SUPABASE_ANON_KEY: adminJWT }).configured, false);
});

test('anonymous, unconfirmed and unauthorized users cannot reach data RPCs', async () => {
  assert.equal((await invoke({ token: null })).status, 401);
  for (const [override, status] of [
    [{ ...user(), is_anonymous: true }, 401], [{ ...user(), email_confirmed_at: null }, 401],
    [{ ...user(), email: 'outsider@example.com' }, 403],
  ]) {
    const mock = fixture({}, { user: override }); const result = await invoke(mock);
    assert.equal(result.status, status); assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].path, '/auth/v1/user');
  }
  const expired = await invoke({ fetcher: async () => json({ message: 'token detail' }, 401) });
  assert.equal(expired.status, 401); assert.ok(!JSON.stringify(expired.payload).includes('token detail'));
});

test('each request forwards its own Bearer and public apikey; no supplied owner enters RPC', async () => {
  const mock = fixture({ jarvis_state: call => json({ messages: [], tasks: [], notes: [{ id: call.token, title: call.token, content: '' }] }),
    jarvis_note_create: call => json({ id: ID, title: call.data.p_title }) });
  const alice = await invoke({ ...mock }); const bob = await invoke({ ...mock, token: 'bob' });
  assert.equal(alice.payload.notes[0].id, 'alice'); assert.equal(bob.payload.notes[0].id, 'bob');
  assert.equal(alice.payload.cloud, true); assert.equal(alice.payload.windows, false); assert.equal(alice.payload.provider, 'gemini_api');
  const created = await invoke({ ...mock, path: 'note', method: 'POST', data: { title: 'Nota', content: 'Texto', owner_id: SLOT } });
  assert.equal(created.status, 201);
  const call = mock.calls.at(-1); assert.equal(call.init.headers.apikey, ENV.SUPABASE_ANON_KEY);
  assert.deepEqual(call.data, { p_title: 'Nota', p_content: 'Texto', p_folder: 'raw' });
  assert.equal(call.token, 'alice'); assert.equal(alice.headers['Cache-Control'], 'no-store');
});

test('optimistic conflicts and restore identifiers are validated without exposing database errors', async () => {
  const mock = fixture({ jarvis_note_update: () => json({ code: 'PT409', message: 'private database detail' }, 409),
    jarvis_note_restore: call => json({ id: call.data.p_id, revision: REV, content: 'Restaurada' }) });
  const conflict = await invoke({ ...mock, path: 'note-update', method: 'POST', data: { id: ID, revision: REV, content: '' } });
  assert.equal(conflict.status, 409); assert.match(conflict.payload.error, /mudou/); assert.ok(!conflict.payload.error.includes('private'));
  const restored = await invoke({ ...mock, path: 'note-restore', method: 'POST', data: { id: ID, version: SLOT, revision: REV } });
  assert.equal(restored.status, 200); assert.deepEqual(mock.calls.at(-1).data, { p_id: ID, p_version: SLOT, p_revision: REV });
  assert.equal((await invoke({ ...mock, path: 'note-read', method: 'POST', data: { id: '../../private' } })).status, 400);
});

test('body byte limit, JSON shape, content limits and task boolean reject malformed requests', async () => {
  await assert.rejects(body({ headers: { 'content-type': 'application/json' }, body: { text: 'á'.repeat(BODY_BYTES) } }), error => error.status === 413);
  await assert.rejects(body({ headers: { 'content-type': 'application/json' }, body: '[]' }), error => error.status === 400);
  await assert.rejects(body({ headers: { 'content-type': 'text/plain' }, body: '{}' }), error => error.status === 415);
  const streamed = { headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { yield Buffer.alloc(BODY_BYTES); yield Buffer.from('x'); } };
  await assert.rejects(body(streamed), error => error.status === 413);
  const mock = fixture();
  assert.equal((await invoke({ ...mock, path: 'chat', method: 'POST', data: { text: 'x'.repeat(12_001) } })).status, 400);
  assert.equal((await invoke({ ...mock, path: 'task', method: 'POST', data: { id: ID, done: 'false' } })).status, 400);
  assert.ok(mock.calls.every(call => call.path === '/auth/v1/user'));
});

test('Vercel rewrite route is validated and empty search returns bounded note previews', async () => {
  const mock = fixture({ jarvis_state: { messages: [], tasks: [], notes: [] },
    jarvis_context: { notes: [{ id: ID, title: 'Nota', content: 'x'.repeat(2000) }], tasks: [], messages: [] } });
  assert.equal((await invoke({ ...mock, path: 'index?route=state' })).status, 200);
  assert.equal((await invoke({ ...mock, path: 'index?route=..%2Fstate' })).status, 404);
  const result = await invoke({ ...mock, path: 'index?route=search', method: 'POST', data: { query: '' } });
  assert.equal(result.status, 200); assert.equal(result.payload.notes[0].content.length, 600);
});

test('bounded context retrieves evidence after 20k with accent offsets, exact sources and JSON escapes', () => {
  const content = 'início inútil\n'.repeat(2200) + 'Evidência: configuração secreta "aspas" \\ caminho.\n';
  const notes = [{ id: ID, title: 'Configuração', content }, { id: SLOT, title: 'Irrelevante', content: 'nada aqui' }];
  const request = 'Explique a configuração' + '\\"\n'.repeat(2500);
  const data = { notes, tasks: Array.from({ length: 100 }, (_, id) => ({ id, text: '\\"'.repeat(150), done: false })),
    messages: Array.from({ length: 10 }, () => ({ role: 'user', content: '\\"'.repeat(5000) })) };
  const result = prepareContext(request, data);
  assert.ok(result.prompt.length <= PROMPT_LIMIT); assert.ok(result.prompt.endsWith(request));
  assert.match(result.prompt, /Evidência/); assert.ok(!result.prompt.includes(content.slice(0, 1000)));
  assert.deepEqual(result.sources, [{ id: ID, title: 'Configuração' }]);
  const raw = result.prompt.slice(result.prompt.indexOf('{'), result.prompt.lastIndexOf('\nPedido atual:'));
  const payload = JSON.parse(raw); const part = payload.notes[0].excerpts[0];
  assert.equal(part.text, content.slice(part.start, part.end)); assert.ok(part.start > 20_000);
  assert.deepEqual(prepareContext(request, data), result);
  assert.equal(rankNotes(notes, 'configuracao')[0].id, ID);
});

test('source list includes only notes that actually fit before history', () => {
  const notes = Array.from({ length: 10 }, (_, id) => ({ id: String(id), title: 'alvo', content: 'alvo ' + '\\'.repeat(4000) }));
  const result = prepareContext('alvo ' + 'z'.repeat(11_990), { notes, tasks: [], messages: [] });
  assert.ok(result.sources.length <= 6); assert.ok(result.prompt.length <= PROMPT_LIMIT);
  const payload = JSON.parse(result.prompt.slice(result.prompt.indexOf('{'), result.prompt.lastIndexOf('\nPedido atual:')));
  assert.deepEqual(result.sources.map(source => source.id), payload.notes.map(note => note.id));
});

test('quota rejection happens before model fetch and messages append', async () => {
  const mock = fixture({ jarvis_chat_reserve: () => json({ code: 'PT429' }, 429) });
  const result = await invoke({ ...mock, path: 'chat', method: 'POST', data: { text: 'Olá' } });
  assert.equal(result.status, 429); assert.deepEqual(mock.calls.map(call => call.path), ['/auth/v1/user', '/rest/v1/rpc/jarvis_chat_reserve']);
});

test('chat reserves before Gemini, sends no tools or key in URL, and persists both messages through one RPC', async () => {
  const mock = fixture({ jarvis_context: { notes: [{ id: ID, title: 'Teste', content: 'Teste evidência.' }], tasks: [], messages: [] } });
  const request = 'Teste meu pedido'; const result = await invoke({ ...mock, path: 'chat', method: 'POST', data: { text: request } });
  assert.equal(result.status, 200);
  assert.deepEqual(mock.calls.map(call => call.path), ['/auth/v1/user', '/rest/v1/rpc/jarvis_chat_reserve', '/rest/v1/rpc/jarvis_context', '/v1beta/models/test-model:generateContent', '/rest/v1/rpc/jarvis_chat_append']);
  const model = mock.calls.find(call => call.path.includes(':generateContent'));
  assert.ok(!Object.hasOwn(model.data, 'tools')); assert.equal(model.init.headers['x-goog-api-key'], ENV.GEMINI_API_KEY);
  assert.ok(model.data.contents[0].parts[0].text.endsWith(request));
  assert.equal(mock.calls.at(-1).data.p_slot, SLOT); assert.deepEqual(mock.calls.at(-1).data.p_sources, [{ id: ID, title: 'Teste' }]);
  assert.equal(mock.calls.at(-1).data.p_request, request);
});

test('blocked, incomplete, malformed and tool responses never persist messages', async () => {
  for (const model of [{ promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'shell' } }] } }] }]) {
    const mock = fixture({}, { model }); const result = await invoke({ ...mock, path: 'chat', method: 'POST', data: { text: 'Teste' } });
    assert.equal(result.status, 502); assert.ok(!mock.calls.some(call => call.path.endsWith('jarvis_chat_append')));
  }
  const mock = fixture({}, { modelStatus: 403, model: { error: { message: ENV.GEMINI_API_KEY } } });
  const result = await invoke({ ...mock, path: 'chat', method: 'POST', data: { text: 'Teste' } });
  assert.equal(result.status, 503); assert.ok(!JSON.stringify(result.payload).includes(ENV.GEMINI_API_KEY));
});

test('Gemini transient failures retry once with a shared deadline; timeouts remain safe', async () => {
  let count = 0;
  const answer = await generate('teste', ENV, async () => ++count === 1 ? json({ error: 'private' }, 503)
    : json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] }));
  assert.equal(answer, 'OK'); assert.equal(count, 2);
  await assert.rejects(generate('teste', ENV, async () => { throw new Error('private timeout'); }), error => error.status === 503 && !error.message.includes('private'));
  await assert.rejects(generate('teste', ENV, async () => new Response('{')), error => error.status === 502);
});

test('missing Gemini config keeps state usable and ai-check explicitly performs no paid call', async () => {
  const mock = fixture({ jarvis_state: { notes: [], tasks: [], messages: [] } });
  const env = { ...ENV, GEMINI_API_KEY: '' };
  assert.equal((await invoke({ ...mock, env })).payload.aiInstalled, false);
  assert.equal((await invoke({ ...mock, env, path: 'chat', method: 'POST', data: { text: 'Teste' } })).status, 503);
  const checked = await invoke({ ...mock, path: 'ai-check', method: 'POST', data: {} });
  assert.equal(checked.payload.authenticatedModelTest, false);
  assert.ok(!mock.calls.some(call => call.path.includes(':generateContent')));
});

test('backup returns all snapshot collections and refuses oversized responses without silent truncation', async () => {
  const snapshot = { format: 'jarvis-cloud-v1', exportedAt: '2026-10-09', notes: [{ id: ID, content: 'Inteira' }],
    history: [{ id: SLOT, note_id: ID, content: 'Anterior' }], tasks: [], messages: [] };
  const mock = fixture({ jarvis_backup: snapshot });
  const result = await invoke({ ...mock, path: 'backup', method: 'POST', data: {} });
  assert.deepEqual(result.payload.backup, snapshot);
  const large = fixture({ jarvis_backup: { ...snapshot, notes: [{ content: 'x'.repeat(4_000_001) }] } });
  assert.equal((await invoke({ ...large, path: 'backup', method: 'POST', data: {} })).status, 413);
});

test('schema gates tables and RPCs: RLS, no direct writes, explicit owners, locks and grants', async () => {
  const sql = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  for (const name of ['notes', 'history', 'tasks', 'messages', 'chat_slots', 'allowed_emails']) assert.match(sql, new RegExp(`alter table public.jarvis_${name} enable row level security`));
  assert.match(sql, /foreign key\(note_id, owner_id\)/);
  assert.match(sql, /revoke all on public.jarvis_notes/); assert.ok(!/grant\s+(insert|update|delete|all)\s+on/i.test(sql));
  const functions = [...sql.matchAll(/create or replace function public\.(jarvis_\w+)\([^]*?(?=create or replace function|-- PostgreSQL)/g)];
  for (const [source, name] of functions) {
    assert.match(source, /set search_path = ''/); assert.match(sql, new RegExp(`revoke all on function public.${name.replaceAll('.', '\\.')}\\(`));
    if (!['jarvis_owner', 'jarvis_note_trigger', 'jarvis_can_access'].includes(name)) assert.match(source, /public\.jarvis_owner\(\)/);
  }
  assert.match(sql, /previous\.revision <> p_revision/); assert.match(sql, /for update/);
  assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /count\(\*\)[^]*? >= 20/);
  assert.match(sql, /One SQL statement provides a consistent MVCC snapshot/);
  assert.match(sql, /auth\.users u join public\.jarvis_allowed_emails/);
  assert.match(sql, /jsonb_object_keys\(source\)/); assert.match(sql, /octet_length\(sources::text\)/);
});
