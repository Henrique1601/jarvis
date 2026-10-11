import { ApiError, body, send, settings, text, uuid, revision } from '../lib/http.mjs';
import { Database, bearer } from '../lib/supabase.mjs';
import { prepareContext, rankNotes } from '../lib/context.mjs';
import { generate } from '../lib/gemini.mjs';
import { queueState, registerWorker, claimWorker, workerCredentials, requireWorkerProvider,
  workerAttempt, workerHeartbeat, completion, FAILURE_CODES } from '../lib/queue.mjs';

export const VERSION = '0.7.0';
const GUIDE = '# Memória online do Jarvis\n\nAs notas desta conta ficam no Supabase, isoladas por usuário. '
  + 'Organize conversas por assunto, selecione até seis notas como contexto e escolha incluir tarefas. '
  + 'O Antigravity responde pelo componente no Windows e segue as permissões do CLI. '
  + 'Edite notas pela interface; etiquetas e pastas ajudam na busca, e conflitos preservam a versão atual. '
  + 'Use Exportar backup para baixar notas, versões, tarefas, conversas e pedidos em JSON. '
  + 'A sincronização com o Windows é manual e usa somente notas escolhidas. '
  + 'Abra Ajuda e o Segundo Cérebro para instruções, diagnóstico e limites da integração.\n';

