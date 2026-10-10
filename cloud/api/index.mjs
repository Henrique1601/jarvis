import { ApiError, body, send, settings, text, uuid, revision } from '../lib/http.mjs';
import { Database, bearer } from '../lib/supabase.mjs';
import { prepareContext, rankNotes } from '../lib/context.mjs';
import { generate } from '../lib/gemini.mjs';

export const VERSION = '0.5.0';
const GUIDE = '# Memória online do Jarvis\n\nAs notas desta conta ficam no Supabase, isoladas por usuário. '
  + 'O chat usa apenas trechos selecionados e não executa ferramentas. '
  + 'Edite uma nota pela interface; conflitos preservam a versão atual. '
  + 'Use Exportar backup para baixar notas, versões, tarefas e conversa em JSON. '
  + 'O Windows continua com seu cofre local; não há sincronização automática entre as duas versões.\n';

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
          provider: 'Gemini API', aiInstalled: config.ai, ...(config.configured ? {} : { error: config.reason }) });
      if (!config.configured) throw new ApiError(503, config.reason);
      // The same deadline bounds auth, database reads, model and persistence.
      const deadline = AbortSignal.timeout(50_000);
      const boundedFetch = (url, options = {}) => fetcher(url, { ...options,
        signal: options.signal ? AbortSignal.any([deadline, options.signal]) : deadline });
      const db = new Database(config, bearer(req), boundedFetch);
      await db.authenticate();
      if (req.method === 'GET' && path === '/api/state') {
        const state = await db.rpc('jarvis_state');
        return send(res, 200, { ...state, cloud: true, version: VERSION, provider: 'Gemini API', aiInstalled: config.ai,
          windows: false, voiceInstalled: false, vault: 'Memória online · Supabase' });
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
          if (!config.ai) throw new ApiError(503, 'Configure GEMINI_API_KEY e GEMINI_MODEL no servidor para habilitar o chat.');
          const slot = await db.rpc('jarvis_chat_reserve');
          const context = await db.rpc('jarvis_context');
          const prepared = prepareContext(request, context);
          const answer = await generate(prepared.prompt, env, boundedFetch);
          result = await db.rpc('jarvis_chat_append', { p_slot: slot, p_request: request, p_response: answer, p_sources: prepared.sources }); break;
        }
        case '/api/diagnostics':
          result = { version: VERSION, cloud: true, provider: 'Gemini API', cli: 'Não utilizado no servidor online',
            compatible: true, windows: false, voiceInstalled: false, vault: 'Supabase com RLS',
            login: 'Conta confirmada e autorizada', issues: config.ai ? [] : ['Configure GEMINI_API_KEY e GEMINI_MODEL para habilitar o chat.'] }; break;
        case '/api/ai-check':
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
