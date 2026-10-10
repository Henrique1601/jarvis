import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createHandler } from '../api/index.mjs';
import { settings } from '../lib/http.mjs';
import { WORKER_STATUSES, WORKER_REASONS, FAILURE_CODES } from '../lib/queue.mjs';

const JOB = '11111111-1111-4111-8111-111111111111';
const DEVICE = '22222222-2222-4222-8222-222222222222';
const ATTEMPT = '33333333-3333-4333-8333-333333333333';
const TOKEN = Buffer.alloc(32, 23).toString('base64url');
const HASH = createHash('sha256').update(TOKEN).digest('hex');
const ENV = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test',
  ALLOWED_EMAILS: 'alice@example.com,bob@example.com', JARVIS_AI_PROVIDER: 'antigravity_windows',
  JARVIS_ANTIGRAVITY_ENABLED: 'false', GEMINI_API_KEY: 'must-never-fallback', GEMINI_MODEL: 'test-model' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const routes = values => {
  const calls = [];
  return { calls, fetcher: async (url, options = {}) => {
    const name = new URL(url).pathname.split('/').at(-1);
    const params = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ name, params, headers: options.headers });
    if (name === 'user') return json({ id: JOB, email: 'alice@example.com', email_confirmed_at: '2026-10-10', is_anonymous: false });
    if (Object.hasOwn(values, name)) return typeof values[name] === 'function' ? values[name](params) : json(values[name]);
    throw new Error(`Unexpected route ${name}`);
  } };
};
async function invoke(mock, { path = 'chat', method = 'POST', data = {}, env = ENV, deviceToken = TOKEN, auth = 'alice' } = {}) {
  const req = { url: `/api/${path}`, method, body: data,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(deviceToken ? { 'x-jarvis-device-token': deviceToken } : {}) } };
  const res = { setHeader() {}, end(raw) { this.payload = JSON.parse(raw); } };
  await createHandler({ env, fetcher: mock.fetcher })(req, res);
  return { ...res.payload, httpStatus: res.statusCode };
}

test('provider defaults to the Windows queue; gate is strict false and Gemini credentials never imply fallback', async () => {
  assert.equal(settings({ ...ENV, JARVIS_AI_PROVIDER: undefined }).provider, 'antigravity_windows');
  for (const flag of [undefined, 'TRUE', '1', 'yes', 'false']) assert.equal(settings({ ...ENV, JARVIS_ANTIGRAVITY_ENABLED: flag }).antigravityEnabled, false);
  const mock = routes({ jarvis_chat_enqueue: { jobId: JOB, status: 'queued', expiresAt: '2026-10-17' } });
  const result = await invoke(mock, { data: { text: 'Pedido intacto  ', requestId: ATTEMPT, owner_id: DEVICE, sources: ['forged'] } });
  assert.equal(result.httpStatus, 202); assert.equal(result.jobId, JOB);
  assert.deepEqual(mock.calls.at(-1).params, { p_request: 'Pedido intacto  ', p_request_id: ATTEMPT });
  assert.deepEqual(mock.calls.map(c => c.name), ['user', 'jarvis_chat_enqueue']);
  assert.ok(!JSON.stringify(result).includes(ENV.GEMINI_API_KEY));
});

test('enqueue requires idempotency UUID, bounded nonempty text and owner authentication', async () => {
  const mock = routes({});
  for (const data of [{ text: 'Hello' }, { text: 'Hello', requestId: 'bad' }, { text: '', requestId: ATTEMPT }, { text: 'x'.repeat(12001), requestId: ATTEMPT }])
    assert.equal((await invoke(mock, { data })).httpStatus, 400);
  assert.equal((await invoke(mock, { data: { text: 'Hello', requestId: ATTEMPT }, auth: null })).httpStatus, 401);
  assert.ok(mock.calls.every(c => c.name === 'user'));
});