export function createHandler({ env = process.env, fetcher = fetch } = {}) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'https://jarvis.invalid');
      let path = url.pathname;
      if (path === '/api/index') {
        const route = url.searchParams.get('route');
        if (!route || !/^[a-z][a-z-]{0,40}$/.test(route)) throw new ApiError(404, 'Endpoint não encontrado.');
        path = `/api/${route}`;
      }
      const config = settings(env);
      if (req.method === 'GET' && path === '/api/config')
        return send(res, 200, config.configured ? { configured: true, supabaseUrl: config.url, supabaseAnonKey: config.key }
          : { configured: false, reason: config.reason });
      if (req.method === 'GET' && path === '/api/health')
        return send(res, config.configured ? 200 : 503, { ok: config.configured, cloud: true, version: VERSION,
          provider: config.provider, aiInstalled: config.ai,
          configurationOnly: true,
          worker: { status: config.provider === 'antigravity_windows' && !config.antigravityEnabled ? 'blocked' : 'offline',
            lastSeen: null, reason: config.provider === 'antigravity_windows' && !config.antigravityEnabled ? 'policy_unverified' : 'offline' },
          ...(config.configured ? {} : { error: config.reason }) });
      if (!config.configured) throw new ApiError(503, config.reason);
      // The same deadline bounds auth, database reads, model and persistence.
      const deadline = AbortSignal.timeout(50_000);
      const boundedFetch = (url, options = {}) => fetcher(url, { ...options,
        signal: options.signal ? AbortSignal.any([deadline, options.signal]) : deadline });
      const db = new Database(config, bearer(req), boundedFetch);
      await db.authenticate();
      if (req.method === 'GET' && path === '/api/state') {
        const state = await db.rpc('jarvis_state');
        const queue = await queueState(db, config);
        const aiInstalled = config.provider === 'antigravity_windows'
          ? !queue.queuesUnavailable && ['ready', 'processing'].includes(queue.worker.status) : config.ai;
        return send(res, 200, { ...state, ...queue, cloud: true, version: VERSION, provider: config.provider, aiInstalled,
          windows: false, voiceInstalled: false, vault: 'Memória online · Supabase' });
      }
      if (req.method === 'GET' && path === '/api/chat-job') {
        return send(res, 200, await db.rpc('jarvis_chat_job', { p_id: uuid(url.searchParams.get('id')) }));
      }
      if (req.method !== 'POST') throw new ApiError(405, 'Método não permitido.');
      const data = await body(req);
      let result; let status = 200;
      switch (path) {
        case '/api/note': {
          const folder = data.folder || 'raw';
          if (!['raw', 'wiki', 'outputs'].includes(folder)) throw new ApiError(400, 'Pasta inválida.');
          result = await db.rpc('jarvis_note_create', { p_title: text(data.title, 160), p_content: text(data.content, 20_000), p_folder: folder });
          status = 201; break;
        }
        case '/api/note-read': result = await db.rpc('jarvis_note_read', { p_id: uuid(data.id) }); break;
        case '/api/note-update':
          result = await db.rpc('jarvis_note_update', { p_id: uuid(data.id), p_revision: revision(data.revision), p_content: text(data.content, 200_000, { empty: true, trim: false }) }); break;
        case '/api/note-history': result = await db.rpc('jarvis_note_history', { p_id: uuid(data.id) }); break;
        case '/api/note-restore':
          result = await db.rpc('jarvis_note_restore', { p_id: uuid(data.id), p_version: uuid(data.version), p_revision: revision(data.revision) }); break;
        case '/api/conversation':
          result = await db.rpc('jarvis_conversation_create', { p_title: text(data.title, 160) }); status = 201; break;
        case '/api/conversation-update':
          result = await db.rpc('jarvis_conversation_update', { p_id: uuid(data.id), p_title: text(data.title, 160) }); break;
        case '/api/task-details': {
          const priority = data.priority ?? 'normal';
          if (!['low', 'normal', 'high'].includes(priority) || (data.done !== undefined && typeof data.done !== 'boolean')) throw new ApiError(400, 'Detalhes da tarefa inválidos.');
          const due = data.dueDate ?? null;
          if (due !== null && (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due)) throw new ApiError(400, 'Prazo inválido.');
          result = await db.rpc('jarvis_task_details', { p_id: data.id ? uuid(data.id) : null, p_text: text(data.text, 300), p_done: data.done ?? null, p_due_date: due, p_priority: priority, p_project: text(data.project ?? '', 80, { empty: true }) }); status = data.id ? 200 : 201; break;
        }
        case '/api/note-metadata': {
          if (!Array.isArray(data.tags) || data.tags.length > 10 || !['raw', 'wiki', 'outputs'].includes(data.folder)) throw new ApiError(400, 'Metadados da nota inválidos.');
          const tags = [...new Set(data.tags.map(tag => text(tag, 40)))];
          result = await db.rpc('jarvis_note_metadata', { p_id: uuid(data.id), p_revision: revision(data.revision), p_tags: tags, p_folder: data.folder }); break;
        }
        case '/api/task':
          if (data.id && typeof data.done !== 'boolean') throw new ApiError(400, 'Informe o estado da tarefa.');
          result = await db.rpc('jarvis_task_save', data.id ? { p_id: uuid(data.id), p_done: data.done, p_text: null }
            : { p_id: null, p_done: false, p_text: text(data.text, 300) }); status = data.id ? 200 : 201; break;
        case '/api/search': {
          const query = text(data.query, 1000, { empty: true });
          const context = await db.rpc('jarvis_context');
          result = { notes: rankNotes(context.notes, query).map(({ id, title, content }) => ({ id, title, content: content.slice(0, 600) })) }; break;
        }
        case '/api/chat': {
          const request = text(data.text, 12_000, { trim: false });
          if (config.provider === 'antigravity_windows') {
            const options = ['conversationId', 'contextNoteIds', 'includeTasks'].some(key => Object.hasOwn(data, key));
            const params = { p_request: request, p_request_id: uuid(data.requestId) };
            if (options) {
              if (data.contextNoteIds !== undefined && (!Array.isArray(data.contextNoteIds) || data.contextNoteIds.length > 6)) throw new ApiError(400, 'Selecione até seis notas.');
              if (data.includeTasks !== undefined && typeof data.includeTasks !== 'boolean') throw new ApiError(400, 'Seleção de tarefas inválida.');
              Object.assign(params, { p_conversation_id: data.conversationId ? uuid(data.conversationId) : null,
                p_context_note_ids: data.contextNoteIds === undefined ? null : [...new Set(data.contextNoteIds.map(uuid))].sort(), p_include_tasks: data.includeTasks ?? true });
            }
            result = await db.rpc(options ? 'jarvis_chat_enqueue_options' : 'jarvis_chat_enqueue', params);
            status = 202; break;
          }
          if (config.provider !== 'gemini_api') throw new ApiError(503, 'Provedor de IA inválido. Configure JARVIS_AI_PROVIDER no servidor.');
          if (!config.ai) throw new ApiError(503, 'Configure GEMINI_API_KEY e GEMINI_MODEL no servidor para habilitar o chat.');
          const slot = await db.rpc('jarvis_chat_reserve');
          const context = await db.rpc('jarvis_context');
          const prepared = prepareContext(request, context);
          const answer = await generate(prepared.prompt, env, boundedFetch);
          result = await db.rpc('jarvis_chat_append', { p_slot: slot, p_request: request, p_response: answer, p_sources: prepared.sources }); break;
        }
        case '/api/chat-cancel': result = await db.rpc('jarvis_chat_cancel', { p_id: uuid(data.jobId) }); break;
        case '/api/worker-register':
          requireWorkerProvider(config); result = await registerWorker(db); status = 201; break;
        case '/api/worker-revoke': result = await db.rpc('jarvis_worker_revoke', { p_device_id: uuid(data.deviceId) }); break;
        case '/api/worker-heartbeat': {
          requireWorkerProvider(config);
          result = await db.rpc('jarvis_worker_heartbeat', { ...workerCredentials(req, data), ...workerHeartbeat(data) }); break;
        }
        case '/api/worker-claim': {
          const credentials = workerCredentials(req, data); requireWorkerProvider(config, { dispatch: true });
          result = await claimWorker(db, credentials); break;
        }
        case '/api/worker-start': {
          const attempt = workerAttempt(workerCredentials(req, data), data); requireWorkerProvider(config, { dispatch: true });
          result = await db.rpc('jarvis_worker_start', attempt); break;
        }
        case '/api/worker-renew':
          requireWorkerProvider(config, { dispatch: true }); result = await db.rpc('jarvis_worker_renew', workerAttempt(workerCredentials(req, data), data)); break;
        case '/api/worker-complete': {
          requireWorkerProvider(config);
          const attempt = workerAttempt(workerCredentials(req, data), data);
          const answer = completion(data);
          if (!config.antigravityEnabled) {
            const existing = await db.rpc('jarvis_chat_job', { p_id: attempt.p_job_id });
            if (existing.status !== 'completed') requireWorkerProvider(config, { dispatch: true });
          }
          // Even an existing result is checked by the DB against the active
          // device, exact attempt and exact answer before replay is returned.
          result = await db.rpc('jarvis_worker_complete', { ...attempt, p_answer: answer }); break;
        }
        case '/api/worker-fail':
          requireWorkerProvider(config);
          if (!FAILURE_CODES.includes(data.code)) throw new ApiError(400, 'Código de falha inválido.');
          result = await db.rpc('jarvis_worker_fail', { ...workerAttempt(workerCredentials(req, data), data), p_code: data.code }); break;
        case '/api/diagnostics':
          result = { version: VERSION, cloud: true, provider: config.provider, cli: 'Executado somente pelo worker no Windows',
            compatible: ['gemini_api', 'antigravity_windows'].includes(config.provider), windows: false, voiceInstalled: false, vault: 'Supabase com RLS',
            login: 'Conta confirmada e autorizada', ...(await queueState(db, config)),
            issues: config.provider === 'antigravity_windows' ? ['A resposta depende do componente conectado no Windows e do login Google no CLI. As ferramentas seguem as permissões do Antigravity.']
              : config.ai ? [] : ['Configure GEMINI_API_KEY e GEMINI_MODEL para habilitar o chat.'] }; break;
        case '/api/ai-check':
          if (config.provider === 'antigravity_windows') {
            const queue = await queueState(db, config);
            result = { ok: queue.worker.status === 'ready', cloud: true, provider: config.provider,
              authenticatedModelTest: false, ...queue, login: 'A disponibilidade informa a conexão do componente. O login Google e os limites do plano são verificados ao executar o pedido.' }; break;
          }
          // Configuration check is intentionally free: it does not make a billed model request.
          if (!config.ai) throw new ApiError(503, 'Configure GEMINI_API_KEY e GEMINI_MODEL no servidor para habilitar o chat.');
          result = { ok: true, cloud: true, configured: true, authenticatedModelTest: false,
            login: 'Conta autorizada. API configurada; a conexão ao modelo será testada ao enviar um pedido.' }; break;
        case '/api/docs-import': {
          const imported = await db.rpc('jarvis_note_create', { p_title: 'Como usar a memória online', p_content: GUIDE, p_folder: 'wiki' });
          result = { copied: [imported.title] }; status = 201; break;
        }
        case '/api/backup': result = { backup: await db.rpc('jarvis_backup') }; break;
        default: throw new ApiError(404, 'Endpoint não encontrado.');
      }
      return send(res, status, result);
    } catch (error) {
      return send(res, error instanceof ApiError ? error.status : 500,
        { error: error instanceof ApiError ? error.message : 'Não foi possível concluir o pedido.' });
    }
  };
}

export default createHandler();
