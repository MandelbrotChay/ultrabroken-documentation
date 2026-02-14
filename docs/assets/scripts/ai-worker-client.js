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

      const escapeHtml = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);

      // If answer present, show it and list sources as clickable links (use evidence[].url)
      if (r.answer) {
        // remove literal labels and any trailing plain-text source lines like
        // "Title — /path" or bare ids/paths that models sometimes append
        let sanitized = String(r.answer || '').replace(/^Answer\s*[:\-]\s*/i, '').replace(/\bSource[s]?\s*[:\-]\s*/ig, '').trim();
        const lines = sanitized.split(/\r?\n/).map(l=>l.trim());
        const filtered = lines.filter(l => {
          if (!l) return false; // drop empty lines at end
          // Title — /path
          if (/^[^\n\r]+\s+—\s+\/?[\w\-\/\.]+$/i.test(l)) return false;
          // bare path starting with /
          if (/^\/[\w\-\/\.]+$/i.test(l)) return false;
          // bare id like 0282-swap-resync or 0244-portable-cull-...
          if (/^[0-9]{3,4}[-\w]+(?:\.md)?$/i.test(l)) return false;
          return true;
        });
        sanitized = filtered.join('\n').trim();
        let html = '<div class="ub-ai-answer">' + escapeHtml(sanitized) + '</div>';
        if (Array.isArray(r.evidence) && r.evidence.length) {
          html += '<hr class="ub-ai-hr"/>';
          html += '<div class="ub-ai-sources"><ul>';
          for (const e of r.evidence) {
            // prefer friendly title from index; fall back to id/path
            const name = (e && e.title) ? e.title : (e.id || e.file || e.path || 'source');
            const href = (e && (e.url || e.path)) || (e.file ? ('/docs/' + e.file) : '#');
            html += '<li><a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(name) + '</a></li>';
          }
          html += '</ul></div>';
        }
        w.out.innerHTML = html;
        return;
      }

      // If no answer, prefer debug payload -> evidence -> fallback 'silence'
      if (r.debug) {
        w.out.textContent = JSON.stringify(r.debug, null, 2);
        return;
      }
      if (Array.isArray(r.evidence) && r.evidence.length) {
        let html = '<div class="ub-ai-sources"><ul>';
        for (const e of r.evidence) {
          const name = e.title || e.id || e.file || e.path || 'source';
          const href = e.url || e.path || (e.file ? ('/docs/' + e.file) : '#');
          html += '<li><a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(name) + '</a></li>';
        }
        html += '</ul></div>';
        w.out.innerHTML = html;
        return;
      }

      w.out.textContent = 'Silence echoes back...';
    });
  });

})();
