import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildHelp } from '../help-build.mjs';

test('public help navigates between guides and renders untrusted HTML as literal text', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'jarvis-help-'));
  try {
    const vault = join(folder, 'Segundo Cerebro Jarvis');
    await mkdir(vault); await mkdir(join(folder, 'cloud'));
    await writeFile(join(vault, '00 Comece aqui.md'), '# Comece aqui\n\n[[01 Uso]]\n\n<script>alert(1)</script>');
    await writeFile(join(vault, '01 Uso.md'), '# Uso\n\n1. Abrir\n2. Conferir\n\n[[00 Comece aqui]]');
    const result = await buildHelp(pathToFileURL(join(folder, 'cloud') + '/'));
    assert.equal(result.pages, 2);
    const page = await readFile(join(folder, 'cloud/public/help/index.html'), 'utf8');
    assert.ok(page.includes('href="guia-1.html"'));
    assert.ok(page.includes('&lt;script&gt;'));
    assert.ok(!page.includes('<script>'));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('project second brain has no missing internal links', async () => {
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../../Segundo Cerebro Jarvis/', import.meta.url);
  const names = (await readdir(root)).filter(name => name.endsWith('.md'));
  const titles = new Set(names.map(name => name.slice(0, -3)));
  assert.ok(names.length >= 14);
  for (const name of names) {
    const note = await readFile(new URL(encodeURIComponent(name), root), 'utf8');
    for (const match of note.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g))
      assert.ok(titles.has(match[1]), `${name}: ${match[1]}`);
  }
});
