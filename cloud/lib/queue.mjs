import { createHash, randomBytes } from 'node:crypto';
import { ApiError, text, uuid } from './http.mjs';
import { prepareContext } from './context.mjs';

export const WORKER_STATUSES = ['blocked', 'ready', 'processing', 'offline', 'error', 'paused'];
export const WORKER_REASONS = ['none', 'policy_unverified', 'cli_missing', 'login_required', 'offline', 'busy', 'runtime_error', 'revoked', 'quota_exceeded', 'connection_error'];
export const FAILURE_CODES = ['runtime_error', 'policy_unverified', 'login_required', 'cli_missing', 'context_error', 'execution_uncertain',
  'timeout', 'result_uncertain', 'quota_exceeded', 'auth_required', 'policy_blocked', 'execution_failed', 'device_revoked', 'connection_error'];
export const BLOCKED_REASON = 'policy_unverified';

export function workerCredentials(req, data) {
  const token = req.headers?.['x-jarvis-device-token'];
  // 32 random bytes, canonical unpadded base64url; never log or return the hash.
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)
      || Buffer.from(token, 'base64url').length !== 32 || Buffer.from(token, 'base64url').toString('base64url') !== token)
    throw new ApiError(403, 'Informe a credencial válida do dispositivo Windows.');
  return { p_device_id: uuid(data.deviceId), p_token_hash: createHash('sha256').update(token).digest('hex') };
}

export function requireWorkerProvider(config, { dispatch = false } = {}) {
  if (config.provider !== 'antigravity_windows') throw new ApiError(409, 'O provedor ativo não usa o worker Windows.');
  if (dispatch && !config.antigravityEnabled)
    throw new ApiError(503, 'O Antigravity está bloqueado: o controle de ferramentas ainda não foi validado. Os pedidos continuam na fila.');
}

export async function queueState(db, config) {
  let state;
  try { state = await db.rpc('jarvis_queue_state'); }
  catch (error) {
    if (error.status !== 503) throw error;
    // Keep the existing note/task panel usable during the separate migration.
    return { queuesUnavailable: true, ...(error.code === 'schema_not_ready' ? { jobs: [] } : {}),
      worker: { status: error.code === 'schema_not_ready' ? 'blocked' : 'error', lastSeen: null,
        reason: error.code === 'schema_not_ready' ? 'schema_not_ready' : 'connection_error' } };
  }
  if (config.provider === 'antigravity_windows' && !config.antigravityEnabled)
    state.worker = { ...state.worker, status: 'blocked', reason: BLOCKED_REASON };
  return state;
}

export async function registerWorker(db) {
  const deviceToken = randomBytes(32).toString('base64url');
  const p_token_hash = createHash('sha256').update(deviceToken).digest('hex');
  const result = await db.rpc('jarvis_worker_register', { p_token_hash });
  return { deviceId: result.deviceId, deviceToken };
}

export async function claimWorker(db, credentials) {
  const claimed = await db.rpc('jarvis_worker_claim', credentials);
  if (!claimed || claimed.job === null) return { job: null };
  const attempt = { ...credentials, p_job_id: uuid(claimed.jobId), p_attempt_id: uuid(claimed.attemptId) };
  try {
    const prepared = prepareContext(claimed.request, claimed.context);
    await db.rpc('jarvis_worker_prepare', { ...attempt, p_prompt: prepared.prompt, p_sources: prepared.sources });
    return { jobId: claimed.jobId, attemptId: claimed.attemptId, prompt: prepared.prompt,
      sources: prepared.sources, expiresAt: claimed.expiresAt };
  } catch (error) {
    // Preparation cannot dispatch a model. End the lease rather than return an
    // unusable prompt; a revocation/cancel race may already have ended it.
    await db.rpc('jarvis_worker_fail', { ...attempt, p_code: 'context_error' }).catch(() => {});
    throw error;
  }
}

export function workerAttempt(credentials, data) {
  return { ...credentials, p_job_id: uuid(data.jobId), p_attempt_id: uuid(data.attemptId) };
}

export function workerHeartbeat(data) {
  if (!WORKER_STATUSES.includes(data.status) || !WORKER_REASONS.includes(data.reason || 'none'))
    throw new ApiError(400, 'Estado do worker inválido.');
  return { p_status: data.status, p_reason: data.reason || 'none' };
}

export function completion(data) { return text(data.answer, 32_000, { trim: false }); }
