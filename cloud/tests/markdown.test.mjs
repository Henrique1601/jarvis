import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../jarvis-gemini/web/app.js', import.meta.url), 'utf8');
class Node {
  constructor(tag, text = '') { this.tag = tag; this.children = []; this.textContent = text; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this[name] = value; }
  set innerHTML(_) { throw Error('Raw HTML is forbidden'); }
}
const context = vm.createContext({ document: {
  createElement: tag => new Node(tag),
  createTextNode: text => new Node('#text', text)
} });
vm.runInContext(source.slice(source.indexOf('function el('), source.indexOf('function notesRender(')), context);
const render = text => context.renderAssistantMarkdown(text);
const textOf = node => node.textContent + node.children.map(textOf).join('');
const nodesOf = node => [node, ...node.children.flatMap(nodesOf)];

test('assistant Markdown renders exercises with headings, paragraphs and ordered lists', () => {
  const body = render('# Exercícios\n\nResolva **sem consultar** e use `const`.\n\n3. Primeira etapa\n4. Segunda etapa\n\n- Uma dica\n- Outra dica');
  assert.deepEqual(body.children.map(node => node.tag), ['h3', 'p', 'ol', 'ul']);
  assert.equal(body.children[2].start, 3);
  assert.equal(body.children[2].children.length, 2);
  assert.equal(textOf(body.children[1]), 'Resolva sem consultar e use const.');
  assert.equal(nodesOf(body).filter(node => node.tag === 'strong').length, 1);
  assert.equal(nodesOf(body).filter(node => node.tag === 'code').length, 1);
});

test('fenced code preserves indentation, blank lines and HTML literally', () => {
  const code = 'const element = "<img src=x onerror=alert(1)>";\n\n  console.log(`**literal**`);';
  const body = render('```javascript\n' + code + '\n```\n\nPróximo passo.');
  assert.equal(body.children[0].tag, 'pre');
  assert.equal(body.children[0].tabIndex, 0);
  assert.equal(textOf(body.children[0]), code);
  assert.deepEqual(body.children[0].children.map(node => node.tag), ['code']);
  assert.equal(body.children[1].tag, 'p');
});

test('raw HTML, scripts, images and unsafe links never create active DOM elements', () => {
  const attack = '<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n[x](javascript:alert(3))\n![photo](https://evil.example/tracker)';
  const body = render(attack);
  assert.equal(textOf(body), attack);
  assert.ok(nodesOf(body).every(node => ['div', 'p', '#text'].includes(node.tag)));
  assert.equal(body.children[0].onclick, undefined);
});

test('an unfinished fence stays code; a shorter or different fence cannot close it', () => {
  const body = render('````js\nhello\n```\n~~~\nend');
  assert.equal(textOf(body), 'hello\n```\n~~~\nend');
  assert.deepEqual(body.children.map(node => node.tag), ['pre']);
});

test('Guardar resposta opens the note editor with the exact original Markdown', () => {
  const original = '# Exercício\r\n\r\n```js\r\nconst x = 1;\r\n```';
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) {
      const node = new Node('div');
      node.replaceChildren = () => { node.children = []; };
      node.showModal = () => { node.open = true; };
      elements.set(id, node);
    }
    return elements.get(id);
  };
  const app = vm.createContext({ document: {
    getElementById: get, createElement: tag => new Node(tag),
    createTextNode: text => new Node('#text', text)
  }, fixture: original });
  vm.runInContext(source.slice(0, source.indexOf('function tasksRender(')), app);
  vm.runInContext("state={windows:false,messages:[{role:'assistant',content:fixture}]};messagesRender();", app);
  const save = nodesOf(get('messages')).find(node => node.tag === 'button' && node.textContent === 'Guardar resposta');
  assert.ok(save);
  save.onclick();
  assert.equal(get('note-content').value, original);
  assert.equal(get('note-dialog').open, true);
});

test('32k delimiters and ordinary text finish within the VM timeout', () => {
  for (const text of ['`'.repeat(32000), '*'.repeat(32000), 'a'.repeat(32000)]) {
    context.fixture = text;
    const body = vm.runInContext('renderAssistantMarkdown(fixture)', context, { timeout: 1000 });
    assert.equal(textOf(body), text.startsWith('`') ? '' : text);
  }
});