test('offline status lookup preserves query UUID through the Vercel rewrite and cancel works while blocked', async () => {
  const mock = routes({ jarvis_chat_job: p => json({ jobId: p.p_id, status: 'queued' }), jarvis_chat_cancel: { jobId: JOB, status: 'cancelled' } });
  const result = await invoke(mock, { path: `index?route=chat-job&id=${JOB}`, method: 'GET' });
  assert.equal(result.httpStatus, 200); assert.equal(result.jobId, JOB);
  assert.equal((await invoke(mock, { path: 'chat-job?id=bad', method: 'GET' })).httpStatus, 400);
  const cancelled = await invoke(mock, { path: 'chat-cancel', data: { jobId: JOB, owner_id: DEVICE } });
  assert.equal(cancelled.httpStatus, 200); assert.equal(cancelled.status, 'cancelled'); // HTTP remains distinct from payload status.
  assert.deepEqual(mock.calls.at(-1).params, { p_id: JOB });
});

test('registration creates a random 32-byte token once and database receives only its hash', async () => {
  const mock = routes({ jarvis_worker_register: { deviceId: DEVICE } });
  const a = await invoke(mock, { path: 'worker-register' });
  const b = await invoke(mock, { path: 'worker-register' });
  assert.equal(a.httpStatus, 201); assert.equal(a.deviceId, DEVICE); assert.notEqual(a.deviceToken, b.deviceToken);
  assert.equal(Buffer.from(a.deviceToken, 'base64url').length, 32);
  assert.equal(mock.calls[1].params.p_token_hash, createHash('sha256').update(a.deviceToken).digest('hex'));
  assert.ok(!JSON.stringify(mock.calls).includes(a.deviceToken));
  assert.ok(!Object.hasOwn(a, 'token_hash'));
});

test('claim/start cannot dispatch through the disabled server gate, even with a live device and Gemini key', async () => {
  const mock = routes({});
  for (const [path, data] of [['worker-claim', { deviceId: DEVICE }], ['worker-start', { deviceId: DEVICE, jobId: JOB, attemptId: ATTEMPT }]])
    assert.equal((await invoke(mock, { path, data })).httpStatus, 503);
  assert.ok(mock.calls.every(c => c.name === 'user'));
});

test('worker routes reject malformed tokens, unsafe state/reasons and error text before any RPC', async () => {
  const mock = routes({});
  const valid = { deviceId: DEVICE, status: 'blocked', reason: 'policy_unverified' };
  for (const token of [null, 'secret', 'a'.repeat(10000), '!'.repeat(43)])
    assert.equal((await invoke(mock, { path: 'worker-heartbeat', data: valid, deviceToken: token })).httpStatus, 403);
  for (const data of [{ ...valid, status: 'made-up' }, { ...valid, reason: 'my private secret error' }])
    assert.equal((await invoke(mock, { path: 'worker-heartbeat', data })).httpStatus, 400);
  assert.equal((await invoke(mock, { path: 'worker-fail', data: { deviceId: DEVICE, jobId: JOB, attemptId: ATTEMPT, code: 'private stack trace' } })).httpStatus, 400);
  assert.ok(mock.calls.every(c => c.name === 'user'));
});

test('heartbeat uses owner JWT and hash only; worker enum includes pause, quota and connection states', async () => {
  const mock = routes({ jarvis_worker_heartbeat: { ok: true } });
  const result = await invoke(mock, { path: 'worker-heartbeat', data: { deviceId: DEVICE, status: 'paused', reason: 'quota_exceeded', owner_id: ATTEMPT } });
  assert.equal(result.httpStatus, 200);
  assert.deepEqual(mock.calls.at(-1).params, { p_device_id: DEVICE, p_token_hash: HASH, p_status: 'paused', p_reason: 'quota_exceeded' });
  assert.equal(mock.calls.at(-1).headers.Authorization, 'Bearer alice');
  assert.ok(WORKER_STATUSES.includes('paused')); assert.ok(WORKER_REASONS.includes('connection_error')); assert.ok(FAILURE_CODES.includes('result_uncertain'));
});

