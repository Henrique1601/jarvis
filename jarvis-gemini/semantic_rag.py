"""Semantic RAG: Local, lightweight hybrid retrieval for Obsidian vault.
Python 3.11+, zero external mandatory dependencies.
Combines subword n-gram vectorization, domain concept expansion, and lexical matching.
"""
import json
import math
from pathlib import Path
import re
import unicodedata

STOPWORDS = {
    'para', 'com', 'uma', 'que', 'das', 'dos', 'hoje', 'meu', 'minha', 'por', 'sobre', 'jarvis', 'voce',
    'de', 'a', 'o', 'e', 'do', 'da', 'em', 'um', 'os', 'no', 'se', 'na', 'mais', 'as', 'como', 'mas',
    'foi', 'ao', 'ele', 'tem', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'ha', 'nos', 'ja', 'esta',
    'eu', 'tambem', 'so', 'pelo', 'pela', 'ate', 'isso', 'ela', 'entre', 'era', 'depois', 'sem', 'mesmo',
    'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'estao', 'tinha', 'foram', 'essa', 'num',
    'nem', 'suas', 'as', 'minhas', 'tem', 'numa', 'pelos', 'elas', 'havia', 'seja', 'qual', 'sera', 'nos'
}

CONCEPT_EXPANSIONS = {
    'acelerar': {'rapido', 'rapida', 'velocidade', 'performance', 'otimizacao', 'otimizar', 'desempenho', 'benchmark', 'eficiencia', 'veloz'},
    'veloz': {'rapido', 'rapida', 'velocidade', 'performance', 'otimizacao', 'desempenho', 'acelerar'},
    'performance': {'desempenho', 'rapido', 'velocidade', 'otimizacao', 'eficiencia', 'benchmark', 'latencia', 'acelerar', 'veloz'},
    'otimizacao': {'performance', 'melhoria', 'eficiencia', 'economia', 'desempenho', 'otimizar', 'acelerar'},
    'memoria': {'cerebro', 'obsidian', 'vault', 'cofre', 'notas', 'conhecimento', 'wiki', 'historico', 'armazenar'},
    'armazenar': {'salvar', 'guardar', 'memoria', 'obsidian', 'vault', 'cofre', 'notas'},
    'guardar': {'salvar', 'armazenar', 'memoria', 'obsidian', 'vault', 'cofre', 'notas'},
    'cerebro': {'memoria', 'obsidian', 'vault', 'cofre', 'notas', 'conhecimento', 'segundo', 'wiki'},
    'seguranca': {'protecao', 'auth', 'autenticacao', 'senha', 'token', 'permissao', 'dpapi', 'segredo', 'criptografia'},
    'tarefa': {'afazer', 'pendencia', 'prioridade', 'prazo', 'todo', 'concluir', 'status'},
    'tarefas': {'afazeres', 'pendencias', 'prioridades', 'prazos', 'todo', 'concluir', 'status'},
    'voz': {'audio', 'falar', 'ouvir', 'whisper', 'microfone', 'transcricao', 'sapi', 'som'},
    'falar': {'voz', 'audio', 'ouvir', 'whisper', 'microfone', 'transcricao', 'fala'},
    'ouvir': {'voz', 'audio', 'falar', 'sapi', 'som', 'escutar'},
    'ia': {'inteligencia', 'modelo', 'llm', 'gemini', 'antigravity', 'agente', 'chat', 'prompt'},
    'inteligencia': {'ia', 'modelo', 'llm', 'gemini', 'antigravity', 'agente', 'artificial'},
    'erro': {'falha', 'bug', 'excecao', 'problema', 'defeito', 'recusa', 'bloqueio'},
    'conexao': {'rede', 'offline', 'online', 'porta', 'http', 'servidor', 'polling', 'worker', 'heartbeat'},
    'estudo': {'aprendizado', 'livro', 'resumo', 'revisao', 'conceito', 'curso', 'pratica'}
}

# Ensure bidirectional symmetry for semantic concept relationships
for _word, _syns in list(CONCEPT_EXPANSIONS.items()):
    for _syn in _syns:
        CONCEPT_EXPANSIONS.setdefault(_syn, set()).add(_word)
        for _other in _syns:
            if _other != _syn:
                CONCEPT_EXPANSIONS[_syn].add(_other)



def normalize(text):
    if not isinstance(text, str):
        return ''
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if not unicodedata.combining(c))


def search_terms(query):
    return {t for t in re.findall(r'\w+', normalize(query)) if len(t) >= 3 and t not in STOPWORDS}


def expand_terms(terms):
    expanded = set(terms)
    for term in terms:
        norm = normalize(term)
        if norm in CONCEPT_EXPANSIONS:
            expanded.update(CONCEPT_EXPANSIONS[norm])
    return expanded


