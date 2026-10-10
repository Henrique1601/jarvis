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
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    reportValidity() { return true; }
    querySelector() { return this.children[0] || new Element(); }
  }
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  get('auth-email').value = 'owner@example.test'; get('auth-password').value = 'fixture-password';
  const classes = new Set(['cloud-locked']);
  const body = new Element(); body.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
  const calls = []; const subscribers = []; let sdkOptions; let reloads = 0; let ready = false;
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
    window: {}, document: { getElementById: get, createElement: () => new Element(), body, querySelector: get },
    location: { origin: 'https://jarvis.example.test', reload: () => { reloads++; } },
    sessionStorage: tabStorage, localStorage: sharedStorage, queueMicrotask, setTimeout, URL, Blob,
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
    emit: (event, value = session) => subscribers.forEach(fn => fn(event, value)),
    logout: () => get('.header-right').children[0].children[1].onclick() };
}

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
    assert.ok(!html.includes('CONFIGURAR-ANTIGRAVITY.bat'));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
