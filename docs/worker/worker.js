/**
 * Minimal Cloudflare Worker scaffold for RAG over a precomputed wiki_index.json.
 */

// Increase TOP_K to collect more candidates (we'll deduplicate by path for evidence)
const TOP_K = 12;
// Lower threshold so BM25 hits on reasonable queries; tune up if too noisy.
const SIMILARITY_THRESHOLD = 0.02;
// Global debug toggle (set true to return full debug payloads to any request).
// Change this in-code when you want repository-wide debugging; not a secret.
const RETURN_DEBUG = false;

const APPEND_RESPONSE_SOURCES = true;
// When true, include the Worker-collected retrieval evidence in the response
// as `evidence`. When false, `evidence` will be an empty array to reduce
// payload size and network footprint.
const APPEND_WORKER_EVIDENCE = true;

function cosine(a, b){
  let dot=0, na=0, nb=0;
  for(let i=0;i<a.length;i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) || 1);
}

async function fetchIndex(url){
  // Prefer compressed index when available to save bandwidth.
  // Try fetching url with .gz suffix first, then fall back to plain JSON.
  const gzUrl = url.endsWith('.gz') ? url : url.replace(/\.json$/, '.json.gz');
  try{
    const gzRes = await fetch(gzUrl);
    if (gzRes.ok && gzRes.body){
      // Use streaming decompression when available (Workers support DecompressionStream).
      try{
        if (typeof DecompressionStream !== 'undefined'){
          const ds = gzRes.body.pipeThrough(new DecompressionStream('gzip'));
          const text = await new Response(ds).text();
          return JSON.parse(text);
        }
      }catch(e){
        // If decompression failed, fallthrough to try uncompressed
        console.warn('gz decompression failed, falling back:', e);
      }
    }
  }catch(e){
    // ignore and try uncompressed
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch index: '+res.status);
  return await res.json();
}

export default {
  async fetch(req, env){
    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

    const body = await req.json().catch(()=>({}));
    const query = (body && body.query) ? String(body.query) : '';
    if (!query) return new Response(JSON.stringify({ error: 'missing query' }), { status:400, headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });

    // Centralized silence response so all sanity checks go through one place.
    // New schema: { response_text, response_sources, sources, evidence }
    // Respect top-level flags so silence payload shape matches normal responses.
    const makeSilence = () => new Response(JSON.stringify({
      response_text: 'Silence echoes back...',
      response_sources: null,
      sources: [],
      evidence: []
    }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });

    const indexUrl = env.WIKI_INDEX_URL || `https://` + (env.SITE_HOSTNAME || 'nan-gogh.github.io') + `/${env.SITE_PATH || 'ultrabroken-documentation'}/wiki_index.json.gz`;

    // Try to read parsed index from the Worker cache first to avoid refetch+parse on every request.
    let index;
    try{
      const cacheKey = new Request(indexUrl);
      const cached = await caches.default.match(cacheKey);
      if (cached){
        try{ index = await cached.json(); } catch(e){ index = null; }
      }
      if (!index){
        index = await fetchIndex(indexUrl);
        try{
          const resp = new Response(JSON.stringify(index), { headers: {'Content-Type':'application/json'} });
          resp.headers.set('Cache-Control', 'public, max-age=3600');
          await caches.default.put(cacheKey, resp.clone());
        }catch(e){ /* ignore cache put failures */ }
      }
    }catch(e){
      return new Response(JSON.stringify({ error: 'could not load index', detail: String(e) }), { status:500, headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
    }

    // Use BM25 lexical retrieval over the precomputed index (no runtime embedding calls).
    let scored = [];
    if (!Array.isArray(index)){
      return new Response(JSON.stringify({ error: 'index format not recognized' }), { status:500, headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
    }

    // Tokenizer
    const tokenize = (s) => (String(s||'').toLowerCase().match(/\w+/g) || []);

    // Conservative, case-sensitive query filter for BM25
    // Editable lists: tune QUESTION_WORDS, COMMON_LOWERCASE_STOPWORDS, WHITELIST
    const QUESTION_WORDS = new Set(['what','how','why','where','when','which','who','whom','whose']);
    const COMMON_LOWERCASE_STOPWORDS = new Set(['the','a','an','to','of','in','on','for','by','with','and','or','is','are']);
    const WHITELIST = new Set(['Zuggle','Tulin','Overload']); // add domain-specific terms here
    // Synonym sets: group equivalent terms/phrases together. Each array is a
    // symmetric set — when any member is matched, we can emit the others.
    const SYNONYM_SETS = Object.freeze([
      ['oob', 'out of bounds', 'out-of-bounds'],
      ['sld', 'persistent save load object transfer'],
      ['sd', 'stick_desync', 'stick desync'],
      ['Ultrabroken', 'ultrabreak', 'UB']
    ]);

    // Build a lookup: member (lowercased) -> array of other members in the same set.
    // Also build a list of multi-word synonym phrases (parts) for greedy matching.
    const { SYNONYMS_MAP, SYNONYM_PHRASES } = (() => {
      const map = Object.create(null);
      const phrases = [];
      for (const set of SYNONYM_SETS){
        for (const member of set){
          const key = String(member).toLowerCase();
          map[key] = map[key] || [];
          for (const other of set){
            if (String(other) === String(member)) continue;
            if (!map[key].includes(other)) map[key].push(other);
          }
          // record multi-word/hyphenated members for greedy matching
          const parts = String(member).split(/[\s_\-]+/).filter(Boolean).map(p=>p.toLowerCase());
          if (parts.length > 1){
            phrases.push({ parts, phrase: parts.join(' ') });
          }
        }
      }
      // Sort phrases by descending length to prefer longest matches first
      phrases.sort((a,b) => b.parts.length - a.parts.length);
      return { SYNONYMS_MAP: Object.freeze(map), SYNONYM_PHRASES: Object.freeze(phrases) };
    })();

    const filterQueryForRetrieval = (query) => {
      if (!query) return '';
      // conservative whitespace split (preserve punctuation for later decisions)
      const raw = String(query).trim().split(/\s+/);
      const tokens = [];

      // Helper to check TitleCase (first char upper, rest lower)
      const isTitleCase = (t) => /^[A-Z][a-z]+$/.test(t);

      // Precompute multi-word whitelist entries (split on spaces or underscores)
      const whitelistMulti = [];
      for (const w of WHITELIST){
        if (/\s|_/.test(w)) whitelistMulti.push(String(w).split(/[\s_]+/));
      }

      for (let i = 0; i < raw.length; i++){
        const r = raw[i];
        // strip surrounding punctuation but keep internal chars (hyphens/underscores)
        const stripped = (r||'').replace(/^[^\w]+|[^\w]+$/g,'');
        if (!stripped) continue;
        // Greedy multi-word synonym phrase matching (case-insensitive)
        let matchedSyn = false;
        if (SYNONYM_PHRASES && SYNONYM_PHRASES.length){
          for (const sp of SYNONYM_PHRASES){
            let ok = true;
            for (let k = 0; k < sp.parts.length; k++){
              const idx = i + k;
              if (idx >= raw.length) { ok = false; break; }
              const cand = (raw[idx]||'').replace(/^[^\w]+|[^\w]+$/g,'').toLowerCase();
              if (cand !== sp.parts[k]) { ok = false; break; }
            }
            if (ok){
              tokens.push(sp.phrase); // normalized lowercased phrase
              i = i + sp.parts.length - 1; // skip consumed tokens
              matchedSyn = true;
              break;
            }
          }
        }
        if (matchedSyn) continue;
        // Multi-word whitelist: match sequence starting at `i` against any multi-entry
        let matchedMulti = false;
        if (whitelistMulti.length > 0){
          for (const parts of whitelistMulti){
            let ok = true;
            for (let k = 0; k < parts.length; k++){
              const idx = i + k;
              if (idx >= raw.length) { ok = false; break; }
              const cand = (raw[idx]||'').replace(/^[^\w]+|[^\w]+$/g,'');
              if (cand !== parts[k]) { ok = false; break; }
            }
            if (ok){
              // emit separate words for the whitelist multi-word entry
              for (const p of parts) tokens.push(p);
              i = i + parts.length - 1;
              matchedMulti = true;
              break;
            }
          }
        }
        if (matchedMulti) continue;
        // Whitelist exact tokens (case-sensitive)
        if (WHITELIST.has(stripped)) { tokens.push(stripped); continue; }
        // Always remove question words (case-insensitive)
        if (QUESTION_WORDS.has(stripped.toLowerCase())) continue;
        // Preserve acronyms (ALLCAPS length>=2)
        if (stripped === stripped.toUpperCase() && stripped.length >= 2) { tokens.push(stripped); continue; }
        // Preserve tokens containing digits, hyphens or underscores
        if (/[0-9]|-|_/.test(stripped)) { tokens.push(stripped); continue; }
        // TitleCase sequence detection: collect run and join with underscore
          if (isTitleCase(stripped)){
            const run = [stripped];
            let j = i+1;
            while (j < raw.length){
              const next = (raw[j]||'').replace(/^[^\w]+|[^\w]+$/g,'');
              if (!isTitleCase(next)) break;
              run.push(next);
              j++;
            }
            if (run.length > 1){
              // Emit separate words only (no joined form) so BM25 can match individual tokens.
              for (const w of run) tokens.push(w);
              i = j-1; // skip consumed
              continue;
            }
            // single TitleCase word: keep it (may be a proper noun)
            tokens.push(stripped);
            continue;
          }
        // Lowercase stopwords: only remove when token is exactly lowercase
        if (stripped === stripped.toLowerCase() && COMMON_LOWERCASE_STOPWORDS.has(stripped)) continue;
        // Short lowercase tokens (<=2) are removed unless whitelisted
        if (stripped.length <= 2 && stripped === stripped.toLowerCase()) continue;
        // Default: keep token
        tokens.push(stripped);
      }

      // Minimum token fallback = 1: if zero tokens after filtering, relax and keep first non-question token
      if (tokens.length === 0){
        for (const r of String(query).trim().split(/\s+/)){
          const s = (r||'').replace(/^[^\w]+|[^\w]+$/g,'');
          if (!s) continue;
          if (QUESTION_WORDS.has(s.toLowerCase())) continue;
          tokens.push(s);
          break;
        }
      }

      // Return a string suitable for existing `tokenize` (it will lowercase and split on \w+)
      // Conservative query-time expansion: emit up to N synonyms per token (N=2)
      const expandTokens = (tokensList, maxPer=2) => {
        if (!tokensList || !tokensList.length) return tokensList;
        const seen = new Set();
        const out = [];
          for (const t of tokensList){
          out.push(t);
          const lower = String(t).toLowerCase();
          seen.add(lower);
          const syn = SYNONYMS_MAP[lower];
          if (Array.isArray(syn) && syn.length){
            let added = 0;
            for (const s of syn){
              if (added >= maxPer) break;
              const sLower = String(s).toLowerCase();
              if (seen.has(sLower)) continue;
              out.push(s);
              seen.add(sLower);
              added++;
            }
          }
        }
        return out;
      };

      const finalTokens = expandTokens(tokens, 2);
      return finalTokens.join(' ');
    };

    // Prepare BM25 structures on first load and attach to index to reuse across requests.
    if (!index.__bm25){
      const N = index.length;
      const docs = [];
      const df = Object.create(null);
      let totalLen = 0;
      for (let i=0;i<N;i++){
        const it = index[i];
        const text = [it.title || '', it.text || ''].join(' ');
        const tokens = tokenize(text);
        const tf = Object.create(null);
        for (const t of tokens){ tf[t] = (tf[t]||0) + 1; }
        const docLen = tokens.length;
        totalLen += docLen;
        const seen = Object.create(null);
        for (const t of Object.keys(tf)){ if (!seen[t]){ df[t] = (df[t]||0) + 1; seen[t]=1; } }
        docs.push({ tf, docLen });
      }
      const avgLen = N>0 ? totalLen / N : 0;
      const idf = Object.create(null);
      for (const t of Object.keys(df)){
        idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      }
      index.__bm25 = { N, docs, df, idf, avgLen };
      // Build fast lookup maps and backlink map for better evidence matching
      const pathMap = Object.create(null);
      const idMap = Object.create(null);
      const titleMap = Object.create(null);
      const backlinks = Object.create(null);
      const normalizePath = (p) => String(p || '').replace(/\\/g, '/');
      const extractLinks = (txt) => (String(txt||'').match(/\/wiki\/[\w\-\/]+/g) || []).map(s=>s.replace(/\/$/, ''));
      for (let i=0;i<N;i++){
        const it = index[i];
        const p = it.path || it.id || null;
        if (p) pathMap[normalizePath(p).replace(/\/$/, '')] = it;
        if (it.id) idMap[String(it.id)] = it;
        if (it.title) titleMap[String((it.title||'').toLowerCase())] = it;
      }
      // build backlinks: scan each doc for /wiki/... references and map them
      for (let i=0;i<N;i++){
        const it = index[i];
        const links = extractLinks(it.text || it.title || '');
        for (const l of links){
          const key = l.replace(/\/$/, '');
          if (!backlinks[key]) backlinks[key] = [];
          backlinks[key].push(it);
        }
      }
      index.__maps = { pathMap, idMap, titleMap, backlinks };
    }

    const bm = index.__bm25;
    const k1 = 1.5, b = 0.75;
    const qTokens = tokenize(filterQueryForRetrieval(query));
    if (qTokens.length === 0){
      scored = index.map(i=>({ item:i, score: 0 }));
    } else {
      // compute term frequencies in query to weight terms (optional)
      const qtf = Object.create(null);
      for (const t of qTokens) qtf[t] = (qtf[t]||0) + 1;
      scored = index.map((it, idx) => {
        const doc = bm.docs[idx];
        let score = 0;
        for (const t of Object.keys(qtf)){
          const idf_t = bm.idf[t] || 0;
          const tf = doc.tf[t] || 0;
          const denom = tf + k1 * (1 - b + b * (doc.docLen / (bm.avgLen || 1)));
          const tfWeight = denom>0 ? ((k1 + 1) * tf) / denom : 0;
          score += idf_t * tfWeight;
        }
        // lightweight title overlap boost: if query tokens overlap title tokens, slightly boost score
        let titleBoost = 0;
        if (it.title){
          const titleTokens = tokenize(it.title);
          const setA = Object.create(null), setB = Object.create(null);
          for (const t of qTokens) setA[t]=1;
          for (const t of titleTokens) setB[t]=1;
          let inter = 0;
          for (const t of Object.keys(setA)) if (setB[t]) inter++;
          const overlap = Math.max(setA && Object.keys(setA).length ? inter / Math.max(Object.keys(setA).length,1) : 0, 0);
          titleBoost = overlap; // 0..1
        }
        const finalScore = score * (1 + (titleBoost * 0.25));
        return { item: it, score: finalScore, raw_score: score };
        });
      }

    scored.sort((a,b)=>b.score - a.score);
    const topCandidates = scored.slice(0, TOP_K);
    const top = topCandidates.filter(s=>s.score>0).map(s=>s.item);
    // Deduplicate evidences by `path` to ensure multiple files are referenced
    const evidences = [];
    const seenPaths = Object.create(null);
    for (const s of topCandidates){
      if (typeof s.score !== 'number' || s.score < SIMILARITY_THRESHOLD) continue;
      const p = (s.item && (s.item.path || s.item.id)) || null;
      const key = p ? String(p) : (s.item && s.item.id) || null;
      if (key && !seenPaths[key]){
        evidences.push(s);
        seenPaths[key] = 1;
      }
      if (evidences.length >= 3) break;
    }

    // Prepare a stable evidence list (title + short preview) to return with answers
    // Use full `text` for model context but provide a small `text_preview` for UI.
    // Include referencing files (backlinks) for each evidence to provide independent file references
    const maps = index.__maps || {};
    const evidenceList = evidences.slice(0,3).map(s=>{
      const item = s.item;
      const canonicalPath = (item.path || item.id || '').replace(/\/$/, '');
      const refs = (maps.backlinks && maps.backlinks[canonicalPath]) || [];
      const uniqueRefs = [];
      const seen = Object.create(null);
      for (const r of refs){
        const k = r.id || r.path || r.title;
        if (!k || seen[k]) continue;
        seen[k]=1;
        uniqueRefs.push({ id: r.id||r.path, title: r.title, text_preview: (r.text||'').split('\n').slice(0,2).join(' ').slice(0,200) });
        if (uniqueRefs.length >= 3) break;
      }
      return {
        id: item.id||item.path,
        similarity: s.score,
        title: item.title,
        text_preview: (item.text || '').split('\n').slice(0,2).join(' ').slice(0,200),
        referenced_by: uniqueRefs
      };
    });

    // If debug requested, return top candidate scores to help tune threshold.
    if (body && body.debug) {
      const dbg = topCandidates.map(s=>({ id: s.item.id||s.item.path, score: s.score, title: s.item.title }));
      return new Response(JSON.stringify({ debug: true, query, tokens: qTokens, top: dbg, threshold: SIMILARITY_THRESHOLD, index_len: index.length }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
    }

    // If there are no evidence hits above the similarity threshold, return debug details
    // instead of a silent response to aid debugging and tuning.
    // Helper: decide whether to return detailed debug payload or user-friendly silence
    const respondFailure = (payload) => {
      const headers = Object.assign({'Content-Type':'application/json'}, CORS_HEADERS);
      const wantDebug = (typeof RETURN_DEBUG !== 'undefined' && RETURN_DEBUG) || (body && body.debug);
      if (wantDebug) return new Response(JSON.stringify(payload), { headers });
      return makeSilence();
    };

    if (!evidences || evidences.length === 0) {
      const dbg = topCandidates.map(s=>({ id: s.item.id||s.item.path, score: s.score, title: s.item.title }));
      return respondFailure({ answer: null, evidence: dbg.slice(0,3), did_answer: false, debug: { query, tokens: qTokens, top: dbg, threshold: SIMILARITY_THRESHOLD, index_len: index.length } });
    }

    // If OpenRouter is configured, try to synthesize an answer from the retrieved evidence.
    let openrouter_error = null;
    let openrouter_debug = null;
    const has_openrouter_key = !!(env && env.OPENROUTER_API_KEY);
    if (has_openrouter_key) {
      try {
        // Prefer a cleaned `excerpt` and include `title` separately so the model sees the canonical title
        const contextItems = topCandidates.map(s=>({
          id: s.item.id || s.item.path || null,
          title: s.item.title || null,
          // Prefer the full chunk `text` so the model sees step-by-step
          // instructions; fall back to `title` if `text` is not present.
          text: s.item.text || s.item.title || '',
          score: s.score
        }));
        const system = env.SYSTEM_PROMPT || 'You are a concise technical editor. Use only the provided context to answer. If none of the context answers the question, reply exactly with NO_RELEVANT_INFO.';
        const payloadBody = {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify({ query, context: contextItems.slice(0, TOP_K), meta: { top_k: TOP_K, threshold: SIMILARITY_THRESHOLD } }) }
          ],
          temperature: 0.0,
          max_tokens: 800
        };
        if (env.OPENROUTER_MODEL) payloadBody.model = env.OPENROUTER_MODEL;
        // Call OpenRouter and capture detailed debug info (timing, status, headers, truncated body)
        let or_debug = { request_payload_excerpt: null, status: null, duration_ms: null, response_excerpt: null, response_json_keys: null, headers: null };
        try {
          const start = Date.now();
          const reqBodyStr = JSON.stringify(payloadBody);
          if (reqBodyStr.length > 2000) or_debug.request_payload_excerpt = reqBodyStr.slice(0,2000) + '...[truncated]'; else or_debug.request_payload_excerpt = reqBodyStr;

          const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` },
            body: reqBodyStr
          });
          or_debug.duration_ms = Date.now() - start;
          or_debug.status = orRes.status;
          // capture headers (shallow)
          try{
            const h = {};
            for (const [k,v] of orRes.headers.entries()){
              h[k] = v;
            }
            or_debug.headers = h;
          }catch(e){ or_debug.headers = { error: String(e) }; }

          // read response as text so we can both log and attempt to parse
          const orText = await orRes.text().catch(()=>null);
          if (orText == null) or_debug.response_excerpt = null;
          else if (orText.length > 2000) or_debug.response_excerpt = orText.slice(0,2000) + '...[truncated]';
          else or_debug.response_excerpt = orText;

          let orJson = null;
          try{ orJson = orText ? JSON.parse(orText) : null; }catch(e){ orJson = null; }
          if (orJson && typeof orJson === 'object') or_debug.response_json_keys = Object.keys(orJson);

          if (!orRes.ok){
            openrouter_error = `openrouter status ${orRes.status}`;
            console.error('OpenRouter non-OK response', { status: orRes.status, duration_ms: or_debug.duration_ms });
          }

          let modelText = '';
          if (orJson){
            if (orJson.choices && orJson.choices[0] && orJson.choices[0].message) modelText = orJson.choices[0].message.content || '';
            else if (orJson.output && Array.isArray(orJson.output) && orJson.output[0] && orJson.output[0].content) modelText = orJson.output[0].content;
            else if (orJson.result) modelText = String(orJson.result);
          } else if (orText){
            modelText = orText;
          }
          modelText = String(modelText || '').trim();
          if (modelText && modelText.length >= 4 && !/^(silence|no_relevant_info|no_relevant_information|noinfo)$/i.test(modelText)){
            // Helper to detect the canonical Sources block (a single line 'Sources:' followed by entries)
            const hasSources = (txt) => { try{ return /(^|\n)Sources:\s*($|\n)/m.test(String(txt||'')); }catch(e){ return false; } };

            // splitResponseAndSources: separate model text into main response and raw Sources block
            const splitResponseAndSources = (txt) => {
              const result = { response_text: String(txt||''), response_sources: null };
              try{
                const lines = String(txt||'').split(/\r?\n/);
                let idx = -1;
                for (let i = 0; i < lines.length; i++){
                  if (/^\s*Sources?\b[:\s]/i.test(lines[i])) { idx = i; break; }
                }
                if (idx === -1) return result;
                const srcLines = lines.slice(idx).map(l=>l.trim()).filter(Boolean);
                result.response_sources = srcLines.join('\n');
                result.response_text = lines.slice(0, idx).join('\n').trim();
                return result;
              }catch(e){ return result; }
            };

            // parseSourcesBlock: parse the raw `response_sources` block into structured `sources[]`
            const parseSourcesBlock = (block) => {
              if (!block) return [];
              const srcLines = String(block||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
              const entries = [];
              for (let i = 0; i < srcLines.length; i++){
                let line = srcLines[i];
                const m = line.match(/^Sources?:\s*(.+)$/i);
                let rest = [];
                if (m && m[1]) rest = String(m[1]).split(/\s*;\s*/).map(p=>p.trim()).filter(Boolean);
                else if (/^Sources?:\s*$/i.test(line)){
                  // consume following lines and skip them by advancing i
                  let j;
                  for (j = i+1; j < srcLines.length; j++){
                    const next = srcLines[j].trim();
                    if (!next) break;
                    rest.push(next);
                  }
                  i = j - 1; // skip consumed lines
                } else {
                  rest = [line];
                }
                for (const part of rest){
                  let p = part.replace(/^Sources?:\s*/i,'').replace(/^[\-\*\u2022\s]+/,'').replace(/[\-–—\s]+$/,'').trim();
                  if (!p || p.length < 2) continue;
                  const mm = p.match(/^(.+?)\s*[–—-]\s*(\/?\S+)$/);
                  if (mm){
                    const title = mm[1].trim();
                    const rawPath = mm[2];
                    const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath.replace(/^\/+/, '');
                    entries.push({ title, path });
                  } else {
                    entries.push({ title: p, path: null });
                  }
                }
              }
              return entries;
            };

            // If the model response lacks the required Sources block, attempt one immediate re-query.
            if (!hasSources(modelText)){
              try{
                // Re-run the exact same request once (quick retry) to attempt a complete reply.
                const retryRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` },
                  body: JSON.stringify(payloadBody)
                });
                const retryText = await retryRes.text().catch(()=>null);
                let retryJson = null;
                try{ retryJson = retryText ? JSON.parse(retryText) : null; }catch(e){ retryJson = null; }
                let retryModelText = '';
                if (retryJson){
                  if (retryJson.choices && retryJson.choices[0] && retryJson.choices[0].message) retryModelText = retryJson.choices[0].message.content || '';
                  else if (retryJson.output && Array.isArray(retryJson.output) && retryJson.output[0] && retryJson.output[0].content) retryModelText = retryJson.output[0].content;
                  else if (retryJson.result) retryModelText = String(retryJson.result);
                } else if (retryText){
                  retryModelText = retryText;
                }
                retryModelText = String(retryModelText || '').trim();
                if (!hasSources(retryModelText)){
                  // Second attempt failed to produce Sources — return canonical silence to caller
                  return makeSilence();
                }
                // Use the retryModelText as the final modelText if it contains Sources
                modelText = retryModelText;
              }catch(retryErr){
                // On any retry error, fall back to silence
                return makeSilence();
              }
            }

            // Split model output into response_text and a raw response_sources block
            const parsedModel = splitResponseAndSources(modelText);
            // Allow model to sometimes return JSON blobs with `answer` — prefer that if present
            let parsedJson = null;
            try{ parsedJson = JSON.parse(modelText); }catch(e){ parsedJson = null; }
            let finalResponseText = parsedModel.response_text;
            let finalResponseSources = parsedModel.response_sources || null;
            // Build structured sources from the raw response_sources block (prefer this)
            let finalSources = finalResponseSources ? parseSourcesBlock(finalResponseSources) : [];
            if (parsedJson && typeof parsedJson === 'object'){
              if (parsedJson.answer && !finalResponseText) finalResponseText = String(parsedJson.answer || '').trim();
              if (Array.isArray(parsedJson.sources) && parsedJson.sources.length) finalSources = parsedJson.sources;
              if (parsedJson.response_sources && !finalResponseSources) {
                finalResponseSources = parsedJson.response_sources;
                // if we didn't already parse sources from response_sources, do so now
                if (!finalSources || finalSources.length === 0) finalSources = parseSourcesBlock(finalResponseSources);
              }
            }

            // Use APPEND_RESPONSE_SOURCES directly (declared at top of file)
            const payload = {
              response_text: finalResponseText || modelText,
              response_sources: APPEND_RESPONSE_SOURCES ? (finalResponseSources || null) : null,
              // `sources` is exclusively the model-parsed citations (do not merge retrieval evidence here)
              sources: finalSources || [],
              // `evidence` contains authoritative retrieval hits and is optional to reduce payload size
              evidence: APPEND_WORKER_EVIDENCE ? evidenceList : []
            };
            return new Response(JSON.stringify(payload), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
          }
          // attach the OpenRouter debug info to the outer scope so it can be returned if we fallthrough
          openrouter_error = openrouter_error || null;
          if (typeof or_debug !== 'undefined') openrouter_debug = or_debug;
        } catch(innerErr){
          openrouter_error = String(innerErr);
          console.error('OpenRouter inner call threw', innerErr);
          if (typeof or_debug !== 'undefined') openrouter_debug = or_debug;
        }
      } catch(e){
        openrouter_error = String(e);
        console.error('OpenRouter call threw', e);
      }
    }
    // If OpenRouter is not configured or did not produce a usable answer, return evidence/debug
    // rather than an unconditional silence so the UI can surface the retrieved candidates.
    // Provide title and a short preview for UI/evidence rendering (prefer `text`).
    // `evidenceList` was prepared earlier so we can return it with model answers.
    const debugPayload = { query, tokens: qTokens, top: topCandidates.map(s=>({ id: s.item.id||s.item.path, score: s.score, title: s.item.title })), threshold: SIMILARITY_THRESHOLD, index_len: index.length, has_openrouter_key, openrouter_error };
    if (typeof openrouter_debug !== 'undefined' && openrouter_debug) debugPayload.openrouter_debug = openrouter_debug;
    return respondFailure({ answer: null, evidence: evidenceList, did_answer: false, debug: debugPayload });
  }
};
