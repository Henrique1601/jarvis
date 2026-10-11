import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const pageName = index => index === 0 ? 'index.html' : `guia-${index}.html`;

export async function buildHelp(root = new URL('./', import.meta.url)) {
  const vault = new URL('../Segundo Cerebro Jarvis/', root);
  const names = (await readdir(vault)).filter(name => name.endsWith('.md')).sort();
  const pages = new Map(names.map((name, index) => [name.slice(0, -3), pageName(index)]));
  const output = new URL('public/help/', root);
  await mkdir(output, { recursive: true });
  const inline = value => {
    const escaped = escape(value);
    return escaped.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, title, label) => {
      const href = pages.get(title);
      if (!href) throw Error(`Guia não encontrado: ${title}`);
      return `<a href="${href}">${label || title}</a>`;
    }).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  };
  const render = markdown => {
    const lines = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').split(/\r?\n/);
    const html = []; let list = null; let fence = false;
    const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
    for (const line of lines) {
      if (/^```/.test(line)) { closeList(); html.push(fence ? '</code></pre>' : '<pre><code>'); fence = !fence; continue; }
      if (fence) { html.push(escape(line) + '\n'); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      const item = line.match(/^(?:([-*])\s+|\d+\.\s+)(.+)$/);
      if (heading) { closeList(); const level = heading[1].length; html.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
      else if (item) {
        const type = item[1] ? 'ul' : 'ol';
        if (list !== type) { closeList(); list = type; html.push(`<${type}>`); }
        html.push(`<li>${inline(item[2])}</li>`);
      } else { closeList(); if (line.trim()) html.push(`<p>${inline(line)}</p>`); }
    }
    closeList(); if (fence) html.push('</code></pre>'); return html.join('\n');
  };
  const navigation = names.map((name, index) => `<a href="${pageName(index)}">${escape(name.slice(0, -3))}</a>`).join('');
  for (const [index, name] of names.entries()) {
    const content = await readFile(new URL(encodeURIComponent(name), vault), 'utf8');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(name.slice(0, -3))} · Jarvis</title><style>
      :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#0b1115;color:#e7ede9}*{box-sizing:border-box}body{margin:0}header{padding:20px 28px;border-bottom:1px solid #26352b;display:flex;justify-content:space-between;gap:16px}a{color:#b5f477;text-decoration:underline;text-underline-offset:3px}main{display:grid;grid-template-columns:270px minmax(0,820px);gap:40px;max-width:1200px;margin:auto;padding:28px}nav{display:grid;align-content:start;gap:12px;font-size:14px}article{line-height:1.8}h1{font-size:30px;line-height:1.3;color:#b5f477}h2{font-size:21px;margin-top:28px}code,pre{font-family:Consolas,monospace;background:#152019;border-radius:4px;padding:2px 5px}pre{overflow:auto;padding:16px}li{margin-bottom:8px}:focus-visible{outline:2px solid #b5f477;outline-offset:4px}.skip{position:absolute;left:-10000px}.skip:focus{left:20px;top:4px}@media(max-width:750px){main{display:block;padding:20px}nav{margin-bottom:24px;max-height:180px;overflow:auto;border-bottom:1px solid #26352b;padding-bottom:18px}h1{font-size:25px}}
      </style></head><body><a class="skip" href="#conteudo">Pular para o guia</a><header><strong>JARVIS · SEGUNDO CÉREBRO</strong><a href="/">Voltar ao painel</a></header><main><nav aria-label="Guias do Jarvis">${navigation}</nav><article id="conteudo">${render(content)}</article></main></body></html>`;
    await writeFile(new URL(pageName(index), output), html);
  }
  return { pages: names.length };
}
