import { createClient } from '@supabase/supabase-js';
const byId = id => document.getElementById(id);
let client, resolveReady;
let unlocked = false;
let recovery = false;
let authorizationAttempt = 0;
let activeAccount = null;
let authorized = false;
let latestState = null;
let stateFlight = null;
let pollTimer = null;
let pendingSubmit = null;
let submitting = false;
const stateListeners = new Set();
const pendingJob = job => job.status === 'queued' || job.status === 'processing';
const pollWarning = 'Atualização da fila indisponível. Tentaremos novamente; seus pedidos permanecem guardados.';
const ready = new Promise(resolve => { resolveReady = resolve; });
const message = text => { byId('auth-notice').textContent = text; };
function controls(disabled) {
  for (const id of ['auth-submit', 'auth-signup', 'auth-reset']) byId(id).disabled = disabled;
}
function loginError(error) {
  if (error?.code === 'invalid_credentials')
    return 'E-mail ou senha incorretos. Digite a senha da sua conta Jarvis ou use Esqueci minha senha.';
  if (error?.code === 'email_not_confirmed')
    return 'Antes de entrar, confirme seu e-mail pelo link enviado pelo Jarvis.';
  if (error?.status === 429 || error?.code === 'over_request_rate_limit')
    return 'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.';
  if (error?.name === 'AuthRetryableFetchError' || error?.code === 'request_timeout' || error?.status >= 500)
    return 'Não foi possível conectar ao login. Confira sua conexão; o serviço pode estar indisponível. Tente novamente em alguns minutos.';
  return 'Não foi possível entrar. Confira os dados e tente novamente, ou use Esqueci minha senha.';
}
function lock(messageText) {
  authorizationAttempt++;
  authorized = false;
  latestState = null;
  stateFlight = null;
  pendingSubmit = null;
  stopPolling();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  byId('cloud-auth').hidden = false;
  document.body.classList.add('cloud-locked');
  if (messageText) message(messageText);
}
function migrateTabSession(supabaseUrl) {
  // Match the SDK project namespace, and move only this site's legacy session.
  // An existing shared session wins: never replace a newer login from another tab.
  const key = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  try {
    const shared = localStorage.getItem(key);
    const legacy = sessionStorage.getItem(key);
    if (legacy !== null) {
      if (shared === null) localStorage.setItem(key, legacy);
      sessionStorage.removeItem(key);
    }
  } catch {
    throw Error('Permita o armazenamento deste site no navegador para manter seu login entre abas.');
  }
}
async function resumeSession() {
  const attempt = authorizationAttempt;
  const { data, error } = await client.auth.getSession();
  if (attempt !== authorizationAttempt || recovery) return false;
  if (error || !data.session) {
    lock('Entre na sua conta para continuar.');
    return false;
  }
  return unlock(data.session);
}
async function unlock(session) {
  if (!session || recovery) return false;
  const account = session.user.id || session.user.email;
  if (unlocked && activeAccount !== account) {
    lock(); location.reload(); return false;
  }
  const attempt = ++authorizationAttempt;
  let verifiedState;
  try {
    // Use the supplied token directly: never await another SDK auth operation
    // from an auth event, and authorize the account before showing private UI.
    const response = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + session.access_token } });
    const result = await response.json();
    if (attempt !== authorizationAttempt || recovery) return false;
    if (!response.ok) {
      lock(result.error || 'Esta conta não está autorizada a acessar o Jarvis.');
      return false;
    }
    verifiedState = result;
  } catch {
    if (attempt === authorizationAttempt) lock('Não foi possível confirmar o acesso. Tente entrar novamente.');
    return false;
  }
  activeAccount = account;
  authorized = true;
  latestState = { ...verifiedState, jobs: verifiedState.jobs || latestState?.jobs || [] };
  byId('cloud-auth').hidden = true;
  document.body.classList.remove('cloud-locked');
  byId('cloud-user').textContent = session.user.email;
  if (!unlocked) { unlocked = true; resolveReady(); }
  schedulePoll();
  return true;
}
async function accessToken() {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    lock('Entre na sua conta para continuar.');
    throw Error('Entre na sua conta para continuar.');
  }
  let session = data.session;
  if (activeAccount && (session.user.id || session.user.email) !== activeAccount) {
    lock(); location.reload(); throw Error('Sua conta mudou. Aguarde a página recarregar.');
  }
  if (session.expires_at * 1000 < Date.now() + 30000) {
    const result = await client.auth.refreshSession();
    if (result.error || !result.data.session) {
      lock('Sua sessão expirou. Entre novamente.');
      throw Error('Sua sessão expirou. Entre novamente.');
    }
    session = result.data.session;
  }
  return session.access_token;
}
async function request(path, body) {
  if (!client) throw Error('O serviço online precisa ser configurado.');
  if (!authorized || recovery) throw Error('Entre na sua conta para continuar.');
  const attempt = authorizationAttempt;
  const token = await accessToken();
  if (attempt !== authorizationAttempt || !authorized) throw Error('Sua sessão mudou. Entre novamente.');
  let response, result;
  try {
    response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    result = await response.json();
  } catch { throw Error('Não foi possível confirmar o pedido. Confira a conexão e tente novamente.'); }
  if (attempt !== authorizationAttempt || !authorized) throw Error('Sua sessão mudou. Entre novamente.');
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      lock(result.error || 'Esta conta não está autorizada. Confira o e-mail configurado para o Jarvis.');
    }
    const error = Error(result.error || 'Não foi possível concluir o pedido.'); error.status = response.status; throw error;
  }
  return result;
}
function stopPolling() {
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = null;
}
function schedulePoll() {
  stopPolling();
  if (authorized && !recovery && !document.hidden)
    pollTimer = setTimeout(pollState, latestState?.jobs?.some(pendingJob) ? 5000 : 30000);
}
async function loadState() {
  if (!stateFlight) {
    const attempt = authorizationAttempt;
    const flight = request('state').then(result => {
      if (!authorized || recovery || attempt !== authorizationAttempt) throw Error('Sua sessão mudou. Entre novamente.');
      // A partial state during a queue outage deliberately omits jobs; retain
      // the last known requests rather than implying they were removed.
      if (!Array.isArray(result.jobs) && latestState?.jobs) result = { ...result, jobs: latestState.jobs };
      latestState = result; schedulePoll(); return result;
    })
      .finally(() => { if (stateFlight === flight) stateFlight = null; });
    stateFlight = flight;
  }
  return stateFlight;
}
async function pollState() {
  stopPolling();
  if (!authorized || recovery || document.hidden) return;
  const attempt = authorizationAttempt;
  try {
    const result = await loadState();
    if (attempt === authorizationAttempt && authorized && !recovery && !document.hidden) {
      if (byId('notice').textContent === pollWarning) byId('notice').textContent = '';
      for (const listener of stateListeners) listener(result);
    }
  } catch {
    // A poll from the previous session must not alter the newly signed-in UI.
    // Preserve action errors: recovery may remove only the polling warning.
    if (attempt === authorizationAttempt && authorized && !recovery && !document.hidden && !byId('notice').textContent)
      byId('notice').textContent = pollWarning;
  } finally { if (attempt === authorizationAttempt) schedulePoll(); }
}
const reasonLabels = {
  auth_required: 'Entre com sua conta Google no Antigravity do Windows.',
  policy_blocked: 'Acesso à IA bloqueado. Verifique as permissões do Antigravity no Windows.',
  quota_exceeded: 'Limite de uso atingido. Aguarde a cota da sua conta Google renovar.',
  connection_error: 'Sem conexão com o Windows. Abra o worker para continuar.',
  execution_failed: 'Não foi possível processar este pedido no Windows.',
  result_uncertain: 'Não foi possível confirmar o resultado. Confira o Windows antes de enviar novamente.',
  timeout: 'O processamento excedeu o tempo disponível.',
  device_revoked: 'Este Windows foi desconectado. Conecte o dispositivo novamente.',
  cancelled: 'Pedido cancelado.', expired: 'Pedido expirado após 7 dias.'
};
Object.assign(reasonLabels, {
  login_required: reasonLabels.auth_required,
  policy_unverified: 'Processamento Antigravity desativado ou inicialização não confirmada. Pedidos aguardam liberação e expiram em 7 dias.',
  cli_missing: 'Instale o Antigravity CLI no Windows antes de iniciar o worker.',
  offline: reasonLabels.connection_error, busy: 'Windows processando um pedido.',
  runtime_error: reasonLabels.execution_failed, revoked: reasonLabels.device_revoked,
  context_error: 'Não foi possível preparar a memória deste pedido.',
  execution_uncertain: 'Execução interrompida; resultado incerto. Reenvie somente se desejar.',
  schema_not_ready: 'Fila em preparação. Suas notas continuam disponíveis.'
});
function workerLabel(worker = {}) {
  if (worker.reason === 'policy_unverified') return reasonLabels.policy_unverified;
  if (worker.status === 'ready') return 'Windows conectado';
  if (worker.status === 'processing') return 'Windows processando um pedido';
  if (worker.status === 'offline' || !worker.status) return 'Windows offline · pedidos ficam na fila';
  return reasonLabels[worker.reason] || reasonLabels[worker.status] || 'Worker do Windows pausado. Confira o aplicativo no computador.';
}
async function submitChat(text) {
  if (submitting) throw Error('Aguarde o envio deste pedido.');
  if (!pendingSubmit || pendingSubmit.text !== text) pendingSubmit = { text, requestId: crypto.randomUUID() };
  const submission = pendingSubmit;
  submitting = true;
  try {
    const result = await request('chat', submission);
    if (pendingSubmit === submission) pendingSubmit = null;
    return result;
  } catch (error) {
    // A lost/5xx response may follow acceptance; retry the same UUID to avoid
    // enqueuing twice. A definite client rejection can use a fresh request.
    if (error.status && error.status < 500 && pendingSubmit === submission) pendingSubmit = null;
    throw error;
  } finally { submitting = false; }
}
function renderJobs(box, data) {
  box.querySelector('.cloud-queue')?.remove();
  const list = document.createElement('section'); list.className = 'cloud-queue'; list.setAttribute('aria-label', 'Fila de pedidos');
  const info = document.createElement('p'); info.className = 'cloud-worker'; info.textContent = workerLabel(data.worker); list.append(info);
  const setup = document.createElement('p'); setup.className = 'muted';
  setup.textContent = 'Os pedidos aguardam até 7 dias. No Windows, execute CONFIGURAR-WORKER.bat e inicie o worker. O login Google é feito no Antigravity, fora deste painel.';
  list.append(setup);
  const labels = { queued: 'Na fila', processing: 'Processando no Windows', failed: 'Não concluído', cancelled: 'Cancelado', expired: 'Expirado' };
  const jobs = [...new Map((data.jobs || []).map(job => ({ ...job, id: job.id || job.jobId }))
    .filter(job => job.id && job.status !== 'completed').map(job => [job.id, job])).values()]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
  for (const job of jobs) {
    const row = document.createElement('article'); row.className = 'cloud-job';
    const text = document.createElement('div'); text.textContent = job.text;
    const status = document.createElement('strong'); status.textContent = labels[job.status] || 'Estado indisponível';
    const detail = document.createElement('small');
    detail.textContent = (job.position ? `Posição ${job.position} · ` : '') + 'Prazo de 7 dias · até ' + new Date(job.expiresAt).toLocaleString('pt-BR');
    row.append(text, status, detail);
    if (job.errorCode) { const error = document.createElement('p'); error.textContent = reasonLabels[job.errorCode] || reasonLabels.execution_failed; row.append(error); }
    if (pendingJob(job)) {
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'subtle'; cancel.textContent = 'Cancelar pedido';
      cancel.onclick = async () => {
        cancel.disabled = true;
        try {
          await request('chat-cancel', { jobId: job.id });
          const result = await loadState();
          if (!authorized || recovery) return;
          renderJobs(box, result);
          for (const listener of stateListeners) listener(result);
        } catch (error) { if (authorized) byId('notice').textContent = error.message; }
        finally { cancel.disabled = false; }
      };
      row.append(cancel);
    }
    list.append(row);
  }
  box.append(list);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); else void pollState(); });