test('the independent database dispatch gate can reject claim even when server env is true', async () => {
  const mock = routes({ jarvis_worker_claim: () => json({ code: 'JQ503', message: 'private policy' }, 503) });
  const result = await invoke(mock, { path: 'worker-claim', data: { deviceId: DEVICE }, env: { ...ENV, JARVIS_ANTIGRAVITY_ENABLED: 'true' } });
  assert.equal(result.httpStatus, 503); assert.match(result.error, /bloqueado/); assert.ok(!result.error.includes('private'));
  assert.deepEqual(mock.calls.map(c => c.name), ['user', 'jarvis_worker_claim']);
});

test('claim prepares bounded snapshot after the previous chat and saves exact sources before returning a prompt', async () => {
  const mock = routes({ jarvis_worker_claim: { jobId: JOB, attemptId: ATTEMPT, request: 'configuração', expiresAt: '2026-10-17',
    context: { notes: [{ id: DEVICE, title: 'configuração', content: 'nada\n'.repeat(6000) + 'configuração evidência' }],
      tasks: [], messages: [{ role: 'assistant', content: 'previous completed reply' }] } }, jarvis_worker_prepare: { prepared: true } });
  const result = await invoke(mock, { path: 'worker-claim', data: { deviceId: DEVICE }, env: { ...ENV, JARVIS_ANTIGRAVITY_ENABLED: 'true' } });
  assert.equal(result.httpStatus, 200); assert.ok(result.prompt.length <= 32000); assert.match(result.prompt, /evidência/);
  assert.match(result.prompt, /previous completed reply/); assert.equal(result.jobId, JOB); assert.equal(result.attemptId, ATTEMPT);
  assert.deepEqual(result.sources, [{ id: DEVICE, title: 'configuração' }]);
  assert.equal(mock.calls.at(-1).name, 'jarvis_worker_prepare'); assert.equal(mock.calls.at(-1).params.p_prompt, result.prompt);
  assert.ok(!Object.hasOwn(result, 'context')); assert.ok(!JSON.stringify(result).includes(HASH));
});

test('empty claim returns no prompt; a malformed snapshot is ended before any start or model call', async () => {
  const env = { ...ENV, JARVIS_ANTIGRAVITY_ENABLED: 'true' };
  const empty = routes({ jarvis_worker_claim: { job: null } });
  assert.deepEqual(await invoke(empty, { path: 'worker-claim', data: { deviceId: DEVICE }, env }), { httpStatus: 200, job: null });
  const bad = routes({ jarvis_worker_claim: { jobId: JOB, attemptId: ATTEMPT, request: '', context: {} }, jarvis_worker_fail: { status: 'failed' } });
  const result = await invoke(bad, { path: 'worker-claim', data: { deviceId: DEVICE }, env });
  assert.equal(result.httpStatus, 400); assert.equal(bad.calls.at(-1).name, 'jarvis_worker_fail');
  assert.equal(bad.calls.at(-1).params.p_code, 'context_error');
});

test('start replay is exposed to worker without dispatch; completion drops forged sources/owner/prompt', async () => {
  const env = { ...ENV, JARVIS_ANTIGRAVITY_ENABLED: 'true' };
  const mock = routes({ jarvis_worker_start: { started: true, alreadyStarted: true }, jarvis_worker_complete: { jobId: JOB, status: 'completed', sources: [] } });
  const data = { deviceId: DEVICE, jobId: JOB, attemptId: ATTEMPT };
  const replay = await invoke(mock, { path: 'worker-start', data, env });
  assert.equal(replay.alreadyStarted, true);
  await invoke(mock, { path: 'worker-complete', data: { ...data, answer: 'Intact answer  ', sources: [{ id: 'forged' }], prompt: 'unsafe', owner_id: ATTEMPT }, env });
  assert.deepEqual(mock.calls.at(-1).params, { p_device_id: DEVICE, p_token_hash: HASH, p_job_id: JOB, p_attempt_id: ATTEMPT, p_answer: 'Intact answer  ' });
});

