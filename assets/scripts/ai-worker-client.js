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
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1;' });
    const _placeholder_text = 'Will it share wisdom or weirdness?';
    const input = el('input', { type: 'search', placeholder: '', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input' });
    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear', 'aria-label': 'Clear search' }, '');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask', 'aria-label': 'Ask' }, '');
    // Output area (answer + evidence). `out` holds the model answer; `evidenceWrap` holds clickable evidence links returned by the Worker.
    const out = el('pre', { class: 'ub-ai-out' }, '');
    const evidenceWrap = el('div', { class: 'ub-ai-evidence' }, '');
    inputWrap.appendChild(input);
    inputWrap.appendChild(clearBtn);
    row.appendChild(inputWrap);
    row.appendChild(askBtn);
    root.appendChild(row);
    root.appendChild(out);
    // append evidence container to the widget so it's accessible via the returned handle
    root.appendChild(evidenceWrap);
    container.appendChild(root);
    return { input, btn: askBtn, out, clear: clearBtn, evidence: evidenceWrap };
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

  // Idempotent initializer for the AI widget. Safe to call multiple times
  // (e.g. after MkDocs Material instant navigation swaps).
  function initAIWidget(){
    try{
      const placeholder = document.querySelector('#ai-search-root');
      // Toggle centered rune class based on presence of the AI page placeholder
      if (!placeholder) { document.body.classList.remove('ultrabroken-center-rune'); return; }
      // Avoid double-init on the same placeholder
      if (placeholder.dataset.aiInitialized === '1') return;
      // If an instance already exists inside, mark initialized and skip
      if (placeholder.querySelector('.ub-ai-root')) { placeholder.dataset.aiInitialized = '1'; return; }
      const w = render(placeholder);
      // Parse simple source lines from model answer text. Returns array of {title?, path}
      function parseSourcesFromText(text){
        const out = [];
        if (!text || typeof text !== 'string') return out;
        const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
        for (const line of lines){
          // Pattern: Source: Title — /path/to/doc
          let m = line.match(/^Source:\s*(.+?)\s*[–—-]\s*(\/?\S+)$/i);
          if (m){
            out.push({ title: m[1].trim(), path: m[2].startsWith('/') ? m[2] : '/' + m[2].replace(/^\/+/, '') });
            continue;
          }
          // Pattern: direct path or slug like 'overload/index' or '/overload/index'
          if (/^\/?[A-Za-z0-9_\-\/]+$/.test(line)){
            const slug = line.replace(/^\/+|\/+$/g,'');
            out.push({ title: null, path: '/' + slug });
            continue;
          }
          // Fallback: extract any first /path/in/string
          const p = line.match(/(\/[-A-Za-z0-9_\/\.]+)/);
          if (p){
            out.push({ title: null, path: p[1] });
            continue;
          }
        }
        return out;
      }

      const handleAsk = async ()=>{
        const q = w.input.value.trim(); if (!q) return; w.out.textContent = 'Asking...';
        if (w.evidence) w.evidence.innerHTML = '';
        const r = await askWorker(q);
        if (r.error) {
          w.out.textContent = 'Error: ' + r.error;
          return;
        }
        // Render model answer (if present)
        if (r.answer) {
          w.out.textContent = r.answer;
        } else if (r.debug) {
          w.out.textContent = JSON.stringify(r.debug, null, 2);
        } else {
          w.out.textContent = '';
        }

        // Always render Worker-provided evidence as authoritative clickable links
        try{
          const base = 'https://nan-gogh.github.io/ultrabroken-documentation/wiki/';
          const ev = r.evidence || [];
          /* Worker evidence rendering is temporarily disabled — model-returned
             sources will still be parsed and rendered. Re-enable this block when
             you want the Worker-provided evidence links shown alongside model
             sources. */
          // if (Array.isArray(ev) && ev.length){
          //   const list = el('ul', { class: 'ub-ai-evidence-list' }, []);
          //   ev.forEach(item => {
          //     const id = item.id || item.path || '';
          //     // Normalize id to a wiki path without .md
          //     let slug = String(id).replace(/\.md$/,'').replace(/^\/+|\/+$/g, '');
          //     const href = base + encodeURI(slug);
          //     const text = item.title || slug || id;
          //     const a = el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }, text);
          //     const li = el('li', {}, a);
          //     list.appendChild(li);
          //   });
          //   if (w.evidence) w.evidence.appendChild(list);
          // }

          // Additionally parse any source lines the model included in its answer and render them as links too
          try{
            const modelSources = parseSourcesFromText(r.answer);
            if (modelSources && modelSources.length){
              // reuse existing list if present, otherwise create
              let list = w.evidence && w.evidence.querySelector && w.evidence.querySelector('.ub-ai-evidence-list');
              if (!list) { list = el('ul', { class: 'ub-ai-evidence-list' }, []); if (w.evidence) w.evidence.appendChild(list); }
              modelSources.forEach(s => {
                // normalize and strip any trailing .md from model-provided paths
                const slug = (s.path||'').replace(/^\/+|\/+$/g,'').replace(/\.md$/,'');
                const href = base + encodeURI(slug);
                const text = s.title || slug || s.path;
                const a = el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }, text);
                const li = el('li', {}, a);
                list.appendChild(li);
              });
            }
          }catch(e){ /* ignore model source parsing errors */ }
        }catch(e){ /* ignore rendering errors */ }
        // If nothing was rendered and there was no answer, show silence
        if (!w.out.textContent && (!r.evidence || !r.evidence.length)) w.out.textContent = 'silence';
      };
      w.btn.addEventListener('click', handleAsk);
      // also allow Enter on the input to trigger ask
      w.input.addEventListener('keydown', (ev)=>{ if (ev.key === 'Enter') handleAsk(); });
      // Show placeholder only when the field is NOT focused (and empty).
      // When focused we hide the placeholder so caret/typing is clear.
      try{
        const stored = w.input.getAttribute('data-ub-placeholder') || '';
        // Hide placeholder while editing
        w.input.addEventListener('focus', ()=>{ w.input.placeholder = ''; });
        // Restore placeholder when blurred and empty
        w.input.addEventListener('blur', ()=>{ if (!w.input.value) w.input.placeholder = stored; });
        // Initial state: if not focused and empty, show placeholder
        if (document.activeElement !== w.input && !w.input.value) w.input.placeholder = stored;
      }catch(e){}
      // Wire clear button and replace Ask text with an SVG ask-icon that only appears when input has text
      try{
        // Ensure clear button exists
        if (w.clear){
          // set image for the clear button (published site path)
          const clearImg = document.createElement('img');
          clearImg.src = '/ultrabroken-documentation/assets/images/close-icon.svg';
          clearImg.alt = 'Clear';
          clearImg.style.width = 'auto';
          clearImg.style.height = 'auto';
          clearImg.style.display = 'block';
          clearImg.style.objectFit = 'contain';
          // ensure clear button centers its contents so the icon lines up with the Ask button
          w.clear.style.display = 'none';
          w.clear.style.alignItems = 'center';
          w.clear.style.justifyContent = 'center';
          w.clear.style.padding = '0';
          w.clear.appendChild(clearImg);
          w.clear.addEventListener('click', ()=>{ 
            w.input.value = ''; 
            w.out.textContent = ''; 
            w.input.focus(); 
            try { if (typeof updateVisibility === 'function') updateVisibility(); else { w.clear.style.display = 'none'; w.btn.style.display = 'none'; } } catch(e){ w.clear.style.display = 'none'; w.btn.style.display = 'none'; }
          });
        }

        // Replace textual Ask label with an SVG inside the Ask button
        const askImg = document.createElement('img');
        askImg.src = '/ultrabroken-documentation/assets/images/ask-icon.svg';
        askImg.alt = 'Ask';
        askImg.style.width = 'auto';
        askImg.style.height = 'auto';
        askImg.style.display = 'block';
        askImg.style.objectFit = 'contain';
        // Clear any existing textual content in the button and append the SVG
        w.btn.textContent = '';
        w.btn.appendChild(askImg);
        // Start hidden; only show when the input has text (mirrors clear button behavior)
        w.btn.style.display = 'none';

        // Shared resizing function to make both icons match the Ask button visual height
        const resizeIcons = ()=>{
          try{
            const btnRect = w.btn.getBoundingClientRect();
            let targetH = 0;
            if (btnRect && btnRect.height > 0) targetH = Math.round(btnRect.height);
            else targetH = Math.round(parseFloat(getComputedStyle(w.btn).fontSize) || 16);
            targetH = Math.max(12, targetH);
            if (clearImg) { clearImg.style.height = targetH + 'px'; clearImg.style.width = 'auto'; }
            if (askImg) { askImg.style.height = targetH + 'px'; askImg.style.width = 'auto'; }
          }catch(e){}
        };

        // Toggle visibility for both controls based on input content
        const updateVisibility = ()=>{
          const has = w.input.value.trim();
          if (w.clear) w.clear.style.display = has ? 'flex' : 'none';
          w.btn.style.display = has ? 'flex' : 'none';
          // After toggling, resize icons to match rendered button height
          // use a short timeout to allow layout to settle when showing
          setTimeout(resizeIcons, 0);
        };

        w.input.addEventListener('input', updateVisibility);
        // initial sizing and keep in sync with resizes
        resizeIcons();
        window.addEventListener('resize', resizeIcons);
        // initial state
        updateVisibility();
      }catch(e){ /* ignore */ }
      // Keep rune centered while on the AI page
      try{ document.body.classList.add('ultrabroken-center-rune'); }catch(e){}
      // Keep rune centered while on the AI page
      try{ document.body.classList.add('ultrabroken-center-rune'); }catch(e){}
      placeholder.dataset.aiInitialized = '1';
    }catch(e){ console.debug('initAIWidget error', e); }
  }

  // Fast rune-centering update that runs immediately on mutations/navigation
  function updateCenteredRune(){
    try{
      const placeholder = document.querySelector('#ai-search-root');
      if (placeholder) {
        document.body.classList.add('ultrabroken-center-rune');
      } else {
        document.body.classList.remove('ultrabroken-center-rune');
      }
    }catch(e){ console.debug('updateCenteredRune error', e); }
  }

  // Reuse the project's established navigation-detection pattern: observe
  // body mutations, listen to popstate, and wrap pushState so we initialize
  // the widget after client-side navigation.
  function attachNavObserver(){
    try{
      const target = document.body; if (!target) return;
      const mo = new MutationObserver(()=>{ updateCenteredRune(); setTimeout(initAIWidget, 50); });
      mo.observe(target, { childList: true, subtree: true });
      window.addEventListener('popstate', ()=>{ updateCenteredRune(); setTimeout(initAIWidget, 50); });
      const _pushState = history.pushState;
      history.pushState = function () { _pushState.apply(this, arguments); updateCenteredRune(); setTimeout(initAIWidget, 50); };
    }catch(e){ console.debug('attachNavObserver error', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>{ updateCenteredRune(); initAIWidget(); attachNavObserver(); });
  } else {
    updateCenteredRune(); initAIWidget(); attachNavObserver();
  }

})();
