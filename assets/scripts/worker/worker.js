/**
 * Minimal Cloudflare Worker scaffold for RAG over a precomputed wiki_index.json.
 */

const TOP_K = 5;

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

    let scored = [];
    if (Array.isArray(index) && index.length && index[0].embedding){
      let qEmb = null;
      if (env && env.AI){
        try{
          const embResp = await env.AI.run(env.EMBEDDING_MODEL || '@cf/baai/bge-small-en-v1.5', { text: query });
          qEmb = embResp && embResp.data && embResp.data[0];
          if (!qEmb) console.log('AI binding present but returned no embedding for query:', query.slice(0,120));
        }catch(e){
          qEmb = null;
          console.log('AI.run failed, falling back to substring matching. error:', String(e));
        }
      } else {
        console.log('No env.AI binding found - using substring fallback for query:', query.slice(0,120));
      }
      if (!qEmb){
        // substring fallback: exact containment
        scored = index.map(i=>({ item:i, score: (i.text||'').toLowerCase().includes(query.toLowerCase()) ? 1 : 0 }));
        const hitCount = scored.reduce((c,s)=>c + (s.score>0?1:0), 0);
        console.log('Substring fallback scored', hitCount, 'hits for query:', query.slice(0,120));
      } else {
        scored = index.map(i=>({ item:i, score: cosine(qEmb, i.embedding||[]) }));
      }
    } else if (Array.isArray(index)){
      const qt = query.toLowerCase();
      scored = index.map(i=>({ item:i, score: ((i.text||'').toLowerCase().includes(qt) || (i.title||'').toLowerCase().includes(qt)) ? 1 : 0 }));
    } else {
      return new Response(JSON.stringify({ error: 'index format not recognized' }), { status:500, headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
    }

    scored.sort((a,b)=>b.score - a.score);
    const top = scored.slice(0, TOP_K).filter(s=>s.score>0).map(s=>s.item);

    if (env && env.AI && env.LLM_MODEL){
      try{
        const context = top.map(t=>t.text).join('\n\n');
        const system = env.SYSTEM_PROMPT || 'You are a helpful documentation assistant. Answer only from the provided context. If unknown, say "silence".';
        const resp = await env.AI.run(env.LLM_MODEL, {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Context:\n${context}\n\nQuestion:\n${query}` }
          ]
        });
        return new Response(JSON.stringify({ answer: resp && resp.response ? resp.response : '', used: top.length, candidates: top.map(t=>({title:t.title, path:t.path})) }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
      }catch(e){ }
    }

    if (!top.length) return new Response(JSON.stringify({ answer: 'silence', used:0, candidates:[] }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
    const answer = top.map(t=>t.text).slice(0,5).join('\n\n');
    return new Response(JSON.stringify({ answer, used: top.length, candidates: top.map(t=>({title:t.title, path:t.path})) }), { headers: Object.assign({'Content-Type':'application/json'}, CORS_HEADERS) });
  }
};
