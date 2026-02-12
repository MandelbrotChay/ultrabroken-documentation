/*
  ai-search.js
  Lightweight client-side AI-style search for MkDocs sites.

  Behavior:
  - Attempts to load MkDocs search index at /search/search_index.json
  - Scores pages by simple token matches in titles and docnames
  - Fetches top candidate pages' HTML and extracts text snippets
  - Generates a short answer by returning matching sentences; returns "silence" if none
  - Optional: if user provides a Hugging Face API key in localStorage('hf_api_key'), it will send the retrieved snippets to HF Inference API for a better generated answer.

  Notes:
  - This is intentionally dependency-free and works offline for the retrieval part if the site provides a search index.
  - No server-side component required. Using external LLM APIs is optional and requires a key.
*/

(function(){
  const ID = 'ai-search-widget';

  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> e.setAttribute(k,v));
    (Array.isArray(children)?children:[children]).forEach(c=>{ if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if (c) e.appendChild(c); });
    return e;
  }

  async function tryFetchIndex(){
    // Try multiple likely locations for the index. Sites can be deployed at a
    // subpath (GitHub Pages project pages). We'll attempt relative, root-absolute,
    // origin-absolute and a likely repo-root path derived from the pathname.
    const origin = (location && location.origin) ? location.origin.replace(/\/$/,'') : '';
    const pathname = (location && location.pathname) ? location.pathname : '/';
    const segments = pathname.split('/').filter(Boolean);
    const repoRoot = segments.length ? ('/' + segments[0]) : '';
    const basePath = pathname.replace(/\/[^\/]*$/, '/');

    const join = (a,b) => (''+a).replace(/\/$/,'') + '/' + (''+b).replace(/^\//,'');

    const tries = [
      'search/search_index.json',
      './search/search_index.json',
      '/search/search_index.json',
      origin + '/search/search_index.json',
      origin + join(repoRoot, 'search/search_index.json'),
      origin + join(basePath, 'search/search_index.json'),
      join(basePath, 'search/search_index.json'),
      join(repoRoot, 'search/search_index.json')
    ];

    // (raw.githubusercontent fallback removed — kept lookup to origin/repoRoot/basePath)

    const tried = [];
    for(const p of tries){
      if (!p) continue;
      tried.push(p);
      try{
        const res = await fetch(p);
        if (!res.ok) continue;
        const json = await res.json();
        return {json,p,tried};
      }catch(e){ /* ignore */ }
    }
    return {json:null, p:null, tried};
  }

  function tokenize(s){
    return (s||'').toLowerCase().match(/[\p{L}0-9]+/gu) || [];
  }

  function scoreDoc(qTokens, title, docname){
    let score = 0;
    const txt = (title||'') + ' ' + (docname||'');
    const tokens = tokenize(txt);
    for(const t of qTokens){
      for(const tok of tokens) if (tok.includes(t)) score += 1;
    }
    return score;
  }

  function extractSentences(htmlText, qTokens){
    const sentences = htmlText.split(/(?<=[.?!])\s+/);
    const hits = [];
    for(const s of sentences){
      const lower = s.toLowerCase();
      for(const t of qTokens) if (lower.includes(t)) { hits.push(s.trim()); break; }
    }
    return hits;
  }

  async function fetchPageText(url){
    try{
      const res = await fetch(url);
      if (!res.ok) return null;
      const txt = await res.text();
      // try to extract main content
      const doc = new DOMParser().parseFromString(txt,'text/html');
      // common selectors used by MkDocs / Material
      const sel = doc.querySelector('.md-content, .md-main__inner, .wy-nav-content, #content');
      const text = sel ? sel.innerText : doc.body.innerText;
      return text;
    }catch(e){ return null; }
  }

  async function askHF(snippets, question, hfKey){
    if (!hfKey) return null;
    try{
      const prompt = `You are provided with the following document snippets. Answer the question concisely using only the content. If the answer is not present, reply with the single word: silence.\n\nSNIPPETS:\n${snippets.join('\n---\n')}\n\nQUESTION: ${question}\n\nAnswer:`;
      const resp = await fetch('https://api-inference.huggingface.co/models/gpt2', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true, use_cache: false } })
      });
      if (!resp.ok) return null;
      const body = await resp.json();
      if (Array.isArray(body) && body[0] && body[0].generated_text) return body[0].generated_text.trim();
      if (body.generated_text) return body.generated_text.trim();
      return null;
    }catch(e){ return null; }
  }

  async function handleQuery(rawQ, indexJson){
    const q = (rawQ||'').trim();
    if (!q) return {answer:'', used:0};
    const qTokens = tokenize(q);

    // support different index formats
    let docsMeta = [];
    if (!indexJson) return {answer:'silence', used:0};

    // common MkDocs search index shape detection
    if (indexJson.docs && Array.isArray(indexJson.docs)){
      // newer mkdocs-material produces docs array with {title, url, text}
      docsMeta = indexJson.docs.map(d=>({title:d.title, url:d.url || d.path || d.location || d.link || d.dest, docname: d.location || d.url}));
    } else if (indexJson.titles && indexJson.docnames && Array.isArray(indexJson.titles) && Array.isArray(indexJson.docnames)){
      docsMeta = indexJson.titles.map((t,i)=>({title:t, docname:indexJson.docnames[i], url:(indexJson.docnames[i].replace(/(^index$|\.md$)/,''))}));
    } else if (indexJson.docs && typeof indexJson.docs === 'object'){
      // older formats
      docsMeta = Object.keys(indexJson.docs).map(k=>({title:indexJson.docs[k].title||k, docname:k, url:k}));
    } else if (Array.isArray(indexJson.documents)){
      docsMeta = indexJson.documents.map(d=>({title:d.title, url:d.url||d.path}));
    }

    if (!docsMeta.length) return {answer:'silence', used:0};

    // score docs
    const scored = docsMeta.map(d=>({d, score: scoreDoc(qTokens, d.title, d.docname)}));
    scored.sort((a,b)=>b.score - a.score);
    const top = scored.filter(s=>s.score>0).slice(0,6);
    if (!top.length) return {answer:'silence', used:0};

    // fetch top pages to extract sentences
    const snippets = [];
    for(const item of top){
      const urlCandidates = [];
      const base = location.pathname.replace(/\/[^\/]*$/, '/');
      const docname = item.d.docname || item.d.url || item.d.title;
      if (!docname) continue;
      // possible urls
      urlCandidates.push(base + docname + '.html');
      urlCandidates.push('/' + docname + '.html');
      urlCandidates.push(base + docname + '/');
      urlCandidates.push('/' + docname + '/');
      urlCandidates.push(docname);
      let text = null;
      for(const u of urlCandidates){
        try{ text = await fetchPageText(u); if (text) { break; } }catch(e){}
      }
      if (!text) continue;
      const sents = extractSentences(text, qTokens);
      if (sents && sents.length) snippets.push(...sents.slice(0,3));
    }

    if (!snippets.length) return {answer:'silence', used:top.length};

    // try Hugging Face if key available
    const hfKey = localStorage.getItem('hf_api_key');
    if (hfKey){
      const hfAnswer = await askHF(snippets.slice(0,6), q, hfKey);
      if (hfAnswer) return {answer: hfAnswer, used: top.length};
    }

    // local summarizer: return up to 3 matching sentences joined
    const answer = snippets.slice(0,5).join('\n\n');
    return {answer, used: top.length};
  }

  function renderWidget(container){
    const root = el('div',{id:ID, style:'max-width:720px;margin:0.5rem 0;padding:0.5rem;border:1px solid rgba(0,0,0,0.06);border-radius:6px;'});
    const input = el('input',{type:'search',placeholder:'Ask about these docs...', style:'width:100%;padding:0.5rem;margin-bottom:0.5rem;'});
    const btn = el('button', {type:'button', style:'margin-right:0.5rem;padding:0.45rem 0.7rem;'}, 'Ask');
    const info = el('small',{}, 'Answers are retrieval-based; returns "silence" when no relevant content found.');
    const out = el('pre',{style:'white-space:pre-wrap;background:#f7f7f8;padding:0.6rem;margin-top:0.6rem;border-radius:4px;'});
    const footer = el('div', {style:'margin-top:0.5rem;display:flex;gap:8px;align-items:center;'}, [info]);
    const controls = el('div', {}, [btn]);
    root.appendChild(input);
    root.appendChild(controls);
    root.appendChild(out);
    root.appendChild(footer);
    container.appendChild(root);

    return {input, btn, out};
  }

  // mount widget on pages that include the placeholder element
  document.addEventListener('DOMContentLoaded', async ()=>{
    const placeholder = document.querySelector('#ai-search-root');
    if (!placeholder) return;
    const w = renderWidget(placeholder);
    const idxRes = await tryFetchIndex();
    const indexJson = idxRes && idxRes.json ? idxRes.json : null;
    if (!indexJson){
      const tried = (idxRes && idxRes.tried) ? idxRes.tried : [];
      w.out.textContent = 'Search index not available on this site. The AI search requires MkDocs search plugin output (search/search_index.json).\nAttempted paths:\n' + tried.join('\n');
      console.debug('ai-search: failed to locate search_index.json, attempted paths:', tried);
    }

    w.btn.addEventListener('click', async ()=>{
      const q = w.input.value;
      w.out.textContent = 'Searching... (may take a few seconds)';
      const res = await handleQuery(q, indexJson);
      w.out.textContent = res.answer || 'silence';
    });
  });

})();
