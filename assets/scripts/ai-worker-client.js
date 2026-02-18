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
  const SHOW_MODEL_SOURCES = true;
  // Internal toggle: when true, model-supplied source titles are rendered
  // as `search:Title` links (intercepted by `search-link.js`). When false
  // they render as normal page links. Default: false.
  const USE_TITLE_SEARCH_LINKS = true;
  
  function render(container){
    const root = el('div', { class: 'ub-ai-root' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:flex-end;' });
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1; display:flex; align-items:flex-end;' });
    const _placeholder_text = 'What is Wacko Boingo?';
      // Max query length (short questions). Configurable via `window.AI_MAX_QUERY_CHARS`.
      const MAX_QUERY_CHARS = (typeof window !== 'undefined' && window.AI_MAX_QUERY_CHARS) ? Number(window.AI_MAX_QUERY_CHARS) : 50;
      const input = el('textarea', { placeholder: '', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input', maxlength: String(MAX_QUERY_CHARS), rows: '1' });
      // textarea base styles for autosize and wrapping
      try{
        input.style.resize = 'none';
        input.style.overflow = 'hidden';
        input.style.overflowY = 'hidden';
        input.style.flex = '1 1 auto';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.setAttribute('wrap', 'soft');
        input.style.whiteSpace = 'pre-wrap';
        // Prefer breaking words only when necessary so lines wrap a bit later.
        input.style.overflowWrap = 'break-word';
        input.style.wordBreak = 'normal';
      }catch(e){}
    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear', 'aria-label': 'Clear search' }, '');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask', 'aria-label': 'Ask' }, '');
    const shareBtn = el('button', { type: 'button', class: 'ub-ai-share', 'aria-label': 'Share query' }, '');
    // NOTE: user-facing toggle removed — rendering of model-returned sources
    // is controlled by the internal `SHOW_MODEL_SOURCES` flag declared above.
    // Output area (answer + evidence). `out` holds the model answer; `evidenceWrap` holds clickable evidence links returned by the Worker.
    const out = el('div', { class: 'ub-ai-out' }, '');
    const evidenceWrap = el('div', { class: 'ub-ai-evidence' }, '');
    inputWrap.appendChild(input);
    // create an absolutely-positioned action container so buttons do not
    // affect the textarea's available width (prevents early wrapping)
    const actionWrap = el('div', { class: 'ub-ai-action-wrap' }, []);
    try{
      actionWrap.style.position = 'absolute';
      actionWrap.style.right = '0.25rem';
      actionWrap.style.top = '50%';
      actionWrap.style.transform = 'translateY(-50%)';
      actionWrap.style.display = 'flex';
      actionWrap.style.gap = '0.4rem';
      actionWrap.style.alignItems = 'center';
      actionWrap.style.pointerEvents = 'auto';
    }catch(e){}
    actionWrap.appendChild(clearBtn);
    actionWrap.appendChild(askBtn);
    actionWrap.appendChild(shareBtn);
    inputWrap.appendChild(actionWrap);
    row.appendChild(inputWrap);
    
    root.appendChild(row);
    root.appendChild(out);
    // append evidence container to the widget so it's accessible via the returned handle
    root.appendChild(evidenceWrap);
    container.appendChild(root);
    return { input, btn: askBtn, share: shareBtn, out, clear: clearBtn, evidence: evidenceWrap };
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
      // The Worker now returns structured `response_text`, optional `response_sources` (text block)
      // and a `sources` array ([{title, path|null}]). The client renders those directly
      // and no longer attempts to parse `response_text` for Sources.

      const handleAsk = async ()=>{
        const q = w.input.value.trim(); if (!q) return; w.out.textContent = 'The Librarian stares at you...';
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
        // Consume structured worker response fields.
        // `r.response_text` is the main answer (already stripped of any Sources block).
        // `r.response_sources` is the textual Sources block (present only when APPEND_RESPONSE_SOURCES enabled).
        // `r.sources` is the structured array of source entries.
        let responseText = r.response_text || r.answer || '';
        let responseSources = (typeof r.response_sources !== 'undefined') ? r.response_sources : null;
        // `r.answer` fallback exists for older worker responses during transition; prefer structured fields.
        if (responseText) {
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
              if (window.marked && window.DOMPurify) {
                try{
                  const raw = marked.parse(clean);
                  const sanitized = DOMPurify.sanitize(raw);
                  const normalized = normalizeHtmlWhitespace(sanitized);
                  w.out.innerHTML = normalized;
                }catch(e){ w.out.textContent = clean.replace(/\s+$/,''); }
              } else {
                w.out.textContent = clean.replace(/\s+$/,'');
              }
            }catch(e){ w.out.textContent = clean.replace(/\s+$/,''); }
          };
          // Display main answer; optionally append the raw sources block
          // when configured to show the response's sources section.
          // Append raw response_sources only when Worker provided them.
          if (responseSources != null) {
            safeRender(responseText + '\n\n' + responseSources);
          } else {
            safeRender(responseText);
          }
        } else if (r.debug) {
          w.out.textContent = JSON.stringify(r.debug, null, 2);
        } else {
          w.out.textContent = '';
        }
        // Render model-provided structured `r.sources` as links when present
        try{
          const base = 'https://nan-gogh.github.io/ultrabroken-documentation/wiki/';
          const modelSources = Array.isArray(r.sources) ? r.sources : [];
          const showModelSources = SHOW_MODEL_SOURCES && modelSources && modelSources.length;
          // When rendering as `search:` links we need to dedupe model-provided
          // sources and Worker-provided evidence so the final list contains
          // unique search queries. `seenQueries` tracks already-emitted queries
          // (case-sensitive, using the display string) and ensures the uppermost
          // instance is kept.
          const seenQueries = new Set();
          if (showModelSources){
            if (w.evidence && !w.evidence.querySelector('.ub-ai-resources')){
              const heading = el('h2', { class: 'ub-ai-resources md-typeset' }, 'Resources');
              if (w.evidence) w.evidence.appendChild(heading);
              const sep = el('hr', { class: 'ub-ai-resources-sep' }, '');
              if (w.evidence) w.evidence.appendChild(sep);
            }
            let list = el('ul', { class: 'ub-ai-evidence-list' }, []);
            if (w.evidence) w.evidence.appendChild(list);
            const siteRoot = 'https://nan-gogh.github.io/ultrabroken-documentation';
            modelSources.forEach(s => {
              const text = s.title || (s.path||s.id) || '';
              const query = String(text).trim();
              if (USE_TITLE_SEARCH_LINKS) {
                if (seenQueries.has(query)) return; // skip duplicate
                seenQueries.add(query);
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

          // Always render Worker-provided evidence as authoritative clickable links
          try{
            const ev = r.evidence || [];
            // Worker evidence rendering controlled by internal flag.
            if (Array.isArray(ev) && ev.length){
              // reuse existing list if model sources created one, otherwise create
              let list = w.evidence && w.evidence.querySelector && w.evidence.querySelector('.ub-ai-evidence-list');
              if (!list) { list = el('ul', { class: 'ub-ai-evidence-list' }, []); if (w.evidence) w.evidence.appendChild(list); }
              ev.forEach(item => {
                const id = item.id || item.path || '';
                // Prefer item.title for search queries; fallback to normalized id
                const titleText = item.title || '';
                // Normalize id to a wiki path without .md
                let slug = String(id).replace(/\.md$/,'').replace(/^\/+|\/+$/g, '');
                const text = titleText || slug || id;
                if (USE_TITLE_SEARCH_LINKS) {
                  const query = String(text).trim();
                  if (seenQueries.has(query)) return; // already emitted by model sources
                  seenQueries.add(query);
                  const href = 'search:' + encodeURIComponent(query);
                  const a = el('a', { href: href, class: 'search-link', 'data-query': query }, text);
                  const li = el('li', {}, a);
                  list.appendChild(li);
                } else {
                  const href = base + encodeURI(slug);
                  const a = el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }, text);
                  const li = el('li', {}, a);
                  list.appendChild(li);
                }
              });
            }
          }catch(e){ /* ignore rendering errors */ }
        }catch(e){ /* ignore model source parsing errors */ }
        // If nothing was rendered and there was no answer, show silence
        if (!w.out.textContent && (!r.evidence || !r.evidence.length)) w.out.textContent = 'silence';
      };
      w.btn.addEventListener('click', handleAsk);
      // Submit on plain Enter. Ctrl/Cmd+Enter inserts a newline at the caret.
      w.input.addEventListener('keydown', (ev)=>{
        if (ev.key === 'Enter') {
          if (ev.ctrlKey || ev.metaKey) {
            // Insert a newline at the current caret position
            try{
              ev.preventDefault();
              const el = w.input;
              const start = el.selectionStart || 0;
              const end = el.selectionEnd || 0;
              const v = el.value || '';
              el.value = v.slice(0, start) + '\n' + v.slice(end);
              // place caret after the inserted newline
              const pos = start + 1;
              el.selectionStart = el.selectionEnd = pos;
              try { autosize(); } catch(e){}
              try { updateVisibility(); } catch(e){}
            }catch(e){}
          } else {
            ev.preventDefault();
            try { handleAsk(); } catch(e){}
          }
        }
      });
      // Show placeholder only when the field is NOT focused (and empty).
      // When focused we hide the placeholder so caret/typing is clear.
      try{
        const stored = w.input.getAttribute('data-ub-placeholder') || '';
        // Hide placeholder while editing, but only when the field is empty.
        w.input.addEventListener('focus', ()=>{
          try{
            if (w.input.value && String(w.input.value).trim()) return; // has content — do nothing
            w.input.placeholder = '';
            // If the field is empty and the placeholder is being removed,
            // ensure the textarea is cleared and collapsed to a single-line
            // height immediately so the layout doesn't stay at the placeholder height.
            try{ w.input.value = ''; }catch(e){}
            try{ w.input.style.height = 'auto'; }catch(e){}
            try{ if (typeof autosize === 'function') autosize(); }catch(e){}
            try{ if (typeof updateVisibility === 'function') updateVisibility(); }catch(e){}
          }catch(e){}
        });
        // Restore placeholder when blurred and empty; reapply measured placeholder height when available
        w.input.addEventListener('blur', ()=>{
          try{
            if (!w.input.value) {
              w.input.placeholder = stored;
              try{ if (w.placeholderHeight) w.input.style.height = w.placeholderHeight + 'px'; }catch(e){}
            }
          }catch(e){}
        });
        // Initial state: if not focused and empty, show placeholder
        if (document.activeElement !== w.input && !w.input.value) w.input.placeholder = stored;

        // Measure the textarea height when the placeholder is visible so we can
        // restore that exact height on blur. We perform the measurement inside
        // a rAF to ensure layout has settled, and use a temporary-value method
        // (set value to the placeholder text) to measure wrapped height.
        try{
          requestAnimationFrame(()=>{
            try{
              const el = w.input;
              // Only measure when the field is currently empty (placeholder shown)
              if (el && !el.value && stored) {
                const prevVal = el.value;
                const prevRows = el.rows;
                const s0 = el.selectionStart; const s1 = el.selectionEnd;
                try{ el.value = stored; el.rows = 1; }catch(e){}
                // read scrollHeight which includes wrapped lines
                const h = el.scrollHeight;
                // restore
                try{ el.value = prevVal; el.rows = prevRows; }catch(e){}
                try{ if (typeof el.setSelectionRange === 'function') el.setSelectionRange(s0, s1); }catch(e){}
                if (h && !isNaN(h)) w.placeholderHeight = Math.max(12, Math.round(h));
              }
            }catch(e){}
          });
        }catch(e){}
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
            // Ensure textarea resizes to reflect the cleared (empty) value
            try{ if (typeof autosize === 'function') autosize(); }catch(e){}
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
        // Share button image
        try {
          const shareImg = document.createElement('img');
          shareImg.src = '/ultrabroken-documentation/assets/images/share-icon.svg';
          shareImg.alt = 'Share';
          // match Ask button icon sizing so image fills the button
          shareImg.style.width = '100%';
          shareImg.style.height = '100%';
          shareImg.style.display = 'block';
          shareImg.style.objectFit = 'contain';
          w.share.textContent = '';
          w.share.appendChild(shareImg);
          // style the share button to match .ub-ai-ask so it's visible
          w.share.style.background = 'transparent';
          w.share.style.padding = '0.15rem';
          w.share.style.boxSizing = 'border-box';
          w.share.style.alignItems = 'center';
          w.share.style.justifyContent = 'center';
          w.share.style.borderRadius = '0.2rem';
          w.share.style.width = '1.6rem';
          w.share.style.height = '1.6rem';
          w.share.style.border = 'none';
          w.share.style.cursor = 'pointer';
        } catch (e) {}
        // Start hidden; only show when the input has text (mirrors clear button behavior)
        w.btn.style.display = 'none';
        if (w.share) w.share.style.display = 'none';

        // Share button: copy a permalink that encodes the query so it can be shared
        if (w.share) {
          try {
            w.share.addEventListener('click', () => {
              try {
                const q = String(w.input.value || '').trim();
                if (!q) return;
                // Copy only the user's prompt text to the clipboard (no URL)
                navigator.clipboard.writeText(q).then(() => {
                  try { showCopiedToast && showCopiedToast('Copied to clipboard'); } catch (e) {}
                }).catch(err => {
                  try { showCopiedToast && showCopiedToast('Copy failed'); } catch (e) {}
                  console.error('copy prompt failed', err);
                });
              } catch (err) { console.error('share click error', err); }
            });
          } catch (e) {}
        }

        // Shared resizing function to make icons match the Ask button visual height
        const resizeIcons = ()=>{
          try{
            const btnRect = w.btn.getBoundingClientRect();
            let targetH = 0;
            if (btnRect && btnRect.height > 0) targetH = Math.round(btnRect.height);
            else targetH = Math.round(parseFloat(getComputedStyle(w.btn).fontSize) || 16);
            targetH = Math.max(12, targetH);
            if (clearImg) { clearImg.style.height = targetH + 'px'; clearImg.style.width = 'auto'; }
            if (askImg) { askImg.style.height = targetH + 'px'; askImg.style.width = 'auto'; }
            if (w.share && w.share.querySelector('img')) { w.share.querySelector('img').style.height = targetH + 'px'; }
          }catch(e){}
        };

        // Reserve a small right padding equal to the clear (close) button width
        // so the caret won't overlap the clear icon when it's visible. Only the
        // clear button is considered to avoid wasting space for the other icons.
        const reserveClosePadding = ()=>{
          try{
            const gap = 8; // spacing between text and icon
            let pad = 12; // sensible minimum
            if (w.clear && w.clear.getBoundingClientRect) {
              const r = w.clear.getBoundingClientRect();
              const visible = w.clear.style.display !== 'none' && r && r.width > 0;
              if (visible) pad = Math.max(12, Math.round(r.width) + gap);
            }
            w.input.style.paddingRight = pad + 'px';
          }catch(e){}
        };

        // Toggle visibility for both controls based on input content
        const updateVisibility = ()=>{
          const has = w.input.value.trim();
          if (w.clear) w.clear.style.display = has ? 'flex' : 'none';
          w.btn.style.display = has ? 'flex' : 'none';
          if (w.share) w.share.style.display = has ? 'flex' : 'none';
          // After toggling, resize icons to match rendered button height
          // use a short timeout to allow layout to settle when showing
          setTimeout(()=>{ try{ resizeIcons(); reserveClosePadding(); }catch(e){} }, 0);
        };

        // Autosize to content and do not mutate the user's input value.
        const autosize = ()=>{
          try{
            requestAnimationFrame(()=>{
              try{ w.input.style.height = 'auto'; const h = w.input.scrollHeight; if (h) w.input.style.height = h + 'px'; }catch(e){}
            });
          }catch(e){}
        };
        ['input','change','paste','cut','compositionend'].forEach(evt => w.input.addEventListener(evt, ()=>{
          try{ updateVisibility(); }catch(e){}
          try{ requestAnimationFrame(()=>{ try{ autosize(); }catch(e){} }); }catch(e){}
        }));
        // initial sizing
        try{ autosize(); }catch(e){}
        // initial sizing and keep in sync with resizes
        resizeIcons(); reserveClosePadding();
        window.addEventListener('resize', ()=>{ try{ resizeIcons(); reserveClosePadding(); }catch(e){} });
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