def subword_ngrams(word, min_n=3, max_n=4):
    if len(word) < min_n:
        return {word}
    ngrams = set()
    bounded = f"<{word}>"
    for n in range(min_n, max_n + 1):
        for i in range(len(bounded) - n + 1):
            ngrams.add(bounded[i:i + n])
    return ngrams


def extract_obsidian_metadata(content):
    tags = set()
    headings = []
    wikilinks = []

    # Frontmatter YAML
    fm_match = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n', content, re.DOTALL)
    if fm_match:
        fm = fm_match.group(1)
        tags_match = re.search(r'tags:\s*\[(.*?)\]', fm)
        if tags_match:
            tags.update(t.strip().strip('\'"') for t in tags_match.group(1).split(',') if t.strip())
        list_tags = re.findall(r'^\s*-\s*([a-zA-Z0-9_\-]+)', fm, re.MULTILINE)
        if list_tags:
            tags.update(list_tags)

    # Inline tags (#tag)
    inline = re.findall(r'(?:^|\s)#([a-zA-Z0-9_\-\/]+)', content)
    for tag in inline:
        if not tag.startswith('#'):
            tags.add(tag)

    # Headings
    for line in content.splitlines():
        if line.startswith('#'):
            h = line.lstrip('#').strip()
            if h:
                headings.append(h)

    # Wikilinks [[target]] or [[target|label]]
    for link in re.findall(r'\[\[(.*?)\]\]', content):
        target = link.split('|')[0].strip()
        if target:
            wikilinks.append(target)

    return {'tags': sorted(tags), 'headings': headings, 'wikilinks': wikilinks}


def build_vector(title, content, tags=None, headings=None, is_query=False):
    tags = tags or []
    headings = headings or []
    weights = {}

    def add_token(token, weight):
        norm = normalize(token)
        if not norm or norm in STOPWORDS:
            return
        weights[norm] = weights.get(norm, 0.0) + weight
        if len(norm) >= 3:
            for ng in subword_ngrams(norm):
                weights['#' + ng] = weights.get('#' + ng, 0.0) + (weight * 0.35)

    if is_query:
        raw_tokens = {normalize(t) for t in re.findall(r'\w+', title + ' ' + content) if normalize(t) not in STOPWORDS}
        for token in raw_tokens:
            add_token(token, 2.0)
        for exp in expand_terms(raw_tokens):
            if exp not in raw_tokens:
                add_token(exp, 1.2)
    else:
        for token in re.findall(r'\w+', title):
            add_token(token, 4.0)
        for tag in tags:
            for token in re.findall(r'\w+', tag):
                add_token(token, 3.0)
        for heading in headings:
            for token in re.findall(r'\w+', heading):
                add_token(token, 2.0)
        for token in re.findall(r'\w+', content):
            add_token(token, 1.0)

    norm_len = math.sqrt(sum(v * v for v in weights.values()))
    if norm_len > 0:
        return {k: round(v / norm_len, 5) for k, v in weights.items()}
    return {}


def cosine_similarity(vec_a, vec_b):
    if not vec_a or not vec_b:
        return 0.0
    common = set(vec_a) & set(vec_b)
    if not common:
        return 0.0
    dot = sum(vec_a[k] * vec_b[k] for k in common)
    return max(0.0, min(1.0, dot))


def semantic_note_excerpts(content, terms, query='', max_chars=1000):
    """Extract bounded semantic windows preserving exact coordinate coordinates."""
    expanded = set(terms)
    if query:
        for t in search_terms(query):
            expanded.update(CONCEPT_EXPANSIONS.get(t, set()))

    buckets = {}
    for match in re.finditer(r'\w+', content):
        token = normalize(match.group())
        is_exact = token in terms
        is_concept = token in expanded
        if is_exact or is_concept:
            bucket_idx = match.start() // 1000
            bucket = buckets.setdefault(bucket_idx, {
                'match': match,
                'exact_terms': set(),
                'concept_terms': set(),
                'first_exact': None
            })
            if is_exact:
                bucket['exact_terms'].add(token)
                if bucket['first_exact'] is None:
                    bucket['first_exact'] = match
            if is_concept:
                bucket['concept_terms'].add(token)

    candidates = []
    for bucket in buckets.values():
        anchor_match = bucket['first_exact'] if bucket['first_exact'] is not None else bucket['match']
        start = max(0, anchor_match.start() - 180)
        end = min(len(content), start + max_chars)
        score = len(bucket['exact_terms']) * 10 + len(bucket['concept_terms'])
        candidates.append((score, start, end, anchor_match.start(), anchor_match.end()))

    if not candidates and content:
        candidates = [(0, 0, min(len(content), max_chars), 0, 1)]

    selected = []
    for _, start, end, anchor, anchor_end in sorted(candidates, key=lambda c: (-c[0], c[1])):
        if any(start < item['fim'] and end > item['inicio'] - 1 for item in selected):
            continue
        selected.append({
            'texto': content[start:end],
            'inicio': start + 1,
            'fim': end,
            'linha_inicio': content.count('\n', 0, start) + 1,
            'linha_fim': content.count('\n', 0, max(start, end - 1)) + 1,
            'match_offset': anchor - start,
            'match_length': min(anchor_end, end) - anchor
        })
        if len(selected) == 3:
            break
    return selected


