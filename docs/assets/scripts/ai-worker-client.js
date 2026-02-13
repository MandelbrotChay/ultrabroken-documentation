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
    const root = el('div', { class: 'ub-ai-root' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:center;' });
    const input = el('input', { type: 'search', placeholder: 'Will it share wisdom or madness?', class: 'ub-ai-input' });
    const btn = el('button', { type: 'button', class: 'ub-ai-btn' }, 'Ask');
    const out = el('pre', { class: 'ub-ai-out' }, '');
    row.appendChild(input);
    row.appendChild(btn);
    root.appendChild(row);
    root.appendChild(out);
    container.appendChild(root);
    return { input, btn, out };
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
      if (r.error) {
        w.out.textContent = 'Error: ' + r.error;
        return;
      }
      if (r.answer) {
        w.out.textContent = r.answer;
        return;
      }
      // If no answer, prefer debug payload -> evidence -> fallback 'silence'
      if (r.debug) {
        w.out.textContent = JSON.stringify(r.debug, null, 2);
        return;
      }
      if (r.evidence) {
        w.out.textContent = JSON.stringify(r.evidence, null, 2);
        return;
      }
      w.out.textContent = 'silence';
    });
  });

})();