window.addEventListener('online', () => { void pollState(); });
window.jarvisPlatform = {
  ready, request, state: loadState, submitChat, renderJobs, workerLabel,
  active: () => authorized && !recovery,
  onState(listener) { stateListeners.add(listener); return () => stateListeners.delete(listener); },
  async backup() {
    const result = await request('backup', {});
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = 'jarvis-online-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
const account = document.createElement('div'); account.className = 'cloud-account';
const email = document.createElement('small'); email.id = 'cloud-user';
const logout = document.createElement('button'); logout.type = 'button'; logout.className = 'subtle'; logout.textContent = 'Sair';
account.append(email, logout); document.querySelector('.header-right').prepend(account);
logout.onclick = async () => {
  logout.disabled = true;
  try {
    const result = await client?.auth.signOut({ scope: 'local' });
    if (!result || result.error) throw Error('Não foi possível sair. Tente novamente.');
    // Clear private UI and editor state only after the SDK confirms sign out.
    lock(); location.reload();
  } catch {
    byId('notice').textContent = 'Não foi possível sair. Sua sessão continua aberta; tente novamente.';
  } finally { logout.disabled = false; }
};
byId('cloud-login').onsubmit = async event => {
  event.preventDefault(); controls(true); message('Entrando…');
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: byId('auth-email').value.trim(), password: byId('auth-password').value });
    if (error) throw error;
    byId('auth-password').value = '';
    if (await unlock(data.session)) location.reload();
  } catch (error) { message(loginError(error)); }
  finally { controls(false); }
};
byId('auth-signup').onclick = async () => {
  if (!byId('cloud-login').reportValidity()) return;
  controls(true); message('Criando conta…');
  try {
    const { data, error } = await client.auth.signUp({ email: byId('auth-email').value.trim(), password: byId('auth-password').value, options: { emailRedirectTo: location.origin + '/' } });
    if (error) throw Error('Não foi possível criar a conta. Confira os dados e tente novamente mais tarde.');
    byId('auth-password').value = '';
    if (data.session) { if (await unlock(data.session)) location.reload(); }
    else message('Confira seu e-mail para confirmar a conta. Depois, entre aqui com sua senha.');
  } catch (error) { message(error.message); }
  finally { controls(false); }
};
byId('auth-reset').onclick = async () => {
  if (!byId('auth-email').reportValidity()) return;
  controls(true);
  try {
    const { error } = await client.auth.resetPasswordForEmail(byId('auth-email').value.trim(), { redirectTo: location.origin + '/' });
    if (error) throw Error('Não foi possível solicitar a recuperação. Tente novamente mais tarde.');
    message('Se houver uma conta para esse e-mail, você receberá um link para redefinir a senha.');
  } catch (error) { message(error.message); }
  finally { controls(false); }
};
byId('cloud-recovery').onsubmit = async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    const { error } = await client.auth.updateUser({ password: byId('auth-new-password').value });
    if (error) throw Error('Não foi possível salvar a nova senha. Solicite outro link de recuperação.');
    byId('auth-new-password').value = '';
    location.reload();
  } catch (error) { message(error.message); }
  finally { button.disabled = false; }
};
async function init() {
  controls(true);
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    if (!response.ok || config.configured === false || !config.supabaseUrl || !config.supabaseAnonKey) {
      message('Jarvis online em configuração. Falta conectar o Supabase e autorizar o e-mail do proprietário na Vercel. O aplicativo Windows continua disponível.');
      return;
    }
    // Use the SDK's shared browser storage: its BroadcastChannel forwards auth
    // events but does not copy a session into another tab's sessionStorage.
    // Implicit email auth also avoids a verifier limited to the requesting tab.
    migrateTabSession(config.supabaseUrl);
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovery = true; lock(); byId('cloud-login').hidden = true;
        document.querySelector('.auth-actions').hidden = true; byId('cloud-recovery').hidden = false;
        message('Escolha sua nova senha.');
      } else if (event === 'SIGNED_OUT') {
        lock();
        if (unlocked) location.reload();
      } else if (session && !recovery && event !== 'TOKEN_REFRESHED') {
        // Schedule outside the SDK notification callback and its auth lock.
        queueMicrotask(() => { void resumeSession().catch(() => lock('Não foi possível recuperar a sessão. Entre novamente.')); });
      }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw Error('Não foi possível recuperar a sessão. Entre novamente.');
    if (!recovery && data.session) await unlock(data.session);
    else if (!recovery) message('Use o e-mail autorizado para este Jarvis.');
    controls(false);
  } catch (error) {
    message(error.message || 'Não foi possível conectar ao login. Recarregue a página.');
    // A failed session restore must still permit a fresh login. Missing
    // configuration or storage prevents client creation and keeps controls off.
    if (client) controls(false);
  }
}
init();
