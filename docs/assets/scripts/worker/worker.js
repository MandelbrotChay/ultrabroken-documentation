/**
 * Minimal Cloudflare Worker scaffold for RAG over a precomputed wiki_index.json.
 */

const TOP_K = 6;
const SIMILARITY_THRESHOLD = 0.18; // tuneable: require this similarity to consider evidence "strong"

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
    const evidences = topCandidates.filter(s=>typeof s.score==='number' && s.score >= SIMILARITY_THRESHOLD);
    const top = topCandidates.filter(s=>s.score>0).map(s=>s.item);

    // If there are no evidence hits above the similarity threshold, return the strict fallback.
    if (!evidences || evidences.length === 0) {
      return makeSilence();
    }

    if (env){
      // Prefer OpenRouter if configured (user provides OPENROUTER_API_KEY).
      // `OPENROUTER_MODEL` is optional — when omitted, the account default model will be used.
      if (env.OPENROUTER_API_KEY){
        try{
          const contextItems = topCandidates.map(s=>({ id: s.item.id || s.item.path || null, text: s.item.text || s.item.title || '', score: s.score }));
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
          const orRes = await fetch('https://api.openrouter.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` },
            body: JSON.stringify(payloadBody)
          });
          if (orRes && orRes.ok){
            const orJson = await orRes.json().catch(()=>null);
            let modelText = '';
            if (orJson){
              if (orJson.choices && orJson.choices[0] && orJson.choices[0].message) modelText = orJson.choices[0].message.content || '';
              else if (orJson.output && Array.isArray(orJson.output) && orJson.output[0] && orJson.output[0].content) modelText = orJson.output[0].content;
              else if (orJson.result) modelText = String(orJson.result);
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
          }
        }catch(e){ /* fallthrough to other LLMs/fallbacks */ }
      }
      // If OpenRouter LLM did not yield a usable answer, strict fallback is to return 'silence'.
      return makeSilence();
    }

    // Ensure the fetch handler always returns a Response even when `env` is not provided.
    return makeSilence();
  }
};
