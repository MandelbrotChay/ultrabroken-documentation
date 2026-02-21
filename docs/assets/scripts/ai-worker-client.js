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
  // Hard cap on query length sent to the worker. Configurable via `window.AI_MAX_QUERY_CHARS`.
  const MAX_QUERY_CHARS = 50;
  // Idle texts shown in the output area before any query is made and after
  // clearing. One is picked at random each time. Cleared when a query starts.
  const _IDLE_TEXTS = [
    'So this happens if the Triforce of wisdom gets out of control...',
    'A chosen hero wants to know how to break Hylias creation... What a plot twist!',
    'The flame of curiosity flares so brightly in you... Don\'t burn your Ultrafingers!',
    'The Purah Pad is indexing forbidden knowledge...',
    'Even the Great Deku Tree does not know everything.',
    'The Shiekah are not telling you the whole story...',
    'The Koroks are hiding more than just seeds, it seems.',
    'Somewhere, a Lynel sighs at the audacity of the question.',
    'The Upheaval shook more than just the land — it destabilised the entire collision engine.',
    'Rauru built his kingdom on solid ground. The physics engine, less so.',
    'Hestu rattles his maracas in quiet disapproval of your out-of-bounds vector.',
    'The Sages have convened. They are also confused.',
    'A Bubbulfrog watches from the ceiling, bewildered by your clip angle.',
    'Mineru\'s construct chassis was not stress-tested for these inputs.',
    'The Yiga Clan has stolen the patch notes. Again.',
    'Zelda\'s tears have been weaponised. Impressively.',
    'Ganondorf did not anticipate speedrunners when drafting his evil plan.',
    'Somewhere in the depths, a Construct is still processing your last query.',
    'The ancient Zonai engineers left no documentation. We wrote our own.',
    'A Hinox stirs. It mistakes your Ultrafingers for a threat.',
    'Link has clipped through the floor. Again. He seems used to it.',
    'The Bargainer Statues accept Poes and, apparently, out-of-bounds coordinates.',
    'Josha\'s research notes mention a \'gravity anomaly\'. The community calls it Friday.',
    'Every Stable horse-keeper has witnessed inexplicable things. They stay quiet.',
    'A Talus pauses mid-animation to contemplate your query.',
    'The King of Hyrule left behind six temples and one extremely buggy physics layer.',
    'Robbie\'s Skyview Tower logs contain entries he refuses to discuss.',
    'Underground, the gloom spreads. On the surface, the clipping begins.',
    'Your Ultrafingers are showing. The Great Sky Island trembles.',
    'Sidon offers you a pep talk. It does not resolve the collision mesh.',
    'Tulin rides the wind. You ride the undefined behaviour.',
    'A Silver Moblin has inexplicably been launched into the stratosphere. Business as usual.',
    'The Temple of Time has seen you before. It is not impressed.',
    'Bolson has declined to build a structure capable of withstanding your techniques.',
    'Even the White-Maned Lynel acknowledges: this one hits different.',
    'The Zonai survey team logged this exact anomaly. Filed under \'do not ship\'.',
    'Hudson & Sons Ltd. accepts no liability for constructions used in glitch discovery.',
    'Lurelin Village was rebuilt. The physics budget was not.',
    'The Calamity never dreamed of anything this broken.',
    'A Horriblin clings to the wall and watches your every frame-perfect input.',
  ];
  const idleText = () => _IDLE_TEXTS[Math.floor(Math.random() * _IDLE_TEXTS.length)];
  // Text shown while the worker is processing a query.
  const LOADING_TEXT = 'Let me look into that real quick...';
  // Text shown in the output area when idle mode is active but the input is focused.
  // Set to '' to leave it blank, or fill in a prompt hint.
  const IDLE_FOCUSED_TEXT = 'Gtreetings, curious wanderer. Ask me anything about the secrets of Hyrule. Will I share word or waffle? Tip or trick? Legend or lie? Who knows?';  // Text shown immediately on blur (before the typewriter finishes and picks a new idle text).
  // This bridges the gap between blur and the typewriter callback.
  const IDLE_BLUR_TEXT = 'I shall continue yapping nonsense then...';
  // Text shown in the output area immediately after a silence response clears.
  // Displayed instead of a random idle text until the typewriter finishes its
  // next full cycle, at which point normal idle text rotation resumes.
  const IDLE_SILENCE_TEXT = 'Back to nonsense!';
  // Placeholder pool — randomly sampled each time the widget initialises.
  const _PLACEHOLDERS = [
    "What is Wacko Boingo?",
    "How to trigger a Zuggle?",
    "Where is the Grimoire of Glitchcraft?",
    "Fastest way to Tulin pump?",
    "Explain Recall-Clip simply",
    "How to perform Jump-Slash?",
    "How to do Long Jump?",
    "What causes OOB glitches?",
    "How to trigger Save-Load dupe?",
    "What is Weapon Stacking?",
    "How to Autobuild Cancel?",
    "How to perform Dive Cancel?",
    "How to do Bow Sprinting?",
    "What is Midair Transmutation?",
    "Reproduce Message-Not-Found?",
    "How to trigger Zuggle Overload?",
    "How to do double Tulin boost?",
    "What is Ascend Storage?",
    "How to perform Recall Launch?",
    "How to Weapon State Transfer?",
    "How to cause Infinite Damage?",
    "What is Anti-Gravity Glitch?",
    "How to Scope Render Cancel?",
    "Fix Midair Duplication?",
    "How to Duplicate Equipment?",
    "What breaks minecart rails?",
    "How to trigger Animation Swap?",
    "What is Jumpslash Cancel?",
    "How to cause Collision Launch?",
    "How to avoid Fall Damage?",
    "What is Throw-Tap Sprinting?",
    "How to stack weapons safely?",
    "Use Recall-Clip reliably?",
    "Reproduce Storage Ascend?",
    "What is Bthrow Sprint Trick?",
    "How to trigger Mozdor Jump?",
    "How to perform Air Dupes?",
    "How to transmute Midair Items?",
    "Where to report glitches?"
  ];
  
  function render(container){
    const root = el('div', { class: 'ub-ai-root' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:flex-end;' });
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1; display:flex;' });
    const _placeholder_text = _PLACEHOLDERS[Math.floor(Math.random() * _PLACEHOLDERS.length)];
      // Always use the contenteditable branch so the input naturally grows
      let input;
      // visible contenteditable — starts empty; animation fills it
      input = el('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input', spellcheck: 'false', autocorrect: 'off', autocomplete: 'on', autocapitalize: 'on' }, '');
      // textarea base styles for autosize and wrapping
      try{
        input.style.resize = 'none';
          input.style.overflow = 'hidden';
        input.style.overflowY = 'hidden';
        input.style.flex = '1 1 auto';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
          try{ input.setAttribute('wrap', 'soft'); }catch(e){}
        input.style.whiteSpace = 'pre-wrap';
        // Ensure long words wrap on desktop and mobile. `anywhere` +
        // permissive `wordBreak` prevents single long tokens from overflowing.
        try{ input.style.overflowWrap = 'anywhere'; }catch(e){}
        try{ input.style.wordBreak = 'break-word'; }catch(e){}
        try{ input.style.display = 'block'; }catch(e){}
      }catch(e){}
    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear', 'aria-label': 'Clear search' }, '');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask', 'aria-label': 'Ask' }, '');
    const shareBtn = el('button', { type: 'button', class: 'ub-ai-share', 'aria-label': 'Share query' }, '');
    // NOTE: user-facing toggle removed — rendering of model-returned sources
    // is controlled by the internal `SHOW_MODEL_SOURCES` flag declared above.
    // Output area (answer + evidence). `out` holds the model answer; `evidenceWrap` holds clickable evidence links returned by the Worker.
    // Starts blank; the typewriter callback populates it after the first cycle.
    const out = el('div', { class: 'ub-ai-out' }, '');
    const evidenceWrap = el('div', { class: 'ub-ai-evidence' }, '');
    inputWrap.appendChild(input);
    row.appendChild(inputWrap);
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
      w._idleMode = true; // true while showing idle/cleared state; false while showing a query result
      // No user-facing toggle: `SHOW_MODEL_SOURCES` controls whether model-
      // returned `Source:` lines are rendered. This is intentionally internal.
      // The Worker now returns structured `response_text`, optional `response_sources` (text block)
      // and a `sources` array ([{title, path|null}]). The client renders those directly
      // and no longer attempts to parse `response_text` for Sources.

      const handleAsk = async ()=>{
        let q = (typeof w.getValue === 'function' ? w.getValue() : (w.input.value||'')).trim(); if (!q) return;
        if (q.length > MAX_QUERY_CHARS) q = q.slice(0, MAX_QUERY_CHARS).trim();
        try{ if (typeof lockInput === 'function') lockInput(); }catch(e){}
        w._idleMode = false;
        w.out.textContent = LOADING_TEXT;
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
        // Auto-clear after a short delay when the worker returned a silence response
        if (r.silence) {
          setTimeout(()=>{ try{ _postSilence = true; doClear(); }catch(e){} }, 2500);
        }
      };
      w.btn.addEventListener('click', handleAsk);
      // Helper accessors for faux input support. Treat the inline
      // placeholder (stored in `data-ub-placeholder`) as empty content.
      w.getValue = ()=>{
        try{
          if (w.input && (w.input.contentEditable === 'true' || w.input._inputLocked)) {
            if (w.input._phAnimating) return ''; // animation in progress — treat as empty
            const txt = String(w.input.textContent || '');
            const ph = String(w.input.getAttribute('data-ub-placeholder') || '');
            return txt === ph ? '' : txt;
          }
        }catch(e){}
        try{ return String((w.input && w.input.value) || ''); }catch(e){ return ''; }
      };
      w.setValue = (v)=>{
        try{
          if (w.input && w.input.contentEditable === 'true') {
            if (!v) {
              // clearing: stop any running animation, blank the field, restart animation
              try{ if (typeof stopPhAnim === 'function') stopPhAnim(); }catch(e){}
              w.input.textContent = '';
              try{ w.input.removeAttribute('data-ub-placeholder-active'); }catch(e){}
              try{ if (typeof startPhAnim === 'function') startPhAnim(); }catch(e){}
            } else {
              try{ if (typeof stopPhAnim === 'function') stopPhAnim(); }catch(e){}
              w.input.textContent = v;
              try{ w.input.removeAttribute('data-ub-placeholder-active'); }catch(e){}
            }
            return;
          }
        }catch(e){}
        try{ if (w.input) w.input.value = v; }catch(e){}
      };

      // Typewriter animation engine for placeholder.
      // Picked fresh on every blur-when-empty / clear / init.
      let _phAnimHandle = null;
      let _phLastIdx    = -1;
      let _postSilence  = false; // true when a clear was triggered by a silence response
      const stopPhAnim = ()=>{
        try{ if (_phAnimHandle !== null){ clearTimeout(_phAnimHandle); _phAnimHandle = null; } }catch(e){}
        try{ w.input._phAnimating = false; }catch(e){}
      };
      // startPhAnim([startFull])
      // When startFull=true the placeholder is shown pre-filled and idle text is
      // set immediately; the delete phase runs right away without typing first.
      // Used on page init/refresh so the widget appears fully populated.
      const startPhAnim = (startFull = false)=>{
        stopPhAnim();
        if (document.activeElement === w.input) return; // don't animate while focused
        let idx;
        do { idx = Math.floor(Math.random() * _PLACEHOLDERS.length); }
        while (_PLACEHOLDERS.length > 1 && idx === _phLastIdx);
        _phLastIdx = idx;
        const text = _PLACEHOLDERS[idx];
        try{ w.input.setAttribute('data-ub-placeholder', text); }catch(e){}
        w.input._phAnimating = true;
        let pos = 0;
        const TYPE_SPEED  = 65;   // ms per char typed (±jitter)
        const DEL_SPEED   = 30;   // ms per char deleted
        const PAUSE_TYPED = 360;  // tiny pause right after last char lands
        const PAUSE_END   = 1600; // pause at full string before deleting
        const PAUSE_START = 350;  // pause after full delete before next word
        const typeNext = ()=>{
          if (document.activeElement === w.input){ stopPhAnim(); w.input.textContent = ''; return; }
          if (pos <= text.length){
            try{ w.input.textContent = text.slice(0, pos); }catch(e){}
            pos++;
            _phAnimHandle = setTimeout(typeNext, TYPE_SPEED + Math.random() * 40 - 20);
          } else {
            _phAnimHandle = setTimeout(()=>{
              if (w._idleMode) { try{ w.out.textContent = idleText(); }catch(e){} }
              _phAnimHandle = setTimeout(delNext, PAUSE_END);
            }, PAUSE_TYPED);
          }
        };
        const delNext = ()=>{
          if (document.activeElement === w.input){ stopPhAnim(); w.input.textContent = ''; return; }
          if (pos > 0){
            pos--;
            try{ w.input.textContent = text.slice(0, pos); }catch(e){}
            _phAnimHandle = setTimeout(delNext, DEL_SPEED + Math.random() * 20 - 10);
          } else {
            w.input._phAnimating = false;
            _phAnimHandle = setTimeout(()=>{ if (document.activeElement !== w.input) startPhAnim(); }, PAUSE_START);
          }
        };
        if (startFull) {
          // Pre-fill: show full placeholder + idle text immediately, then delete
          pos = text.length;
          try{ w.input.textContent = text; }catch(e){}
          if (w._idleMode) { try{ w.out.textContent = idleText(); }catch(e){} }
          _phAnimHandle = setTimeout(delNext, PAUSE_END);
        } else {
          _phAnimHandle = setTimeout(typeNext, 300);
        }
      };

      // Lock/unlock the input after a response is shown / cleared.
      // Declared at outer scope so handleAsk (defined earlier) can close over them.
      const lockInput = ()=>{
        try{ w.input.setAttribute('contenteditable', 'false'); w.input._inputLocked = true; }catch(e){}
        try{ if (w.btn)   { w.btn.style.display   = 'flex'; w.btn.disabled   = false; } }catch(e){}
        try{ if (w.share) { w.share.style.display = 'flex'; w.share.disabled = false; } }catch(e){}
        try{ if (w.clear) { w.clear.style.display = 'flex'; w.clear.disabled = false; } }catch(e){}
      };
      const unlockInput = ()=>{
        try{ w.input.setAttribute('contenteditable', 'true'); w.input._inputLocked = false; }catch(e){}
      };
      // Declared at outer scope so the silence-timeout in handleAsk can close over it.
      const doClear = () => {
        w._idleMode = true;
        try{ if (typeof unlockInput === 'function') unlockInput(); }catch(e){}
        try{ if (typeof w.setValue === 'function') w.setValue(''); else if (w.input) w.input.value = ''; }catch(e){}
        // Only show idle text immediately if input is not focused; otherwise let the typewriter callback restore it.
        // After a silence response, show the dedicated post-silence text until the next typewriter cycle replaces it.
        const _idleInitText = _postSilence ? IDLE_SILENCE_TEXT : idleText();
        _postSilence = false;
        try{ if (w.out) { w.out.innerHTML = ''; if (document.activeElement !== w.input) w.out.textContent = _idleInitText; } }catch(e){}
        try{ if (w.evidence) w.evidence.innerHTML = ''; }catch(e){}
        try{ if (w.input && w.input.contentEditable === 'true') w.input.style.height = ''; }catch(e){}
        try { updateVisibility(); } catch(e){ w.clear.style.display = 'none'; w.btn.style.display = 'none'; w.share && (w.share.style.display = 'none'); }
      };
      // Declared at outer scope so all closures (handleAsk, doClear, keydown) can reach them.
      const resizeIcons = ()=>{
        try{
          const btnRect = w.btn.getBoundingClientRect();
          let targetH = 0;
          if (btnRect && btnRect.height > 0) targetH = Math.round(btnRect.height);
          else targetH = Math.round(parseFloat(getComputedStyle(w.btn).fontSize) || 16);
          targetH = Math.max(12, targetH);
        }catch(e){}
      };
      const updateVisibility = ()=>{
        const has = String((typeof w.getValue === 'function' ? w.getValue() : (w.input && w.input.value || '')) || '').trim();
        if (has) {
          try{ if (w.clear) { w.clear.style.display = 'flex'; w.clear.disabled = false; } }catch(e){}
          try{ if (w.btn)   { w.btn.style.display   = 'flex'; w.btn.disabled   = false; } }catch(e){}
          try{ if (w.share) { w.share.style.display = 'flex'; w.share.disabled = false; } }catch(e){}
        } else {
          try{ if (w.clear) { w.clear.style.display = 'none'; w.clear.disabled = true; } }catch(e){}
          try{ if (w.btn)   { w.btn.style.display   = 'none'; w.btn.disabled   = true; } }catch(e){}
          try{ if (w.share) { w.share.style.display = 'none'; w.share.disabled = true; } }catch(e){}
        }
        setTimeout(resizeIcons, 0);
      };

      // Focus: kill animation and clear field only when placeholder is showing.
      // If the user already has text in the field, leave it untouched.
      // Blur: restart animation after a short delay if still empty
      try{
        w.input.addEventListener('focus', ()=>{
          try{
            if (w.input._phAnimating) { stopPhAnim(); w.input.textContent = ''; }
            // Hide idle text while focused; typewriter callback restores it after blur
            if (w._idleMode) { try{ w.out.textContent = IDLE_FOCUSED_TEXT; }catch(e){} }
          }catch(e){}
        });
        w.input.addEventListener('blur', ()=>{
          try{
            // Immediately show transient blur text; typewriter callback will replace with actual idle text
            if (w._idleMode) { try{ w.out.textContent = IDLE_BLUR_TEXT; }catch(e){} }
            if (!String(w.input.textContent || '').trim()){
              _phAnimHandle = setTimeout(startPhAnim, 400);
            }
          }catch(e){}
        });
      }catch(e){}
      // Submit on plain Enter. Ctrl/Cmd+Enter inserts a newline at the caret.
      w.input.addEventListener('keydown', (ev)=>{
        if (ev.key === 'Enter') {
          if (ev.ctrlKey || ev.metaKey) {
            // Insert a newline at the current caret position
            try{
              ev.preventDefault();
              if (w.input && w.input.contentEditable === 'true') {
                try{
                  const sel = window.getSelection();
                  if (sel && sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    const node = document.createTextNode('\n');
                    range.insertNode(node);
                    // move caret after inserted node
                    range.setStartAfter(node);
                    range.collapse(true);
                    sel.removeAllRanges(); sel.addRange(range);
                  }
                }catch(e){}
                try { autosize(); } catch(e){}
                try { updateVisibility(); } catch(e){}
              } else {
                const el = w.input;
                const start = el.selectionStart || 0;
                const end = el.selectionEnd || 0;
                const v = el.value || '';
                el.value = v.slice(0, start) + '\n' + v.slice(end);
                const pos = start + 1;
                el.selectionStart = el.selectionEnd = pos;
                try { autosize(); } catch(e){}
                try { updateVisibility(); } catch(e){}
              }
            }catch(e){}
          } else {
            ev.preventDefault();
            try { handleAsk(); } catch(e){}
          }
        }
      });
      // placeholder rotation removed for test
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
          w.clear.addEventListener('click', ()=>{ if (!w._idleMode) _postSilence = true; doClear(); });
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
                const q = String((typeof w.getValue === 'function' ? w.getValue() : (w.input && w.input.value || '')) || '').trim();
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

        // Autosize to content using a hidden off-DOM clone to avoid writing
        // `height = 'auto'` on the real textarea (which can trigger mobile
        // viewport/caret jumps when the on-screen keyboard is visible).
        const autosize = ()=>{
          return;
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

            requestAnimationFrame(()=>{
              try{
                const input = w.input;
                if (!input) return;
                const clone = ensureClone();
                const storedPlaceholder = input.getAttribute('data-ub-placeholder') || '';
                // When the textarea is focused and empty we want it to collapse
                // to a single-row visual height rather than sizing to the
                // overlay placeholder text. Prefer the actual input value;
                // otherwise use an empty string if focused, or the stored
                // placeholder text when blurred.
                const isFocused = (document.activeElement === input);
                const curValForMeasure = (typeof w.getValue === 'function') ? String(w.getValue() || '') : String((input && input.value) || '');
                const measurementValue = (curValForMeasure && curValForMeasure.length)
                  ? curValForMeasure
                  : (isFocused ? '' : (storedPlaceholder || ''));
                if (!clone) {
                  // Fallback to the simple method if clone creation failed
                  try{ input.style.height = 'auto'; const h = input.scrollHeight; if (h) input.style.height = h + 'px'; }catch(e){}
                  return;
                }
                // Copy a set of computed style properties that affect wrapping
                try{
                  const cs = window.getComputedStyle(input);
                  const props = ['boxSizing','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','whiteSpace','wordBreak','overflowWrap','wordWrap','tabSize'];
                  props.forEach(p=>{ try{ clone.style[p] = cs[p]; }catch(e){} });
                  // Use the rendered width to match wrapping precisely
                  try{ const rect = input.getBoundingClientRect(); clone.style.width = Math.max(10, Math.round(rect.width)) + 'px'; }catch(e){}
                }catch(e){}
                try{ if (clone.contentEditable === 'true') clone.textContent = measurementValue; else clone.value = measurementValue; }catch(e){ try{ clone.value = measurementValue; }catch(e){} }
                try{ clone.style.overflowWrap = 'anywhere'; clone.style.wordBreak = 'break-word'; }catch(e){}
                clone.style.height = 'auto';
                const measured = clone.scrollHeight || 0;
                let targetH = Math.max(12, Math.round(measured));
                // If a visualViewport is present (mobile keyboard visible), cap
                // the target height so the textarea doesn't grow into the
                // keyboard area. If capped, allow internal scrolling.
                try{
                  if (window.visualViewport) {
                    const rect = input.getBoundingClientRect();
                    const vv = window.visualViewport;
                    const margin = 8; // small breathing room above keyboard
                    let available = Math.round(vv.height - rect.top - margin);
                    // If focused and constrained, bring the field into view so
                    // it can expand naturally instead of showing an internal
                    // scrollbar. After scrolling, set the full target height.
                    if (isFocused && available > 0 && targetH > available) {
                      try{ input.scrollIntoView({ block: 'center', inline: 'nearest' }); }catch(e){}
                      requestAnimationFrame(()=>{
                        try{
                          const rect2 = input.getBoundingClientRect();
                          const vv2 = window.visualViewport || vv;
                          available = Math.round((vv2.height || vv.height) - rect2.top - margin);
                          input.style.overflowY = 'hidden';
                          try{ input.style.height = targetH + 'px'; }catch(e){}
                        }catch(e){}
                      });
                    } else {
                      if (available > 0 && targetH > available) {
                        targetH = Math.max(12, available);
                        input.style.overflowY = 'auto';
                      } else {
                        input.style.overflowY = 'hidden';
                      }
                    }
                  } else {
                    input.style.overflowY = 'hidden';
                  }
                }catch(e){ input.style.overflowY = 'hidden'; }

                // Only write when height changed meaningfully to avoid churn
                try{
                  const cur = parseInt((input.style.height||'0').replace('px',''),10) || 0;
                  if (Math.abs(cur - targetH) > 1) {
                    input.style.height = targetH + 'px';
                    // Scroll the page by the same delta so each new row
                    // effectively pushes content upward by the same amount.
                    try{
                      const delta = targetH - cur;
                      if (delta > 0) {
                        const top = Math.round(delta);
                        window.scrollBy({ top: top, left: 0, behavior: 'auto' });
                      }
                    }catch(e){}
                  }
                }catch(e){}
              }catch(e){}
            });
          }catch(e){}
        };
        ['input','change','paste','cut','compositionend'].forEach(evt => w.input.addEventListener(evt, ()=>{
          // Enforce character cap on contenteditable
          try{
            if (w.input.contentEditable === 'true'){
              const cur = w.input.textContent || '';
              if (cur.length > MAX_QUERY_CHARS){
                w.input.textContent = cur.slice(0, MAX_QUERY_CHARS);
                // Move caret to end
                try{
                  const sel = window.getSelection();
                  const range = document.createRange();
                  const node = w.input.childNodes[0] || w.input;
                  range.setStart(node, Math.min(MAX_QUERY_CHARS, node.length || 0));
                  range.collapse(true);
                  sel.removeAllRanges(); sel.addRange(range);
                }catch(e){}
              }
            }
          }catch(e){}
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
        // kick off placeholder animation — start pre-filled so the page
        // loads with content immediately; delete phase runs first cycle.
        try{ startPhAnim(true); }catch(e){}

        
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
