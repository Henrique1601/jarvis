export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const BODY_BYTES = 250_000;
export const RESPONSE_BYTES = 4_000_000;

export function settings(env) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_ANON_KEY || '';
  const emails = new Set((env.ALLOWED_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
  let validURL = false;
  try { const parsed = new URL(url); validURL = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/'; } catch {}
  // The backend deliberately never accepts a service-role/secret key.
  let publicKey = key.startsWith('sb_publishable_');
  if (key.split('.').length === 3) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch {}
  }
  const configured = Boolean(validURL && publicKey && emails.size);
  const provider = env.JARVIS_AI_PROVIDER || 'antigravity_windows';
  const antigravityEnabled = env.JARVIS_ANTIGRAVITY_ENABLED === 'true';
  return { url, key, emails, configured, provider, antigravityEnabled,
    ai: provider === 'gemini_api' ? Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL) : false,
    reason: configured ? undefined : 'Configure SUPABASE_URL, SUPABASE_ANON_KEY pública e ALLOWED_EMAILS no servidor.' };
}

export function text(value, max, { empty = false, trim = true } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()))
    throw new ApiError(400, `Informe um texto${empty ? '' : ' não vazio'} de até ${max} caracteres.`);
  return trim ? value.trim() : value;
}

export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new ApiError(400, 'Identificador inválido.');
  return value;
}

export function revision(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) throw new ApiError(400, 'Revisão da nota inválida.');
  return value.toLowerCase();
}

export async function body(req) {
  if (Number(req.headers?.['content-length']) > BODY_BYTES) throw new ApiError(413, 'O pedido excede 250 KB.');
  const contentType = req.headers?.['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'Envie application/json.');
  let value;
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > BODY_BYTES) throw new ApiError(413, 'O pedido excede 250 KB.');
    try { value = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(raw); }
    catch { throw new ApiError(400, 'JSON inválido.'); }
  } else {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > BODY_BYTES) throw new ApiError(413, 'O pedido excede 250 KB.');
      chunks.push(Buffer.from(chunk));
    }
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ApiError(400, 'JSON inválido.'); }
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new ApiError(400, 'O corpo deve ser um objeto JSON.');
  return value;
}

export async function jsonResponse(response, limit = RESPONSE_BYTES) {
  const chunks = []; let size = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) throw new ApiError(413, 'Os dados excedem o limite de 4 MB desta operação.');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
  } else {
    const raw = await response.text();
    if (Buffer.byteLength(raw) > limit) throw new ApiError(413, 'Os dados excedem o limite desta operação.');
    chunks.push(Buffer.from(raw));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(502, 'O serviço remoto retornou uma resposta inválida.'); }
}

export function send(res, status, payload) {
  let raw = JSON.stringify(payload);
  if (Buffer.byteLength(raw) > RESPONSE_BYTES) { status = 413; raw = JSON.stringify({ error: 'O resultado excede 4 MB. Nenhum dado foi removido.' }); }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(raw);
}
