import { createClient } from '@supabase/supabase-js';
const byId = id => document.getElementById(id);
let client, resolveReady;
let unlocked = false;
let recovery = false;
let authorizationAttempt = 0;
let activeAccount = null;
const ready = new Promise(resolve => { resolveReady = resolve; });
const message = text => { byId('auth-notice').textContent = text; };
function controls(disabled) {
  for (const id of ['auth-submit', 'auth-signup', 'auth-reset']) byId(id).disabled = disabled;
}
function lock(messageText) {
  authorizationAttempt++;
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
  const attempt = ++authorizationAttempt;
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
  } catch {
    if (attempt === authorizationAttempt) lock('Não foi possível confirmar o acesso. Tente entrar novamente.');
    return false;
  }
  const account = session.user.id || session.user.email;
  if (unlocked && activeAccount !== account) {
    // Changing the shared login must not reveal the previous account's editor
    // or notes while the new account loads.
    lock(); location.reload(); return false;
  }
  activeAccount = account;
  byId('cloud-auth').hidden = true;
  document.body.classList.remove('cloud-locked');
  byId('cloud-user').textContent = session.user.email;
  if (!unlocked) { unlocked = true; resolveReady(); }
  return true;
}
async function accessToken() {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    lock('Entre na sua conta para continuar.');
    throw Error('Entre na sua conta para continuar.');
  }
  let session = data.session;
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
  const token = await accessToken();
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      lock(result.error || 'Esta conta não está autorizada. Confira o e-mail configurado para o Jarvis.');
    }
    throw Error(result.error || 'Não foi possível concluir o pedido.');
  }
  return result;
}
window.jarvisPlatform = {
  ready, request, state: () => request('state'),
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
    location.reload();
  } catch {
    byId('notice').textContent = 'Não foi possível sair. Sua sessão continua aberta; tente novamente.';
  } finally { logout.disabled = false; }
};
byId('cloud-login').onsubmit = async event => {
  event.preventDefault(); controls(true); message('Entrando…');
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: byId('auth-email').value.trim(), password: byId('auth-password').value });
    if (error) throw Error('Não foi possível entrar. Confira e-mail, senha e confirmação do e-mail.');
    byId('auth-password').value = '';
    if (await unlock(data.session)) location.reload();
  } catch (error) { message(error.message); }
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
  } catch (error) { message(error.message || 'Não foi possível conectar ao login. Recarregue a página.'); }
}
init();