test('disabling env stops renewal/new completion but permits the exact already-completed replay RPC', async () => {
  const data = { deviceId: DEVICE, jobId: JOB, attemptId: ATTEMPT, answer: 'Stored exact answer' };
  const active = routes({ jarvis_chat_job: { jobId: JOB, status: 'processing' } });
  assert.equal((await invoke(active, { path: 'worker-renew', data })).httpStatus, 503);
  assert.equal((await invoke(active, { path: 'worker-complete', data })).httpStatus, 503);
  assert.ok(active.calls.every(call => call.name === 'user' || call.name === 'jarvis_chat_job'));
  const completed = routes({ jarvis_chat_job: { jobId: JOB, status: 'completed' },
    jarvis_worker_complete: { jobId: JOB, status: 'completed', answer: data.answer } });
  const replay = await invoke(completed, { path: 'worker-complete', data });
  assert.equal(replay.httpStatus, 200); assert.equal(replay.status, 'completed');
  assert.equal(completed.calls.at(-1).name, 'jarvis_worker_complete');
  assert.equal(completed.calls.at(-1).params.p_token_hash, HASH);
});

test('state gate overrides forged readiness; database outages preserve panel with explicit queue error', async () => {
  const state = { notes: [], tasks: [], messages: [] };
  const mock = routes({ jarvis_state: state, jarvis_queue_state: { jobs: [{ jobId: JOB }], worker: { status: 'ready', lastSeen: 'now', reason: 'none' } } });
  const result = await invoke(mock, { path: 'state', method: 'GET' });
  assert.equal(result.worker.status, 'blocked'); assert.equal(result.aiInstalled, false); assert.equal(result.jobs.length, 1);
  const outage = routes({ jarvis_state: state, jarvis_queue_state: () => json({ code: 'private' }, 503) });
  const failed = await invoke(outage, { path: 'state', method: 'GET' });
  assert.equal(failed.httpStatus, 200); assert.equal(failed.queuesUnavailable, true); assert.equal(failed.worker.reason, 'connection_error');
  assert.ok(!Object.hasOwn(failed, 'jobs'));
  const absent = routes({ jarvis_state: state, jarvis_queue_state: () => json({ code: 'PGRST202' }, 404) });
  assert.equal((await invoke(absent, { path: 'state', method: 'GET' })).worker.reason, 'schema_not_ready');
});

test('queue SQL protects hashes/prompt, private helpers, FIFO/start/lease and atomic idempotent completion', async () => {
  const sql = await readFile(new URL('../supabase/queue.sql', import.meta.url), 'utf8');
  assert.match(sql, /revoke all on public\.jarvis_queue_settings,public\.jarvis_worker_devices,public\.jarvis_chat_jobs/);
  assert.ok(!/grant\s+(select|insert|update|delete|all)\s+on/i.test(sql));
  assert.match(sql, /where revoked_at is null/); assert.match(sql, /owner_id=owner[^]*?token_hash=p_token_hash/);
  assert.match(sql, /order by created_at,id limit 1 for update/); assert.match(sql, /interval '240 seconds'/);
  assert.match(sql, /'position',case when \(p_job\)\.status in \('queued','processing'\)/);
  assert.match(sql, /q\.owner_id=\(p_job\)\.owner_id/);
  const complete = sql.slice(sql.indexOf('create or replace function public.jarvis_worker_complete'), sql.indexOf('create or replace function public.jarvis_worker_fail'));
  assert.ok(complete.indexOf('perform public.jarvis_queue_lock(owner)') < complete.indexOf('for update'));
  assert.match(sql, /interval '7 days'/); assert.match(sql, /interval '90 seconds'/);
  assert.match(sql, /started_at is not null then 'failed'/); assert.match(sql, /execution_uncertain/);
  assert.match(sql, /alreadyStarted/); assert.match(sql, /job\.answer_hash is distinct from answer_digest/);
  assert.match(sql, /values\(owner,'assistant',p_answer,job\.sources\)/); assert.match(sql, /prompt=null,lease_until=null/);
  assert.match(sql, /Single SELECT: consistent MVCC snapshot/);
  const backup = sql.slice(sql.indexOf('create or replace function public.jarvis_backup()'));
  assert.ok(!backup.includes("to_jsonb(j)")); assert.ok(!backup.includes("'token_hash'"));
});
