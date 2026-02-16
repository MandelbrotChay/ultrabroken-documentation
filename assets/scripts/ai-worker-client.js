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

  // Internal flag: controls whether model-returned `Source:` lines are rendered.
  // This is intentionally an internal toggle (not user-facing). Set to `true`
  // to enable rendering of model-supplied sources, or `false` to disable.
  const SHOW_MODEL_SOURCES = false;
  // Internal flag: controls whether Worker-provided evidence is rendered.
  // Default `false` keeps the UI from showing Worker evidence until enabled.
  const SHOW_WORKER_EVIDENCE = true;
  // Internal flag: controls whether the response's trailing "sources"
  // block (the text starting at the first line beginning with 'Source')
  // is shown inline after the main answer. Note: the client ALWAYS splits
  // the model response into `main` and `sources` (so sources are available
  // for parsing). `SHOW_RESPONSE_SOURCES` only controls whether the raw
  // sources block is appended to the displayed answer. Default `false`.
  const SHOW_RESPONSE_SOURCES = false;
  

  function render(container){
    const root = el('div', { class: 'ub-ai-root' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:center;' });
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1;' });
    const _placeholder_text = 'Will it share wisdom or weirdness?';
    const input = el('input', { type: 'search', placeholder: '', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input' });
    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear', 'aria-label': 'Clear search' }, '');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask', 'aria-label': 'Ask' }, '');
    // NOTE: user-facing toggle removed — rendering of model-returned sources
    // is controlled by the internal `SHOW_MODEL_SOURCES` flag declared above.
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
      // No user-facing toggle: `SHOW_MODEL_SOURCES` controls whether model-
      // returned `Source:` lines are rendered. This is intentionally internal.
      // Parse simple source lines from model answer text. Returns array of {title?, path}
      function parseSourcesFromText(text){
        // Only accept explicit model-supplied source lines of the form:
        // Source: Title — /path/to/doc
        // Support multiple sources bundled on one line separated by ';'
        const out = [];
        if (!text || typeof text !== 'string') return out;
        const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
        for (const line of lines){
          // match the rest of the line after the leading 'Source:'
          const m = line.match(/^Source:\s*(.+)$/i);
          if (!m) continue;
          const rest = m[1];
          // split multiple sources on semicolon
          const parts = rest.split(/\s*;\s*/).map(p=>p.trim()).filter(Boolean);
          for (const part of parts){
            const mm = part.match(/^(.+?)\s*[–—-]\s*(\/?\S+)$/);
            if (mm){
              const title = mm[1].trim();
              const rawPath = mm[2];
              const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath.replace(/^\/+/, '');
              out.push({ title, path });
            }
          }
        }
        return out;
      }

      // Split a model answer into `main` (text before the first Source line)
      // and `sources` (the rest, starting at the first Source line). The
      // separator is the first line that begins with 'Source' (case-
      // insensitive). Returns { main: string, sources: string|null }.
      function splitAnswerAndSources(text){
        if (!text || typeof text !== 'string') return { main: '', sources: null };
        const lines = text.split(/\r?\n/);
        let idx = -1;
        for (let i = 0; i < lines.length; i++){
          if (/^\s*Source\b[:\s]/i.test(lines[i])) { idx = i; break; }
        }
        if (idx === -1) return { main: text.replace(/\s+$/,'') , sources: null };
        const main = lines.slice(0, idx).join('\n').replace(/\s+$/,'');
        const sources = lines.slice(idx).join('\n').trim();
        return { main, sources };
      }

      const handleAsk = async ()=>{
        const q = w.input.value.trim(); if (!q) return; w.out.textContent = 'Asking...';
        if (w.evidence) w.evidence.innerHTML = '';
        const r = await askWorker(q);
        if (r.error) {
          w.out.textContent = 'Error: ' + r.error;
          return;
        }
        // Render model answer (if present). Optionally split a trailing
        // sources section (starting at the first 'Source' line). The
        // main answer is always shown; the trailing sources section is
        // parsed and rendered as links only when `SHOW_RESPONSE_SOURCES`
        // is true. When splitting is disabled the full `r.answer` is
        // treated as the main answer.
        // Always split the model answer into main and sources (if any).
        // `SHOW_RESPONSE_SOURCES` controls whether the sources section is
        // displayed inline after the main answer. `SHOW_MODEL_SOURCES`
        // independently controls whether model-returned sources are
        // parsed and rendered as links in the evidence area.
        let sourcesText = null;
        if (r.answer) {
          const sp = splitAnswerAndSources(r.answer);
          const mainText = sp.main;
          sourcesText = sp.sources; // may be null
          // Display main answer; optionally append the raw sources block
          // when configured to show the response's sources section.
          if (SHOW_RESPONSE_SOURCES && sourcesText) {
            w.out.textContent = mainText + '\n\n' + sourcesText;
          } else {
            w.out.textContent = String(mainText).replace(/\s+$/,'');
          }
        } else if (r.debug) {
          w.out.textContent = JSON.stringify(r.debug, null, 2);
        } else {
          w.out.textContent = '';
        }

        // Additionally parse any source lines the model included in its answer and render them as links first
        try{
          const base = 'https://nan-gogh.github.io/ultrabroken-documentation/wiki/';
          const sourceTextToParse = (sourcesText != null) ? sourcesText : r.answer;
          const showModelSources = SHOW_MODEL_SOURCES && sourceTextToParse;
          if (showModelSources){
            const modelSources = parseSourcesFromText(sourceTextToParse);
            if (modelSources && modelSources.length){
              // create list and append to evidence area (model sources go first)
              let list = el('ul', { class: 'ub-ai-evidence-list' }, []);
              if (w.evidence) w.evidence.appendChild(list);
              const siteRoot = 'https://nan-gogh.github.io/ultrabroken-documentation';
              modelSources.forEach(s => {
                const p = (s.path || s.id || '').toString();
                let href;
                if (p && p.startsWith('/wiki/')) {
                  href = siteRoot + p;
                } else {
                  const slug = p.replace(/^\/+|\/+$/g,'').replace(/\.md$/,'');
                  href = base + encodeURI(slug);
                }
                const text = s.title || (s.path||s.id) || '';
                const a = el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }, text);
                const li = el('li', {}, a);
                list.appendChild(li);
              });
            }
          }

          // Always render Worker-provided evidence as authoritative clickable links
          try{
            const ev = r.evidence || [];
            // Worker evidence rendering controlled by internal flag.
            if (SHOW_WORKER_EVIDENCE && Array.isArray(ev) && ev.length){
              // reuse existing list if model sources created one, otherwise create
              let list = w.evidence && w.evidence.querySelector && w.evidence.querySelector('.ub-ai-evidence-list');
              if (!list) { list = el('ul', { class: 'ub-ai-evidence-list' }, []); if (w.evidence) w.evidence.appendChild(list); }
              ev.forEach(item => {
                const id = item.id || item.path || '';
                // Normalize id to a wiki path without .md
                let slug = String(id).replace(/\.md$/,'').replace(/^\/+|\/+$/g, '');
                const href = base + encodeURI(slug);
                const text = item.title || slug || id;
                const a = el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }, text);
                const li = el('li', {}, a);
                list.appendChild(li);
              });
            }
          }catch(e){ /* ignore rendering errors */ }
        }catch(e){ /* ignore model source parsing errors */ }
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
