import { ApiError, jsonResponse } from './http.mjs';

export async function generate(prompt, env, fetcher = fetch) {
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) throw new ApiError(503, 'Configure GEMINI_API_KEY e GEMINI_MODEL no servidor para habilitar o chat.');
  if (!/^[A-Za-z0-9._-]+$/.test(env.GEMINI_MODEL)) throw new ApiError(503, 'GEMINI_MODEL inválido na configuração do servidor.');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const deadline = AbortSignal.timeout(35_000);
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: deadline,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.4 } }) });
    } catch { throw new ApiError(503, 'O Gemini não respondeu a tempo. Tente novamente mais tarde.'); }
    if (response.status !== 429 && response.status !== 503) break;
    if (attempt === 0) {
      await response.body?.cancel().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 429) throw new ApiError(429, 'A cota do Gemini foi atingida. Tente novamente mais tarde.');
    if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404)
      throw new ApiError(503, 'O Gemini recusou a configuração de chave ou modelo. Verifique o servidor.');
    throw new ApiError(503, 'O Gemini está indisponível. Tente novamente mais tarde.');
  }
  let result;
  try { result = await jsonResponse(response, 128_000); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'O Gemini não respondeu a tempo. Tente novamente mais tarde.');
  }
  const candidate = result.candidates?.[0];
  if (result.promptFeedback?.blockReason || !candidate || candidate.finishReason !== 'STOP')
    throw new ApiError(502, 'O Gemini não concluiu uma resposta válida. Reformule seu pedido.');
  if (candidate.content?.parts?.some(part => part.functionCall)) throw new ApiError(502, 'O Gemini retornou uma resposta incompatível com o chat.');
  const answer = (candidate.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('').trim();
  if (!answer || answer.length > 32_000) throw new ApiError(502, 'O Gemini retornou uma resposta vazia ou muito grande.');
  return answer;
}
