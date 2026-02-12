/*
  Lightweight client to call the Cloudflare Worker for RAG.
  Usage: include this script and add a page with <div id="ai-search-root"></div>
  Configure worker URL via `window.AI_WORKER_URL` or set in localStorage('ai_worker_url').
*/
(function(){
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> e.setAttribute(k,v));
    (Array.isArray(children)?children:[children]).forEach(c=>{ if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if (c) e.appendChild(c); });
    return e;
  }

  function render(container){
    const root = el('div',{style:'max-width:720px;margin:0.5rem 0;padding:0.5rem;border:1px solid rgba(0,0,0,0.06);border-radius:6px;'});
    const input = el('input',{type:'search',placeholder:'Ask the Wiki...', style:'width:100%;padding:0.5rem;margin-bottom:0.5rem;'});
    const btn = el('button',{type:'button', style:'padding:0.45rem 0.7rem;'}, 'Ask');
    const out = el('pre',{style:'white-space:pre-wrap;background:#f7f7f8;padding:0.6rem;margin-top:0.6rem;border-radius:4px;'}, '');
    root.appendChild(input); root.appendChild(btn); root.appendChild(out);
    container.appendChild(root);
    return {input, btn, out};
  }

  async function askWorker(q){
    // Default to the registered workers.dev subdomain so fetches go to the Worker,
    // not the GitHub Pages origin which rejects POSTs to /worker.
    const DEFAULT_WORKER_URL = 'https://ultrabroken-rag.gl1tchcr4vt.workers.dev';
    const url = window.AI_WORKER_URL || localStorage.getItem('ai_worker_url') || DEFAULT_WORKER_URL;
    try{
      const res = await fetch(url, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ query: q }) });
      if (!res.ok) throw new Error('worker error '+res.status);
      return await res.json();
    }catch(e){ return { error: String(e) }; }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const placeholder = document.querySelector('#ai-search-root');
    if (!placeholder) return;
    const w = render(placeholder);
    w.btn.addEventListener('click', async ()=>{
      const q = w.input.value.trim(); if (!q) return; w.out.textContent = 'Asking...';
      const r = await askWorker(q);
      if (r.error) w.out.textContent = 'Error: ' + r.error;
      else w.out.textContent = r.answer || 'silence';
    });
  });

})();
