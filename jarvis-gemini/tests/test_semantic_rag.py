import json
from pathlib import Path
import tempfile
import unittest

import semantic_rag


class SemanticRagTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(Path(__file__).resolve().parent))
        self.temp.cleanup()

    def test_extract_obsidian_metadata(self):
        content = """---
tags: [ia, estudos, 'python']
status: ativo
---

# Título Principal

Texto com #tag-inline e link para [[cerebro-jarvis|Cérebro]].

## Subseção Arquitetura
Mais detalhes aqui.
"""
        meta = semantic_rag.extract_obsidian_metadata(content)
        self.assertIn('ia', meta['tags'])
        self.assertIn('estudos', meta['tags'])
        self.assertIn('python', meta['tags'])
        self.assertIn('tag-inline', meta['tags'])
        self.assertIn('Título Principal', meta['headings'])
        self.assertIn('Subseção Arquitetura', meta['headings'])
        self.assertIn('cerebro-jarvis', meta['wikilinks'])

    def test_vector_similarity_and_concept_expansion(self):
        title = "Guia de Voz e Áudio"
        content = "Configuração do microfone e Whisper para falar e ouvir no Windows."
        meta = semantic_rag.extract_obsidian_metadata(content)
        vec_doc = semantic_rag.build_vector(title, content, tags=meta['tags'], headings=meta['headings'])

        # Query that uses synonyms/concepts instead of exact words
        query = "como escutar e usar som"
        vec_query = semantic_rag.build_vector("", query, is_query=True)

        sim = semantic_rag.cosine_similarity(vec_doc, vec_query)
        self.assertGreater(sim, 0.2, f"Expected semantic similarity > 0.2, got {sim}")

    def test_semantic_index_lifecycle_and_caching(self):
        idx = semantic_rag.SemanticIndex(self.root)
        note_id = "wiki/teste.md"
        title = "Nota de Teste"
        content = "# Teste\nConteúdo sobre banco de dados e performance."
        rev1 = "hash1"

        entry1 = idx.index_note(note_id, title, content, rev1)
        self.assertTrue(idx.dirty)
        idx.save()
        self.assertFalse(idx.dirty)
        self.assertTrue((self.root / 'semantic_index.json').exists())

        # Reloading should read the persisted index
        idx_reloaded = semantic_rag.SemanticIndex(self.root)
        self.assertIn(note_id, idx_reloaded.entries)
        self.assertEqual(idx_reloaded.entries[note_id]['title'], title)

        # Re-indexing with same revision should be a no-op
        entry2 = idx_reloaded.index_note(note_id, title, content, rev1)
        self.assertFalse(idx_reloaded.dirty)

        # Updating revision marks dirty
        idx_reloaded.index_note(note_id, title, content + " Mais texto", "hash2")
        self.assertTrue(idx_reloaded.dirty)

        # Removal
        idx_reloaded.remove_note(note_id)
        self.assertNotIn(note_id, idx_reloaded.entries)
        idx_reloaded.save()

    def test_hybrid_search_vs_pure_lexical(self):
        idx = semantic_rag.SemanticIndex(self.root)
        raw_notes = [
            {
                'id': 'raw/voz.md',
                'title': 'Configuração de Voz',
                'content': 'Whisper e microfone para falar com Jarvis.',
                'revision': 'rev1',
                'modified': 100
            },
            {
                'id': 'wiki/memoria.md',
                'title': 'Segundo Cérebro',
                'content': 'Organização no cofre Obsidian com notas e tarefas.',
                'revision': 'rev2',
                'modified': 200
            }
        ]

        # Lexical search for exact word
        lex_results = idx.search(raw_notes, query='whisper', mode='lexical')
        self.assertEqual(len(lex_results), 1)
        self.assertEqual(lex_results[0]['id'], 'raw/voz.md')

        # Semantic/hybrid search for concept ("guardar pensamentos no cofre")
        hybrid_results = idx.search(raw_notes, query='guardar pensamentos no cofre', mode='hybrid')
        self.assertTrue(len(hybrid_results) > 0)
        self.assertEqual(hybrid_results[0]['id'], 'wiki/memoria.md')
        self.assertGreater(hybrid_results[0]['score'], 0.1)

    def test_excerpt_coordinate_preservation(self):
        text = '# Relatório\n' + 'Introdução sem resposta.\n' * 1500 + 'Conclusão: eficiência significa economia medida.\n'
        terms = semantic_rag.search_terms('Explique eficiência')
        snippets = semantic_rag.semantic_note_excerpts(text, terms, query='Explique eficiência')

        self.assertTrue(len(snippets) > 0)
        snippet = snippets[0]
        self.assertGreater(snippet['inicio'], 20000)
        self.assertEqual(text[snippet['inicio'] - 1:snippet['fim']], snippet['texto'])
        self.assertEqual(snippet['linha_inicio'], text.count('\n', 0, snippet['inicio'] - 1) + 1)
        self.assertEqual(snippet['linha_fim'], text.count('\n', 0, max(snippet['inicio'] - 1, snippet['fim'] - 1)) + 1)


if __name__ == '__main__':
    unittest.main()
