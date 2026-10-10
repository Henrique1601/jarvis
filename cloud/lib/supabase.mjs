import { ApiError, jsonResponse } from './http.mjs';

export class Database {
  constructor(config, token, fetcher = fetch) { this.config = config; this.token = token; this.fetcher = fetcher; }

  async request(path, options = {}) {
    let response;
    try {
      response = await this.fetcher(`${this.config.url}${path}`, { ...options,
        headers: { apikey: this.config.key, Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12_000), redirect: 'error' });
    } catch { throw new ApiError(503, 'Não foi possível acessar o banco. Tente novamente.'); }
    if (!response.ok) {
      if (response.status === 401) throw new ApiError(401, 'Sua sessão expirou. Entre novamente.');
      let code;
      try { code = (await jsonResponse(response, 16_000))?.code; } catch {}
      if (code === 'PGRST202') {
        const error = new ApiError(503, 'A migração da fila ainda não está disponível no banco.');
        error.code = 'schema_not_ready'; throw error;
      }
      if (code === 'PT409') throw new ApiError(409, 'A nota mudou desde a leitura. Abra a versão atual antes de salvar.');
      if (code === 'JQ409') throw new ApiError(409, 'A tentativa não está mais ativa ou o pedido já mudou de estado. Atualize a fila.');
      if (code === 'JQ429') throw new ApiError(429, 'A fila já possui cinco pedidos pendentes. Aguarde ou cancele um pedido.');
      if (code === 'JQ403') throw new ApiError(403, 'Dispositivo inválido ou revogado. Registre novamente pelo Windows.');
      if (code === 'JQ503') throw new ApiError(503, 'O Antigravity está bloqueado: o controle de ferramentas ainda não foi validado. Os pedidos continuam na fila.');
      if (code === 'PT404') throw new ApiError(404, 'Registro não encontrado.');
      if (code === 'PT429') throw new ApiError(429, 'Limite de 20 tentativas de chat por hora atingido. Aguarde antes de tentar novamente.');
      if (code === 'PT413') throw new ApiError(413, 'Limite de armazenamento ou exportação atingido. Nenhum dado foi removido.');
      if (code === 'PT400') throw new ApiError(400, 'Dados inválidos para esta operação.');
      if (response.status === 403 || code === '42501') throw new ApiError(403, 'O banco recusou esta operação. Verifique as políticas de acesso.');
      throw new ApiError(503, 'O banco não concluiu a operação. Verifique se o schema do Jarvis foi aplicado.');
    }
    try { return await jsonResponse(response); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'Não foi possível receber os dados do banco. Tente novamente.');
    }
  }

  rpc(name, params = {}) { return this.request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(params) }); }

  async authenticate() {
    const user = await this.request('/auth/v1/user');
    if (!user?.id || user.is_anonymous || !user.email || !user.email_confirmed_at)
      throw new ApiError(401, 'Entre com uma conta de email confirmado.');
    if (!this.config.emails.has(user.email.toLowerCase())) throw new ApiError(403, 'Esta conta não está autorizada a acessar o Jarvis.');
    return user;
  }
}

export function bearer(req) {
  const value = req.headers?.authorization;
  if (typeof value !== 'string' || !/^Bearer [A-Za-z0-9._~-]+$/.test(value) || value.length > 10_000)
    throw new ApiError(401, 'Entre para acessar seus dados.');
  return value.slice(7);
}
