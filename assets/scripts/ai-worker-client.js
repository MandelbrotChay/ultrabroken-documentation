/*
  Lightweight client to call the Cloudflare Worker for RAG.
  Usage: include this script and add a page with <div id="ai-search-root"></div>
  Configure worker URL via `window.AI_WORKER_URL` or set in localStorage('ai_worker_url').
*/
(function(){
  // Ensure local vendor scripts (marked + DOMPurify) are available at runtime.
  // Some browsers or deployments may serve stale HTML or block CDN loads; this
  // loader attempts to load the vendored files relative to this script when
  // `window.marked` or `window.DOMPurify` are not present.
  function ensureVendors(timeoutMs = 3000){
    return new Promise((resolve)=>{
      if (window.marked && window.DOMPurify) return resolve(true);
      try{
        const scriptEl = document.currentScript || (function(){ const s = document.getElementsByTagName('script'); return s[s.length-1]; })();
        const base = scriptEl && scriptEl.src ? scriptEl.src.replace(/\/[^/]*$/, '/') : document.baseURI;
        const urls = [new URL('../vendor/marked.min.js', base).toString(), new URL('../vendor/purify.min.js', base).toString()];
        let loaded = 0;
        const onLoad = ()=>{ loaded++; if (loaded >= urls.length) { console.debug('ai-client: vendor script loaded'); return resolve(true); } };
        const onError = ()=>{ loaded++; if (loaded >= urls.length) { console.debug('ai-client: vendor script failed to load'); return resolve(!!(window.marked && window.DOMPurify)); } };
        urls.forEach(u=>{
          // If already loaded by some other script, skip
          if ((u.indexOf('marked.min.js')>=0 && window.marked) || (u.indexOf('purify.min.js')>=0 && window.DOMPurify)) { onLoad(); return; }
          const s = document.createElement('script'); s.src = u; s.async = false; s.defer = false;
          s.addEventListener('load', onLoad); s.addEventListener('error', onError);
          document.head.appendChild(s);
        });
        // Fallback timeout — resolve whether or not vendors loaded to avoid blocking
        setTimeout(()=>{ console.debug('ai-client: vendor loader timeout, marked=', !!window.marked, 'DOMPurify=', !!window.DOMPurify); resolve(!!(window.marked && window.DOMPurify)); }, timeoutMs);
      }catch(e){ resolve(!!(window.marked && window.DOMPurify)); }
    });
  }
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> e.setAttribute(k,v));
    (Array.isArray(children)?children:[children]).forEach(c=>{ if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if (c) e.appendChild(c); });
    return e;
  }

  // Internal flag: controls whether model-returned `Source:` lines are rendered.
  // This is intentionally an internal toggle (not user-facing). Set to `true`
  // to enable rendering of model-supplied sources, or `false` to disable.
  const SHOW_MODEL_SOURCES = true;
  // Internal flag: controls whether Worker-provided evidence is rendered.
  // Default `false` keeps the UI from showing Worker evidence until enabled.
  const SHOW_WORKER_EVIDENCE = false;
  // Internal flag: controls whether the response's trailing "sources"
  // block (the text starting at the first line beginning with 'Source')
  // is shown inline after the main answer. Note: the client ALWAYS splits
  // the model response into `main` and `sources` (so sources are available
  // for parsing). `SHOW_RESPONSE_SOURCES` only controls whether the raw
  // sources block is appended to the displayed answer. Default `false`.
  const SHOW_RESPONSE_SOURCES = false;
  // Internal toggle: when true, model-supplied source titles are rendered
  // as `search:Title` links (intercepted by `search-link.js`). When false
  // they render as normal page links. Default: false.
  const USE_TITLE_SEARCH_LINKS = true;
  
  function render(container){
    const root = el('div', { class: 'ub-ai-root' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:center;' });
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1;' });
    const _placeholder_text = 'Will it share wiazrdry or waffle?';
    const input = el('input', { type: 'search', placeholder: '', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input' });
    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear', 'aria-label': 'Clear search' }, '');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask', 'aria-label': 'Ask' }, '');
    // NOTE: user-facing toggle removed — rendering of model-returned sources
    // is controlled by the internal `SHOW_MODEL_SOURCES` flag declared above.
    // Output area (answer + evidence). `out` holds the model answer; `evidenceWrap` holds clickable evidence links returned by the Worker.
    const out = el('div', { class: 'ub-ai-out' }, '');
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
        // Accept model-supplied source lines of the forms:
        //  - Source: Title — /path/to/doc
        //  - Source: Title
        //  - Sources: Title; Sources: Title — /path
        // Support multiple sources bundled on one line separated by ';'
        const out = [];
        if (!text || typeof text !== 'string') return out;
        const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++){
          let line = lines[i];
          // If the line contains 'Source(s): <rest>' treat <rest> as the content.
          // If the line is exactly 'Source:' or 'Sources:' then treat subsequent
          // non-empty lines as separate source entries until a blank line/EOF.
          let m = line.match(/^Sources?:\s*(.+)$/i);
          let restItems = [];
          if (m && m[1]) {
            // 'Source: Title; Title — /path' or similar on a single line
            restItems = String(m[1]).split(/\s*;\s*/).map(p=>p.trim()).filter(Boolean);
          } else if (/^Sources?:\s*$/i.test(line)) {
            // consume following non-empty lines as individual entries
            let j = i + 1;
            for (; j < lines.length; j++){
              const next = lines[j].trim();
              if (!next) break; // stop at blank line
              restItems.push(next);
            }
            i = Math.max(i, j - 1); // advance outer loop to consumed lines
          } else {
            continue;
          }

          for (let part of restItems){
            // tolerate parts that still include a leading 'Source:' label
            part = part.replace(/^Sources?:\s*/i, '').trim();
            // strip common bullet markers and list prefixes ("- ", "* ", "• ")
            part = part.replace(/^[\-\*\u2022\s]+/, '').trim();
            // trim trailing lone dashes or separators caused by truncation
            part = part.replace(/[\-–—\s]+$/,'').trim();
            // skip obviously invalid/too-short fragments
            if (!part || part.length < 4) continue;
            const mm = part.match(/^(.+?)\s*[–—-]\s*(\/?\S+)$/);
            if (mm){
              const title = mm[1].trim();
              const rawPath = mm[2];
              const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath.replace(/^\/+/, '');
              out.push({ title, path });
            } else {
              // Accept title-only entries (the model may now return only titles).
              const titleOnly = part.trim();
              if (titleOnly) out.push({ title: titleOnly, path: null });
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
          if (/^\s*Sources?\b[:\s]/i.test(lines[i])) { idx = i; break; }
        }
        if (idx === -1) return { main: text.replace(/\s+$/,'') , sources: null };
        const main = lines.slice(0, idx).join('\n').replace(/\s+$/,'');
        const sources = lines.slice(idx).join('\n').trim();
        return { main, sources };
      }

      const handleAsk = async ()=>{
        const q = w.input.value.trim(); if (!q) return; w.out.textContent = 'The librarian stares at you...';
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
          // Render Markdown safely when marked + DOMPurify are present.
          const normalizeMarkdown = (s) => {
            if (!s) return '';
            try{
              let t = String(s || '');
              t = t.replace(/\r\n/g,'\n');
              // Collapse 3+ consecutive newlines into 2 (single paragraph gap)
              t = t.replace(/\n{3,}/g, '\n\n');
              return t.trim();
            }catch(e){ return String(s || '').trim(); }
          };

          const normalizeHtmlWhitespace = (html) => {
            // Remove empty paragraphs produced by Markdown -> HTML
            html = html.replace(/<p>\s*<\/p>\s*/gi, '');
            // Collapse long runs of <br> into at most two
            html = html.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
            // Trim excessive whitespace between block tags
            html = html.replace(/>\s+</g, '><');
            return html.trim();
          };

          const safeRender = (md) => {
            const clean = normalizeMarkdown(md);
            try{
              console.debug('ai-client: safeRender checking vendors', !!window.marked, !!window.DOMPurify);
              if (window.marked && window.DOMPurify) {
                try{
                  const raw = marked.parse(clean);
                  const sanitized = DOMPurify.sanitize(raw);
                  const normalized = normalizeHtmlWhitespace(sanitized);
                  w.out.innerHTML = normalized;
                }catch(e){ console.debug('ai-client: render error', e); w.out.textContent = clean.replace(/\s+$/,''); }
              } else {
                console.debug('ai-client: vendors missing; falling back to plain text');
                w.out.textContent = clean.replace(/\s+$/,'');
              }
            }catch(e){ w.out.textContent = clean.replace(/\s+$/,''); }
          };
          // Display main answer; optionally append the raw sources block
          // when configured to show the response's sources section.
          if (SHOW_RESPONSE_SOURCES && sourcesText) {
            safeRender(mainText + '\n\n' + sourcesText);
          } else {
            safeRender(mainText);
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
              // create a Resources headline (styled like an h2) above the sources list
              try{
                if (w.evidence && !w.evidence.querySelector('.ub-ai-resources')){
                  const heading = el('h2', { class: 'ub-ai-resources md-typeset' }, 'Resources');
                  if (w.evidence) w.evidence.appendChild(heading);
                }
              }catch(e){}
              // create list and append to evidence area (model sources go first)
              let list = el('ul', { class: 'ub-ai-evidence-list' }, []);
              if (w.evidence) w.evidence.appendChild(list);
              const siteRoot = 'https://nan-gogh.github.io/ultrabroken-documentation';
              modelSources.forEach(s => {
                const text = s.title || (s.path||s.id) || '';
                const query = String(text).trim();
                if (USE_TITLE_SEARCH_LINKS) {
                  // Render as a `search:` link that `search-link.js` will intercept
                  const href = 'search:' + encodeURIComponent(query);
                  const a = el('a', { href: href, class: 'search-link', 'data-query': query }, text);
                  const li = el('li', {}, a);
                  list.appendChild(li);
                } else {
                  const p = (s.path || s.id || '').toString();
                  let href;
                  if (p && p.startsWith('/wiki/')) {
                    href = siteRoot + p;
                  } else {
                    const slug = p.replace(/^\/+|\/+$/g,'').replace(/\.md$/,'');
                    href = base + encodeURI(slug);
                  }
                  const a = el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }, text);
                  const li = el('li', {}, a);
                  list.appendChild(li);
                }
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
            // Clear rendered answer and any HTML inside
            try{ if (w.out) { w.out.textContent = ''; w.out.innerHTML = ''; } }catch(e){}
            // Also clear parsed/rendered sources/evidence
            try{ if (w.evidence) w.evidence.innerHTML = ''; }catch(e){}
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

  // Ensure vendor libs are present before initializing the widget. If the
  // vendor loader fails or times out we still continue (fallback to plain text).
  const _boot = ()=>{ updateCenteredRune(); initAIWidget(); attachNavObserver(); };
  try{
    ensureVendors(3000).then(()=>{
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot);
      } else {
        _boot();
      }
    }).catch(()=>{
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot);
      } else {
        _boot();
      }
    });
  }catch(e){ if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', _boot); } else _boot(); }

})();
