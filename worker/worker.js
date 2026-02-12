/**
 * Minimal Cloudflare Worker scaffold for RAG over a precomputed wiki_index.json.
 *
 * Behavior:
 * - Accepts POST { "query": "..." }
 * - Fetches the JSON index from `WIKI_INDEX_URL` (env.WIKI_INDEX_URL) or site root
 * - If embeddings exist in the index, computes cosine similarity and returns top-K chunks
 * - If Cloudflare `env.AI` is available and configured, can compute embeddings and/or call an LLM
 * - Returns JSON: { answer, used, candidates }
 */

const TOP_K = 5;

function cosine(a, b){
  let dot=0, na=0, nb=0;
  for(let i=0;i<a.length;i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) || 1);
}

async function fetchIndex(url){
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch index: '+res.status);
  return await res.json();
}

export default {
  async fetch(req, env){
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await req.json().catch(()=>({}));
    const query = (body && body.query) ? String(body.query) : '';
    if (!query) return new Response(JSON.stringify({ error: 'missing query' }), { status:400, headers:{'Content-Type':'application/json'} });

    const indexUrl = env.WIKI_INDEX_URL || `https://` + (env.SITE_HOSTNAME || 'nan-gogh.github.io') + `/${env.SITE_PATH || 'ultrabroken-documentation'}/wiki_index.json`;

    let index;
    try{ index = await fetchIndex(indexUrl); } catch(e){
      return new Response(JSON.stringify({ error: 'could not load index', detail: String(e) }), { status:500, headers:{'Content-Type':'application/json'} });
    }

    // If index items have an `embedding` array and Cloudflare AI not required,
    // compute cosine similarity locally and return top-K texts.
    let scored = [];
    if (Array.isArray(index) && index.length && index[0].embedding){
      // We need a query embedding: try using env.AI if available
      let qEmb = null;
      if (env && env.AI){
        try{
          const embResp = await env.AI.run(env.EMBEDDING_MODEL || '@cf/baai/bge-small-en-v1.5', { text: query });
          qEmb = embResp && embResp.data && embResp.data[0];
        }catch(e){ qEmb = null; }
      }
      if (!qEmb){
        // If we can't produce embeddings, fall back to basic substring scoring
        scored = index.map(i=>({ item:i, score: (i.text||'').toLowerCase().includes(query.toLowerCase()) ? 1 : 0 }));
      } else {
        scored = index.map(i=>({ item:i, score: cosine(qEmb, i.embedding||[]) }));
      }
    } else if (Array.isArray(index)){
      // No embeddings in index: fallback to simple token matching
      const qt = query.toLowerCase();
      scored = index.map(i=>({ item:i, score: ((i.text||'').toLowerCase().includes(qt) || (i.title||'').toLowerCase().includes(qt)) ? 1 : 0 }));
    } else {
      return new Response(JSON.stringify({ error: 'index format not recognized' }), { status:500, headers:{'Content-Type':'application/json'} });
    }

    scored.sort((a,b)=>b.score - a.score);
    const top = scored.slice(0, TOP_K).filter(s=>s.score>0).map(s=>s.item);

    // If Cloudflare LLM is available, ask it for a concise answer using the top chunks.
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
        return new Response(JSON.stringify({ answer: resp && resp.response ? resp.response : '', used: top.length, candidates: top.map(t=>({title:t.title, path:t.path})) }), { headers:{'Content-Type':'application/json'} });
      }catch(e){ /* fallthrough to returning raw chunks */ }
    }

    // Fallback: return the joined top chunks (or 'silence' if none)
    if (!top.length) return new Response(JSON.stringify({ answer: 'silence', used:0, candidates:[] }), { headers:{'Content-Type':'application/json'} });
    const answer = top.map(t=>t.text).slice(0,5).join('\n\n');
    return new Response(JSON.stringify({ answer, used: top.length, candidates: top.map(t=>({title:t.title, path:t.path})) }), { headers:{'Content-Type':'application/json'} });
  }
};