class SemanticIndex:
    """Incremental index and hybrid search engine for Obsidian vault."""

    def __init__(self, root_dir):
        self.root = Path(root_dir).resolve()
        self.index_file = self.root / 'semantic_index.json'
        self.entries = {}
        self.dirty = False
        self.load()

    def load(self):
        if self.index_file.exists():
            try:
                data = json.loads(self.index_file.read_text(encoding='utf-8'))
                if isinstance(data, dict) and data.get('version') == 1 and isinstance(data.get('notes'), dict):
                    self.entries = data['notes']
            except (ValueError, OSError):
                self.entries = {}

    def save(self):
        if not self.dirty:
            return
        temp = self.index_file.with_name('.' + self.index_file.name + '.tmp')
        try:
            payload = {'version': 1, 'notes': self.entries}
            temp.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
            temp.replace(self.index_file)
            self.dirty = False
        finally:
            temp.unlink(missing_ok=True)

    def index_note(self, note_id, title, content, note_revision):
        entry = self.entries.get(note_id)
        if entry and entry.get('revision') == note_revision:
            return entry

        meta = extract_obsidian_metadata(content)
        vector = build_vector(title, content, tags=meta['tags'], headings=meta['headings'])
        self.entries[note_id] = {
            'revision': note_revision,
            'title': title,
            'tags': meta['tags'],
            'headings': meta['headings'],
            'wikilinks': meta['wikilinks'],
            'vector': vector
        }
        self.dirty = True
        return self.entries[note_id]

    def remove_note(self, note_id):
        if note_id in self.entries:
            del self.entries[note_id]
            self.dirty = True

    def sync(self, raw_notes):
        """Update or remove index entries according to current notes."""
        current_ids = set()
        for item in raw_notes:
            note_id = item['id']
            current_ids.add(note_id)
            self.index_note(note_id, item['title'], item['content'], item['revision'])
        removed = [nid for nid in self.entries if nid not in current_ids]
        for nid in removed:
            self.remove_note(nid)
        self.save()

    def search(self, raw_notes, query='', excerpts=False, mode='hybrid', alpha=0.55, top_k=100):
        terms = search_terms(query)
        q_vec = build_vector("", query, is_query=True) if query else {}

        # Ensure index is updated
        for item in raw_notes:
            self.index_note(item['id'], item['title'], item['content'], item['revision'])
        self.save()

        scored = []
        for item in raw_notes:
            title = item['title']
            content = item['content']
            note_id = item['id']
            words = set(re.findall(r'\w+', normalize(content)))
            title_words = set(re.findall(r'\w+', normalize(title)))

            # 1. Lexical score
            lex_score = sum((3 if term in title_words else 1) for term in terms if term in words or term in title_words)
            if mode == 'lexical':
                if terms and not lex_score:
                    continue
                final_score = lex_score
                sem_score = 0.0
            else:
                # 2. Semantic score
                vec = self.entries.get(note_id, {}).get('vector', {})
                sem_score = cosine_similarity(vec, q_vec)

                if mode == 'semantic':
                    final_score = sem_score
                    if sem_score <= 0.02 and terms and not lex_score:
                        continue
                else:  # hybrid
                    # Normalize lexical score: 1 match ~ 0.25, 3 matches ~ 0.75, >=4 matches ~ 1.0
                    norm_lex = min(1.0, lex_score / 4.0) if lex_score > 0 else 0.0
                    final_score = round((1.0 - alpha) * norm_lex + alpha * sem_score, 4)
                    # Filter out zero match if there was a query
                    if query and final_score <= 0.01:
                        continue

            record = {
                'id': note_id,
                'title': title,
                'content': content[:20000],
                'score': final_score,
                'lexical_score': lex_score,
                'semantic_score': round(sem_score, 4),
                'modified': item.get('modified', 0),
                'tags': self.entries.get(note_id, {}).get('tags', []),
                'folder': Path(note_id).parts[0] if len(Path(note_id).parts) > 1 else ''
            }
            if excerpts:
                record['excerpts'] = semantic_note_excerpts(content, terms, query=query)
            scored.append(record)

        # Sort: primary by score, secondary by modified, tertiary by id
        return sorted(scored, key=lambda n: (-n['score'], -n['modified'], n['id']))[:top_k]
