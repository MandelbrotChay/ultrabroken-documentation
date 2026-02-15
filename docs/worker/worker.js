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
    const makeSilence = () => new Response(JSON.stringify({ answer: 'Silence echoes back...', evidence: [], did_answer: false }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });

    const indexUrl = env.WIKI_INDEX_URL || `https://` + (env.SITE_HOSTNAME || 'nan-gogh.github.io') + `/${env.SITE_PATH || 'ultrabroken-documentation'}/wiki_index.json`;

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
    }

    const bm = index.__bm25;
    const k1 = 1.5, b = 0.75;
    const qTokens = tokenize(query);
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
        return { item: it, score };
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
            let parsed = null;
            try{ parsed = JSON.parse(modelText); }catch(e){ parsed = null; }
            if (parsed && parsed.answer) {
              return new Response(JSON.stringify({ answer: parsed.answer, evidence: evidences.slice(0,3).map(s=>({ id: s.item.id||s.item.path, similarity: s.score })), did_answer: true }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
            }
            return new Response(JSON.stringify({ answer: modelText, evidence: evidences.slice(0,3).map(s=>({ id: s.item.id||s.item.path, similarity: s.score })), did_answer: true }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
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
    // Provide title and a short preview for UI/evidence rendering (prefer `text`)
    const evidenceList = evidences.slice(0,3).map(s=>({ id: s.item.id||s.item.path, similarity: s.score, title: s.item.title, excerpt: (s.item.text || '').split('\n').slice(0,2).join(' ').slice(0,200) }));
    const debugPayload = { query, tokens: qTokens, top: topCandidates.map(s=>({ id: s.item.id||s.item.path, score: s.score, title: s.item.title })), threshold: SIMILARITY_THRESHOLD, index_len: index.length, has_openrouter_key, openrouter_error };
    if (typeof openrouter_debug !== 'undefined' && openrouter_debug) debugPayload.openrouter_debug = openrouter_debug;
    return respondFailure({ answer: null, evidence: evidenceList, did_answer: false, debug: debugPayload });
  }
};
