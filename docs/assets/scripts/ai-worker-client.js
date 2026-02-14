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

      const escapeHtml = (s) => String(s||'').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);

      // Render an answer if present (sanitize and strip model-inserted labels)
      if (r.answer) {
        const answerText = String(r.answer || '').trim();
        // remove leading label
        let sanitized = answerText.replace(/^Answer\s*[:\-]\s*/i, '').trim();

        // detect inline source pairs like "Title — /path/to/page" anywhere in the
        // answer (including semicolon-separated lists) and build links from them.
        // This captures multiple pairs even when they're on one line separated by ';'.
        const sourcePairs = [];
        // match: title <dash(s)> path (path is non-whitespace, may start with '/')
        const pairRe = /([^;\n\r]+?)\s+[\-\u2013\u2014\u2015]+\s*(\/?\S+)(?:\s*(?:;|$))/ig;
        let m;
        while ((m = pairRe.exec(sanitized)) !== null) {
          const title = (m[1] || '').trim();
          const path = (m[2] || '').trim();
          if (title && path) sourcePairs.push({ title, path });
        }

        // remove 'Source:' labels and strip out the matched source substrings
        sanitized = sanitized.replace(/\bSource[s]?\s*[:\-]\s*/ig, '').trim();
        if (sourcePairs.length > 0) {
          sanitized = sanitized.replace(pairRe, '');
          // also remove stray semicolons or trailing separators left behind
          sanitized = sanitized.replace(/[;\s]+$/,'').trim();
        }

        let html = '<div class="ub-ai-answer">' + escapeHtml(sanitized) + '</div>';

        // If we found inline source pairs, ONLY use those to build clickable links
        if (sourcePairs.length > 0) {
          html += '<hr class="ub-ai-hr"/>';
          html += '<div class="ub-ai-sources"><ul>';
          const normalizeMd = (h) => {
            if (!h) return h;
            try{ return String(h).replace(/\.md$/i, '/'); }catch(e){ return h; }
          };
          for (const s of sourcePairs) {
            const name = s.title || s.path || 'source';
            const pRaw = String(s.path || '').trim();
            // remove trailing .md from the path and ensure leading '/'
            const p = normalizeMd(pRaw);
            const base = 'https://nan-gogh.github.io/ultrabroken-documentation/wiki';
            const rest = p.startsWith('/') ? p : ('/' + p);
            const href = base + rest;
            html += '<li><a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(name) + '</a></li>';
          }
          html += '</ul></div>';
          w.out.innerHTML = html;
          return;
        }

        // Otherwise fall back to evidence provided by the Worker
        if (r.evidence && Array.isArray(r.evidence) && r.evidence.length) {
          html += '<hr class="ub-ai-hr"/>';
          html += '<div class="ub-ai-sources"><strong>Sources:</strong><ul>';
          for (const e of r.evidence) {
            const name = e.title || e.id || e.file || e.path || 'source';
            let href = (e.url && String(e.url)) || (e.path && String(e.path)) || (e.file ? ('/docs/' + String(e.file)) : String(e.id || '#'));
            // normalize .md suffix to a trailing slash for MkDocs
            try{ href = String(href).replace(/\.md$/i, '/'); }catch(e){ }
            html += '<li><a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(name) + '</a></li>';
          }
          html += '</ul></div>';
        }
        w.out.innerHTML = html;
        return;
      }

      // If no synthesized answer, show debug or evidence in user-friendly form
      if (r.debug) {
        w.out.textContent = JSON.stringify(r.debug, null, 2);
        return;
      }
      if (r.evidence && Array.isArray(r.evidence) && r.evidence.length) {
        let html = '<div class="ub-ai-sources"><strong>Sources:</strong><ul>';
        for (const e of r.evidence) {
          const name = e.title || e.id || e.file || e.path || 'source';
          const href = (e.path && String(e.path)) || (e.file ? ('/docs/' + String(e.file)) : String(e.id || '#'));
          html += '<li><a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(name) + '</a></li>';
        }
        html += '</ul></div>';
        w.out.innerHTML = html;
        return;
      }

      w.out.textContent = 'silence';
    });
  });

})();
