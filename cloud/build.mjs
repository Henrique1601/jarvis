import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = new URL('./', import.meta.url);
const shared = new URL('../jarvis-gemini/web/', root);
await mkdir(new URL('public/', root), { recursive: true });
// Explicit asset list: never copy the vault, imported conversation, or runtime.
for (const name of ['style.css', 'workspace.css', 'app.js', 'workspace.js']) {
  await copyFile(new URL(name, shared), new URL('public/' + name, root));
}
let html = await readFile(new URL('index.html', shared), 'utf8');
html = html.replace('<title>Jarvis • Antigravity</title>', '<title>Jarvis • Online</title>')
  .replace('</head>', '<link rel="stylesheet" href="/cloud.css"></head>')
  .replace('<body>', '<body class="cloud-locked">')
  .replace('Prévia 0.4: a conexão de IA ainda está bloqueada. Memória e tarefas estão disponíveis.', 'Jarvis online · Sua memória fica na sua conta. O cofre Windows é separado; sincronização ainda não está disponível.')
  .replaceAll('<b>Antigravity</b>', '<b>Antigravity no Windows</b>')
  .replace('JARVIS / ANTIGRAVITY', 'JARVIS / ONLINE')
  .replace('Antigravity processa os pedidos na nuvem.<br>As notas ficam no seu computador.', 'Seu Windows responde pelo Antigravity.<br>Notas e pedidos online ficam na sua conta Supabase.')
  .replace(/<details class="setup">[\s\S]*?<\/details>/, '<details class="setup"><summary>Configuração e dados</summary><p>Notas, tarefas, conversa e pedidos pertencem à conta autenticada. O backup é exportado em JSON com conteúdo Markdown.</p><p>Para conectar seu computador, use CONFIGURAR-WORKER.bat na versão Windows. O processamento depende da validação do CLI sem ferramentas. Sem computador disponível, os pedidos aguardam até sete dias.</p><p>O microfone local e as vozes do Windows estão disponíveis no aplicativo para Windows.</p><code id="vault-path"></code><p><a href="https://github.com/Henrique1601/jarvis/blob/main/cloud/ANTIGRAVITY-WINDOWS.md" target="_blank" rel="noopener noreferrer">Como conectar o Windows ↗</a></p></details>')
  .replace('<script src="/app.js">', '<script src="/platform.js"></script><script src="/app.js">');
const auth = `<section id="cloud-auth" class="cloud-auth" aria-labelledby="auth-title"><div class="auth-card">
<p class="eyebrow">JARVIS / SUA CONTA</p><h1 id="auth-title">Sua memória, onde você estiver.</h1><p>Entre para abrir suas notas, tarefas e conversas online.</p>
<form id="cloud-login"><label>E-mail<input id="auth-email" type="email" autocomplete="username" required maxlength="254"></label><label>Senha<input id="auth-password" type="password" autocomplete="current-password" minlength="8" required maxlength="128"></label><button id="auth-submit" type="submit">Entrar ↗</button></form>
<div class="auth-actions"><button id="auth-signup" type="button" class="subtle">Criar minha conta</button><button id="auth-reset" type="button" class="subtle">Esqueci minha senha</button></div>
<form id="cloud-recovery" hidden><label>Nova senha<input id="auth-new-password" type="password" autocomplete="new-password" minlength="8" required maxlength="128"></label><button type="submit">Salvar nova senha</button></form>
<p id="auth-notice" role="status">Conectando ao serviço de login…</p><a href="https://github.com/Henrique1601/jarvis#jarvis-para-windows" target="_blank" rel="noopener noreferrer">Também disponível para Windows ↗</a>
</div></section>`;
html = html.replace('<script src="/platform.js">', auth + '<script src="/platform.js">');
await writeFile(new URL('public/index.html', root), html);
await copyFile(new URL('frontend/cloud.css', root), new URL('public/cloud.css', root));
await build({ entryPoints: [fileURLToPath(new URL('frontend/platform.js', root))], outfile: fileURLToPath(new URL('public/platform.js', root)), bundle: true, minify: true, platform: 'browser', target: ['es2022'] });
console.log('Painel compartilhado e autenticação online empacotados.');
