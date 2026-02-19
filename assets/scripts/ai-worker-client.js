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
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1; display:flex;' });
    const _placeholder_text = 'What is referred to as Wacko Boingo?';
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
    row.appendChild(inputWrap);
    // place clear as its own control (sibling to ask/share) so it behaves like other action buttons
    row.appendChild(clearBtn);
    row.appendChild(askBtn);
    row.appendChild(shareBtn);
    
    root.appendChild(row);
    root.appendChild(out);
    // append evidence container to the widget so it's accessible via the returned handle
    root.appendChild(evidenceWrap);
    container.appendChild(root);
    return { input, inputWrap, btn: askBtn, share: shareBtn, out, clear: clearBtn, evidence: evidenceWrap };
  }

  async function askWorker(q){
    // Default to the registered workers.dev subdomain so fetches go to the Worker,
    // not the GitHub Pages origin which rejects POSTs to /worker.
    const DEFAULT_WORKER_URL = 'https://ultrabroken-rag.gl1tchcr4vt.workers.dev';
    const url = window.AI_WORKER_URL || localStorage.getItem('ai_worker_url') || DEFAULT_WORKER_URL;
    try{
      const res = await fetch(url, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ query: q }) });
      if (!res.ok) {
        // Attempt to read error details from response body for better debugging
        let text = null;
        try{ text = await res.text(); }catch(e){}
        try{ console.error('Worker responded with', res.status, text); }catch(e){}
        // Try parse JSON error body if possible
        try{ const j = JSON.parse(text || '{}'); return { error: j.error || JSON.stringify(j) || ('worker error '+res.status) }; }catch(e){ return { error: text || ('worker error '+res.status) }; }
      }
      return await res.json();
    }catch(e){ console.error('askWorker fetch failed', e); return { error: String(e) }; }
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
      try{ window._ub_ai = w; }catch(e){}
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
        // Use a click-through overlay placeholder element instead of the
        // native placeholder pseudo-element to avoid UA rendering quirks.
        try{
          // ensure input has no native placeholder text
          try{ w.input.placeholder = ''; }catch(e){}
          const fake = el('div', { class: 'ub-ai-fake-placeholder', 'aria-hidden': 'true' }, stored);
          try{ if (w.inputWrap) w.inputWrap.appendChild(fake); }catch(e){}
          w._fakePlaceholder = fake;
        }catch(e){}

        // Load rotating placeholder texts from JSON and cycle every 4s.
        (async ()=>{
          try{
            const url = '/ultrabroken-documentation/assets/scripts/placeholders.json';
            const res = await fetch(url);
            if (!res.ok) return;
            const arr = await res.json();
            if (!Array.isArray(arr) || arr.length === 0) return;
            w._placeholders = arr.map(String);
            w._placeholderIndex = 0;
            const applyPlaceholder = (txt)=>{
              try{
                if (!txt) return;
                // Pause rotating placeholders while the input is focused so
                // we don't distract the user or change the overlay mid-edit.
                if (document.activeElement === w.input) return;
                w.input.setAttribute('data-ub-placeholder', txt);
                if (w._fakePlaceholder && !w.input.value && document.activeElement !== w.input) {
                  w._fakePlaceholder.textContent = txt;
                }
                // Measure placeholder height synchronously using a hidden clone
                try{
                  const input = w.input;
                  if (input && !input.value) {
                    // create a lightweight clone for measurement
                    const c = input.cloneNode(false);
                    c.removeAttribute('id');
                    c.style.position = 'absolute';
                    c.style.visibility = 'hidden';
                    c.style.pointerEvents = 'none';
                    c.style.zIndex = '-9999';
                    c.style.left = '-9999px';
                    c.style.top = '0';
                    c.style.height = 'auto';
                    c.style.whiteSpace = 'pre-wrap';
                    c.style.overflow = 'visible';
                    // copy computed styles that affect wrapping
                    try{
                      const cs = window.getComputedStyle(input);
                      const props = ['boxSizing','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','whiteSpace','wordBreak','overflowWrap','wordWrap','tabSize'];
                      props.forEach(p=>{ try{ c.style[p] = cs[p]; }catch(e){} });
                      try{ const rect = input.getBoundingClientRect(); c.style.width = Math.max(10, Math.round(rect.width)) + 'px'; }catch(e){}
                    }catch(e){}
                    c.value = txt;
                    document.body.appendChild(c);
                    const measured = c.scrollHeight || 0;
                    document.body.removeChild(c);
                    const h = Math.max(12, Math.round(measured));
                    w.placeholderHeight = h;
                    try{ input.style.height = h + 'px'; }catch(e){}
                  }
                }catch(e){}
              }catch(e){}
            };
            // Apply initial placeholder (replace stored)
            applyPlaceholder(w._placeholders[0]);
            // Cycle every 4s; skip updates while the input is focused
            w._placeholderTimer = setInterval(()=>{
              try{
                if (document.activeElement === w.input) return;
                w._placeholderIndex = (w._placeholderIndex + 1) % w._placeholders.length;
                applyPlaceholder(w._placeholders[w._placeholderIndex]);
              }catch(e){}
            }, 4000);
          }catch(e){}
        })();

        // Hide overlay while editing, but only when the field is empty.
        // On focus, hide overlay and clear the field so typing starts from
        // a single-row empty textarea. This also forces `autosize` to compute
        // height from an empty value (see autosize change below).
        w.input.addEventListener('focus', ()=>{
          try{
            // Only clear/hide when the field is currently empty. If the
            // user focused an existing query, leave the content intact.
            if (w.input.value && String(w.input.value).trim()) return;
            try{ if (w._fakePlaceholder) w._fakePlaceholder.style.display = 'none'; }catch(e){}
            try{ w.input.value = ''; }catch(e){}
            try{ collapseToSingleLine(w.input); }catch(e){}
            try{ if (typeof autosize === 'function') autosize(); }catch(e){}
            try{ if (typeof updateVisibility === 'function') updateVisibility(); }catch(e){}
          }catch(e){}
        });

        // Show overlay when blurred and empty; reapply measured placeholder height when available
        w.input.addEventListener('blur', ()=>{
          try{
            if (!w.input.value) {
              try{ if (w._fakePlaceholder) w._fakePlaceholder.style.display = 'block'; }catch(e){}
              try{ if (w.placeholderHeight) w.input.style.height = w.placeholderHeight + 'px'; }catch(e){}
            }
          }catch(e){}
        });

        // Initial state: show overlay only when not focused and empty
        try{
          if (document.activeElement !== w.input && !w.input.value) {
            try{ if (w._fakePlaceholder) w._fakePlaceholder.style.display = 'block'; }catch(e){}
          } else {
            try{ if (w._fakePlaceholder) w._fakePlaceholder.style.display = 'none'; }catch(e){}
          }
        }catch(e){}

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
      // Helper: immediately collapse a textarea to a conservative single-line
      // visual height (line-height + vertical padding). Used by focus and
      // clear flows to avoid visible lag before `autosize` runs.
      const collapseToSingleLine = (inputEl) => {
        try{
          if (!inputEl) return;
          const cs = window.getComputedStyle(inputEl);
          const fontSize = parseFloat(cs.fontSize) || 16;
          let lh = cs.lineHeight;
          let lineH = 0;
          if (lh === 'normal' || !lh) {
            lineH = fontSize * 1.2;
          } else if (lh.indexOf && lh.indexOf('px') !== -1) {
            lineH = parseFloat(lh);
          } else {
            const n = parseFloat(lh) || 1.2;
            lineH = fontSize * n;
          }
          const padTop = parseFloat(cs.paddingTop) || 0;
          const padBottom = parseFloat(cs.paddingBottom) || 0;
          const target = Math.max(12, Math.round(lineH + padTop + padBottom));
          inputEl.style.height = target + 'px';
        }catch(e){}
      };
      try{
        // Ensure clear button exists
        if (w.clear){
          // set image for the clear button (published site path)
          const clearImg = document.createElement('img');
          clearImg.src = '/ultrabroken-documentation/assets/images/cancel-icon.svg';
          clearImg.alt = 'Clear';
          
          // ensure clear button starts hidden; layout/spacing handled by CSS
          w.clear.style.display = 'none';
          w.clear.appendChild(clearImg);
          w.clear.addEventListener('click', ()=>{ 
            w.input.value = ''; 
            // Clear rendered answer and any HTML inside
            try{ if (w.out) { w.out.textContent = ''; w.out.innerHTML = ''; } }catch(e){}
            // Also clear parsed/rendered sources/evidence
            try{ if (w.evidence) w.evidence.innerHTML = ''; }catch(e){}
            w.input.focus(); 
            // Immediately collapse to single-line visual height, then run autosize
            try{ collapseToSingleLine(w.input); }catch(e){}
            try{ if (typeof autosize === 'function') autosize(); }catch(e){}
            try { if (typeof updateVisibility === 'function') updateVisibility(); else { w.clear.style.display = 'none'; w.btn.style.display = 'none'; } } catch(e){ w.clear.style.display = 'none'; w.btn.style.display = 'none'; }
          });
        }

        // Replace textual Ask label with an SVG inside the Ask button
        const askImg = document.createElement('img');
        askImg.src = '/ultrabroken-documentation/assets/images/ask-icon.svg';
        askImg.alt = 'Ask';
        
        // Clear any existing textual content in the button and append the SVG
        w.btn.textContent = '';
        w.btn.appendChild(askImg);
        // Share button image
        try {
          const shareImg = document.createElement('img');
          shareImg.src = '/ultrabroken-documentation/assets/images/share-icon.svg';
          shareImg.alt = 'Share';
          w.share.textContent = '';
          w.share.appendChild(shareImg);
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
            // CSS controls icon sizing; no inline sizing applied here to avoid
            // conflicts with author styles.
          }catch(e){}
        };

        // Toggle visibility for both controls based on input content
        const updateVisibility = ()=>{
          const has = w.input.value.trim();
          if (w.clear) w.clear.style.display = has ? 'flex' : 'none';
          w.btn.style.display = has ? 'flex' : 'none';
          if (w.share) w.share.style.display = has ? 'flex' : 'none';
          // Toggle the click-through overlay placeholder: show only when
          // the field is empty and not focused.
          try{
            if (w._fakePlaceholder) {
              const showFake = !has && document.activeElement !== w.input;
              w._fakePlaceholder.style.display = showFake ? 'block' : 'none';
            }
          }catch(e){}
          // After toggling, resize icons to match rendered button height
          // use a short timeout to allow layout to settle when showing
          setTimeout(resizeIcons, 0);
        };

        // Autosize to content using a hidden off-DOM clone, and perform a
        // robust rAF-sequenced apply+measure+scroll so mobile keyboards and
        // viewport changes don't race with our scroll adjustments.
        // A lightweight debug trace can be enabled by setting `w._debugAutosize = true`.
        const autosize = ()=>{
          try{
            const ensureClone = ()=>{
              try{
                if (w._autosizeClone && w._autosizeClone.parentNode) return w._autosizeClone;
                const c = w.input.cloneNode(false);
                c.removeAttribute('id');
                c.style.position = 'absolute';
                c.style.visibility = 'hidden';
                c.style.pointerEvents = 'none';
                c.style.zIndex = '-9999';
                c.style.left = '-9999px';
                c.style.top = '0';
                c.style.height = 'auto';
                c.style.whiteSpace = 'pre-wrap';
                c.style.overflow = 'visible';
                c.style.overflowY = 'visible';
                document.body.appendChild(c);
                w._autosizeClone = c;
                return c;
              }catch(e){ return null; }
            };

            // Measure desired height using the clone synchronously.
            const measureTarget = (clone, input, measurementValue) => {
              try{
                if (!clone) return null;
                // Copy relevant computed styles that affect wrapping
                const cs = window.getComputedStyle(input);
                const props = ['boxSizing','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','whiteSpace','wordBreak','overflowWrap','wordWrap','tabSize'];
                props.forEach(p=>{ try{ clone.style[p] = cs[p]; }catch(e){} });
                try{ const rect = input.getBoundingClientRect(); clone.style.width = Math.max(10, Math.round(rect.width)) + 'px'; }catch(e){}
                clone.value = measurementValue || '';
                clone.style.height = 'auto';
                return Math.max(12, Math.round(clone.scrollHeight || 0));
              }catch(e){ return null; }
            };

            const input = w.input;
            if (!input) return;
            const clone = ensureClone();
            const storedPlaceholder = input.getAttribute('data-ub-placeholder') || '';
            const isFocused = (document.activeElement === input);
            const measurementValue = (input.value && input.value.length)
              ? input.value
              : (isFocused ? '' : (storedPlaceholder || ''));

            // If clone not available, fallback to simple scrollHeight method
            if (!clone) {
              try{ input.style.height = 'auto'; const h = input.scrollHeight; if (h) input.style.height = h + 'px'; }catch(e){}
              return;
            }

            // First: measure desired height now
            const measured = measureTarget(clone, input, measurementValue);
            if (!measured) return;
            const targetH = measured;

            // Apply and then measure+scroll in the next frames to let the
            // browser apply layout/keyboard-driven viewport changes first.
            requestAnimationFrame(()=>{
              try{
                const cur = parseInt((input.style.height||'0').replace('px',''),10) || 0;
                if (Math.abs(cur - targetH) <= 1) {
                  if (w._debugAutosize) console.debug('autosize: no-change', { cur, targetH });
                  return;
                }
                // Set target height immediately
                input.style.height = targetH + 'px';
                // Next frame: measure visibility and perform any scroll
                requestAnimationFrame(()=>{
                  try{
                    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                    const skipUntil = w._skipUntil || 0;
                    if (w._debugAutosize) console.debug('autosize: post-apply', { targetH, cur, now, skipUntil });

                    // Compute element geometry and viewport coords (document-space)
                    const rect = input.getBoundingClientRect();
                    const scrollY = window.scrollY || window.pageYOffset || 0;
                    let vpTopDoc = scrollY;
                    let vpBottomDoc = scrollY + window.innerHeight;
                    if (window.visualViewport) {
                      const vv = window.visualViewport;
                      vpTopDoc = scrollY + (vv.offsetTop || 0);
                      vpBottomDoc = vpTopDoc + (vv.height || window.innerHeight);
                    }
                    const elemBottomDoc = scrollY + rect.bottom;
                    const elemTopDoc = scrollY + rect.top;
                    const safeMargin = 8;

                    // If element bottom is below viewport bottom, scroll just enough
                    let delta = 0;
                    if (elemBottomDoc > (vpBottomDoc - safeMargin)) {
                      delta = Math.round(elemBottomDoc - (vpBottomDoc - safeMargin));
                    } else if (elemTopDoc < (vpTopDoc + safeMargin)) {
                      // If the element moved above the top (unlikely on expansion), scroll up
                      delta = Math.round(elemTopDoc - (vpTopDoc + safeMargin));
                    }

                    if (delta !== 0) {
                      // Respect skip guards (set elsewhere) to avoid double-scrolling
                      if (!(now < skipUntil) && !w._skipScrollBy) {
                        // Clamp delta so we don't scroll past document bounds
                        const docH = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
                        const maxScrollTop = Math.max(0, docH - (vpBottomDoc - vpTopDoc));
                        const desired = Math.max(0, Math.min(maxScrollTop, window.scrollY + delta));
                        const actualDelta = desired - window.scrollY;
                        if (actualDelta !== 0) {
                          try{ window.scrollBy({ top: actualDelta, left: 0, behavior: 'auto' }); }catch(e){ window.scrollBy(0, actualDelta); }
                          if (w._debugAutosize) console.debug('autosize: scrolled', { delta: actualDelta, desired });
                          // brief guard window to avoid immediate follow-up scrolls
                          try{ w._skipUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 300; }catch(e){ w._skipUntil = Date.now() + 300; }
                        }
                      } else {
                        if (w._debugAutosize) console.debug('autosize: skipped-scroll', { delta, now, skipUntil: w._skipUntil, _skipScrollBy: !!w._skipScrollBy });
                      }
                    } else {
                      if (w._debugAutosize) console.debug('autosize: visible-no-scroll', { rectTop: rect.top, rectBottom: rect.bottom, vpBottom: vpBottomDoc - scrollY });
                    }
                  }catch(e){ if (w._debugAutosize) console.debug('autosize: post-apply error', e); }
                });
              }catch(e){ if (w._debugAutosize) console.debug('autosize: apply error', e); }
            });
          }catch(e){ if (w._debugAutosize) console.debug('autosize: outer error', e); }
        };
        ['input','change','paste','cut','compositionend'].forEach(evt => w.input.addEventListener(evt, ()=>{
          try{ updateVisibility(); }catch(e){}
          try{ requestAnimationFrame(()=>{ try{ autosize(); }catch(e){} }); }catch(e){}
        }));
        // initial sizing
        try{ autosize(); }catch(e){}
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
