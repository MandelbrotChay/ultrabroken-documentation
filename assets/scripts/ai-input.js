/*
  ai-input.js
  Self-contained input module extracted from the client's input logic.
  Focus: keep the visible contenteditable in view per keystroke on mobile
  by using an off-DOM measurement clone, deterministic height writes,
  visualViewport-aware caps, and a compensating page scroll delta.
*/
(
function(){
  try{ if (window && window.console && console.debug) console.debug('ai-input: script loaded'); }catch(e){}
  try{ window.__AI_INPUT_MODULE_LOADED = true; }catch(e){}
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> { try{ e.setAttribute(k,v); }catch(e){} });
    (Array.isArray(children)?children:[children]).forEach(c=>{ if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if (c) e.appendChild(c); });
    return e;
  }

  // Public initializer: returns a handle with the same shape the client expects
  window.initAIInput = function(container){
    try{ if (window && window.console && console.debug) console.debug('ai-input: initAIInput called', container && (container.id || container.tagName)); }catch(e){}
    if (!container) return null;

    const root = el('div', { class: 'ub-ai-root' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:flex-end;' });
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1; display:flex;' });
    const placeholderText = 'What is referred to as Wacko Boingo?';

    // visible contenteditable + hidden native textarea (native-first retrieval)
    const input = el('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'data-ub-placeholder': placeholderText, class: 'ub-ai-input' }, '');
    let nativeFallback = null;
    try{
      nativeFallback = el('textarea', { 'aria-hidden': 'true', tabindex: '-1', class: 'ub-ai-native-hidden' }, '');
      nativeFallback.style.position = 'absolute';
      nativeFallback.style.left = '-9999px';
      nativeFallback.style.top = '0';
      nativeFallback.style.width = '1px';
      nativeFallback.style.height = '1px';
      nativeFallback.style.opacity = '0';
      nativeFallback.style.pointerEvents = 'none';
    }catch(e){ nativeFallback = null; }

    // basic styles (inline to ensure predictable measurement)
    try{
      input.style.resize = 'none';
      input.style.overflow = 'hidden';
      input.style.overflowY = 'hidden';
      input.style.flex = '1 1 auto';
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      try{ input.setAttribute('wrap', 'soft'); }catch(e){}
      input.style.whiteSpace = 'pre-wrap';
      try{ input.style.overflowWrap = 'anywhere'; }catch(e){}
      try{ input.style.wordBreak = 'break-word'; }catch(e){}
      try{ input.style.display = 'block'; }catch(e){}
    }catch(e){}

    const out = el('div', { class: 'ub-ai-out' }, '');
    const evidenceWrap = el('div', { class: 'ub-ai-evidence' }, '');

    // Action buttons the client expects to find on the returned handle
    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear', 'aria-label': 'Clear search' }, '');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask', 'aria-label': 'Ask' }, '');
    const shareBtn = el('button', { type: 'button', class: 'ub-ai-share', 'aria-label': 'Share query' }, '');

    // fake overlay placeholder (click-through) so we can measure placeholder height and control display
    const fake = el('div', { class: 'ub-ai-fake-placeholder', 'aria-hidden': 'true' }, placeholderText);

    inputWrap.appendChild(input);
    try{ if (nativeFallback) inputWrap.appendChild(nativeFallback); }catch(e){}
    try{ inputWrap.appendChild(fake); }catch(e){}
    row.appendChild(inputWrap);
    // append action buttons as siblings so client code can wire them
    row.appendChild(clearBtn);
    row.appendChild(askBtn);
    row.appendChild(shareBtn);

    root.appendChild(row);
    root.appendChild(out);
    root.appendChild(evidenceWrap);
    container.appendChild(root);
    try { container.dataset.aiInput = 'module'; } catch (e) {}
    try{ if (window && window.console && console.debug) console.debug('ai-input: init created elements', { fake: !!fake, clear: !!clearBtn, ask: !!askBtn, share: !!shareBtn }); }catch(e){}

    // state
    const state = { _composing: false };

    // value accessors: prefer native textarea when present
    const getValue = ()=>{
      try{ if (nativeFallback && nativeFallback.value != null) return String(nativeFallback.value || ''); }catch(e){}
      try{ if (input && input.contentEditable === 'true') return String(input.textContent || ''); }catch(e){}
      try{ return String(input && input.value || ''); }catch(e){ return ''; }
    };
    const setValue = (v)=>{
      try{ if (nativeFallback) nativeFallback.value = v; }catch(e){}
      try{ if (input && input.contentEditable === 'true') { input.textContent = v; return; } }catch(e){}
      try{ if (input) input.value = v; }catch(e){}
    };

    // Off-DOM clone for accurate measurement
    let _clone = null;
    const ensureClone = ()=>{
      if (_clone) return _clone;
      _clone = document.createElement('div');
      _clone.style.position = 'absolute';
      _clone.style.visibility = 'hidden';
      _clone.style.pointerEvents = 'none';
      _clone.style.whiteSpace = 'pre-wrap';
      _clone.style.overflowWrap = 'anywhere';
      _clone.style.wordBreak = 'break-word';
      _clone.style.display = 'block';
      _clone.style.boxSizing = 'border-box';
      document.body.appendChild(_clone);
      return _clone;
    };

    const autosize = ()=>{
      try{
        const inputEl = input;
        if (!inputEl) return;
        const raw = (inputEl.contentEditable === 'true') ? String(inputEl.textContent || '') : String(inputEl.value || '');
        const clone = ensureClone();
        if (!clone) return;
        try{
          const cs = window.getComputedStyle(inputEl);
          const props = ['boxSizing','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','whiteSpace','wordBreak','overflowWrap','wordWrap','tabSize'];
          props.forEach(p=>{ try{ clone.style[p] = cs[p]; }catch(e){} });
          try{ const rect = inputEl.getBoundingClientRect(); clone.style.width = Math.max(10, Math.round(rect.width)) + 'px'; }catch(e){}
        }catch(e){}
        try{ clone.textContent = raw || ''; }catch(e){ try{ clone.value = raw || ''; }catch(e){} }
        clone.style.height = 'auto';
        const measured = clone.scrollHeight || 0;
        let targetH = Math.max(12, Math.round(measured));

        // visualViewport-aware handling
        try{
          const isFocused = (document.activeElement === inputEl);
          if (window.visualViewport) {
            const rect = inputEl.getBoundingClientRect();
            const vv = window.visualViewport;
            const margin = 8;
            let available = Math.round(vv.height - rect.top - margin);
            if (isFocused && available > 0 && targetH > available) {
              try{ inputEl.scrollIntoView({ block: 'center', inline: 'nearest' }); }catch(e){}
              requestAnimationFrame(()=>{
                try{
                  const rect2 = inputEl.getBoundingClientRect();
                  const vv2 = window.visualViewport || vv;
                  available = Math.round((vv2.height || vv.height) - rect2.top - margin);
                  inputEl.style.overflowY = 'hidden';
                  try{ inputEl.style.height = targetH + 'px'; }catch(e){}
                }catch(e){}
              });
            } else {
              if (available > 0 && targetH > available) {
                targetH = Math.max(12, available);
                inputEl.style.overflowY = 'auto';
              } else {
                inputEl.style.overflowY = 'hidden';
              }
            }
          } else {
            inputEl.style.overflowY = 'hidden';
          }
        }catch(e){ inputEl.style.overflowY = 'hidden'; }

        // write height and scroll page by delta to keep caret visible
        try{
          const cur = parseInt((inputEl.style.height||'0').replace('px',''),10) || 0;
          if (Math.abs(cur - targetH) > 1) {
            inputEl.style.height = targetH + 'px';
            try{
              const delta = targetH - cur;
              if (delta > 0) {
                window.scrollBy({ top: Math.round(delta), left: 0, behavior: 'auto' });
              }
            }catch(e){}
          }
        }catch(e){}
      }catch(e){}
    };

    // Placeholder rotation and visibility handling (cloned from client)
    let _placeholders = null;
    let _lastPlaceholderIndex = -1;
    let _placeholderTimer = null;
    let placeholderHeight = 0;

    const applyPlaceholder = (txt)=>{
      try{
        if (!txt) return;
        if (document.activeElement === input) return;
        input.setAttribute('data-ub-placeholder', txt);
        const curVal = String(getValue() || '');
        if (fake && !curVal && document.activeElement !== input) {
          fake.textContent = txt;
        }
        // Measure placeholder height synchronously using a hidden clone
        try{
          if (input && !curVal) {
            const c = document.createElement('div');
            c.removeAttribute && c.removeAttribute('id');
            c.style.position = 'absolute';
            c.style.visibility = 'hidden';
            c.style.pointerEvents = 'none';
            c.style.zIndex = '-9999';
            c.style.left = '-9999px';
            c.style.top = '0';
            c.style.height = 'auto';
            c.style.whiteSpace = 'pre-wrap';
            try{
              const cs = window.getComputedStyle(input);
              const props = ['boxSizing','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','whiteSpace','wordBreak','overflowWrap','wordWrap','tabSize'];
              props.forEach(p=>{ try{ c.style[p] = cs[p]; }catch(e){} });
              try{ const rect = input.getBoundingClientRect(); c.style.width = Math.max(10, Math.round(rect.width)) + 'px'; }catch(e){}
            }catch(e){}
            try{ c.textContent = txt; }catch(e){ try{ c.value = txt; }catch(e){} }
            document.body.appendChild(c);
            const measured = c.scrollHeight || 0;
            document.body.removeChild(c);
            const h = Math.max(12, Math.round(measured));
            placeholderHeight = h;
            try{ input.style.height = h + 'px'; }catch(e){}
          }
        }catch(e){}
      }catch(e){}
    };

    // Load rotating placeholders from JSON and cycle every 4s.
    (async ()=>{
      try{
        const url = '/ultrabroken-documentation/assets/scripts/placeholders.json';
        const res = await fetch(url);
        if (!res.ok) return;
        const arr = await res.json();
        if (!Array.isArray(arr) || arr.length === 0) return;
        _placeholders = arr.map(String);
        _lastPlaceholderIndex = -1;
        try{
          if (Array.isArray(_placeholders) && _placeholders.length) {
            let idx = Math.floor(Math.random() * _placeholders.length);
            if (_placeholders.length > 1) {
              while (idx === _lastPlaceholderIndex) idx = Math.floor(Math.random() * _placeholders.length);
            }
            _lastPlaceholderIndex = idx;
            applyPlaceholder(_placeholders[idx]);
          }
        }catch(e){}

        _placeholderTimer = setInterval(()=>{
          try{
            if (document.activeElement === input) return;
            if (!Array.isArray(_placeholders) || !_placeholders.length) return;
            let idx = Math.floor(Math.random() * _placeholders.length);
            if (_placeholders.length > 1) {
              let attempts = 0;
              while (idx === _lastPlaceholderIndex && attempts < 6) { idx = Math.floor(Math.random() * _placeholders.length); attempts++; }
            }
            _lastPlaceholderIndex = idx;
            applyPlaceholder(_placeholders[idx]);
          }catch(e){}
        }, 4000);
      }catch(e){}
    })();

    // Helper: immediately collapse the input to a conservative single-line visual height
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

    // Wire clear/ask/share UI + icon placeholders
    try{
      // Ensure clear button exists
      if (clearBtn){
        const clearImg = document.createElement('img');
        clearImg.src = '/ultrabroken-documentation/assets/images/cancel-icon.svg';
        clearImg.alt = 'Clear';
        clearBtn.style.display = 'none';
        clearBtn.appendChild(clearImg);
        clearBtn.addEventListener('click', ()=>{
          try{ setValue(''); }catch(e){}
          try{ if (out) { out.textContent = ''; out.innerHTML = ''; } }catch(e){}
          try{ if (evidenceWrap) evidenceWrap.innerHTML = ''; }catch(e){}
          try{ input.focus(); }catch(e){}
          try{ collapseToSingleLine(input); }catch(e){}
          try{ autosize(); }catch(e){}
          try{ updateVisibility(); }catch(e){ clearBtn.style.display = 'none'; if (askBtn) askBtn.style.display = 'none'; }
        });
      }

      // Ask / share icons
      const askImg = document.createElement('img');
      askImg.src = '/ultrabroken-documentation/assets/images/ask-icon.svg';
      askImg.alt = 'Ask';
      if (askBtn) {
        askBtn.textContent = '';
        askBtn.appendChild(askImg);
        try{ askBtn.style.display = 'none'; }catch(e){}
        if (shareBtn) try{ shareBtn.style.display = 'none'; }catch(e){}
      }
      if (shareBtn) {
        try {
          const shareImg = document.createElement('img');
          shareImg.src = '/ultrabroken-documentation/assets/images/share-icon.svg';
          shareImg.alt = 'Share';
          shareBtn.textContent = '';
          shareBtn.appendChild(shareImg);
          shareBtn.style.display = 'none';
          shareBtn.addEventListener('click', ()=>{
            try{
              const q = String(getValue() || '').trim();
              if (!q) return;
              navigator.clipboard.writeText(q).then(()=>{}).catch(()=>{});
            }catch(e){}
          });
        }catch(e){}
      }
    }catch(e){}

    // Shared resizing function to make icons match the Ask button visual height
    const resizeIcons = ()=>{
      try{
        if (!askBtn) return;
        const btnRect = askBtn.getBoundingClientRect();
        let targetH = 0;
        if (btnRect && btnRect.height > 0) targetH = Math.round(btnRect.height);
        else targetH = Math.round(parseFloat(getComputedStyle(askBtn).fontSize) || 16);
        targetH = Math.max(12, targetH);
      }catch(e){}
    };

    // Toggle visibility for controls based on input content
    const updateVisibility = ()=>{
      const has = String(getValue() || '').trim();
      try{ clearBtn.style.display = has ? 'flex' : 'none'; }catch(e){}
      try{ askBtn.style.display = has ? 'flex' : 'none'; }catch(e){}
      try{ shareBtn.style.display = has ? 'flex' : 'none'; }catch(e){}
      try{
        if (fake) {
          const showFake = !has && document.activeElement !== input;
          fake.style.display = showFake ? 'block' : 'none';
        }
      }catch(e){}
      setTimeout(resizeIcons, 0);
    };

    // Focus / blur placeholder behavior
    try{
      input.addEventListener('focus', ()=>{
        try{
          const cur = String(getValue() || '');
          if (cur && String(cur).trim()) return;
          try{ if (fake) fake.style.display = 'none'; }catch(e){}
          try{ setValue(''); }catch(e){}
          try{ collapseToSingleLine(input); }catch(e){}
          try{ autosize(); }catch(e){}
          try{ updateVisibility(); }catch(e){}
        }catch(e){}
      });

      input.addEventListener('blur', ()=>{
        try{
          const cur = String(getValue() || '');
          if (!cur) {
            try{ if (fake) fake.style.display = 'block'; }catch(e){}
            try{ if (placeholderHeight) input.style.height = placeholderHeight + 'px'; }catch(e){}
          }
        }catch(e){}
      });

      // Initial placeholder display state
      try{
        const cur = String(getValue() || '');
        if (document.activeElement !== input && !cur) {
          try{ if (fake) fake.style.display = 'block'; }catch(e){}
        } else {
          try{ if (fake) fake.style.display = 'none'; }catch(e){}
        }
      }catch(e){}

      // Measure placeholder height on next rAF
      try{
        requestAnimationFrame(()=>{
          try{
            const el0 = input;
            try{
              const curVal = String(getValue() || '');
              if (el0 && !curVal && placeholderText) {
                if (el0.contentEditable === 'true') {
                  const prevText = el0.textContent;
                  try{ el0.textContent = placeholderText; }catch(e){}
                  const h = el0.scrollHeight;
                  try{ el0.textContent = prevText; }catch(e){}
                  if (h && !isNaN(h)) placeholderHeight = Math.max(12, Math.round(h));
                } else {
                  const prevVal = el0.value;
                  const prevRows = el0.rows;
                  const s0 = el0.selectionStart; const s1 = el0.selectionEnd;
                  try{ el0.value = placeholderText; el0.rows = 1; }catch(e){}
                  const h = el0.scrollHeight;
                  try{ el0.value = prevVal; el0.rows = prevRows; }catch(e){}
                  try{ if (typeof el0.setSelectionRange === 'function') el0.setSelectionRange(s0, s1); }catch(e){}
                  if (h && !isNaN(h)) placeholderHeight = Math.max(12, Math.round(h));
                }
              }
            }catch(e){}
          }catch(e){}
        });
      }catch(e){}
    }catch(e){}

    // initial sizing
    try{ autosize(); }catch(e){}
    // initial sizing and keep in sync with resizes
    resizeIcons();
    window.addEventListener('resize', resizeIcons);
    // initial state
    updateVisibility();

    // keep native textarea in sync on microtask so other code reading .value works
    ['input','paste','cut','change'].forEach(evt => input.addEventListener(evt, ()=>{
      try{ if (nativeFallback) Promise.resolve().then(()=>{ try{ nativeFallback.value = (input && input.contentEditable === 'true') ? String(input.textContent||'') : (input.value||''); }catch(e){} }); }catch(e){}
      try{ updateVisibility(); }catch(e){}
      try{ requestAnimationFrame(()=>{ try{ autosize(); }catch(e){} }); }catch(e){}
    }));

    input.addEventListener('compositionstart', ()=>{ state._composing = true; });
    input.addEventListener('compositionend', ()=>{ state._composing = false; try{ if (nativeFallback) nativeFallback.value = getValue(); }catch(e){}; updateVisibility(); autosize(); });

    // per-keystroke autosize: helps on some mobile browsers
    input.addEventListener('keydown', (ev)=>{
      try{
        if (state._composing) return;
        try{ requestAnimationFrame(()=>{ try{ autosize(); }catch(e){} }); }catch(e){}
      }catch(e){}
    });

    // Enter handling: submit vs newline insertion is left to the client; keep simple newline handling for Ctrl+Enter
    input.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter'){
        if (ev.ctrlKey || ev.metaKey){
          ev.preventDefault();
          try{
            const sel = window.getSelection();
            if (sel && sel.rangeCount){
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const node = document.createTextNode('\n');
              range.insertNode(node);
              range.setStartAfter(node);
              range.collapse(true);
              sel.removeAllRanges(); sel.addRange(range);
            }
          }catch(e){}
          try{ autosize(); }catch(e){}
          try{ updateVisibility(); }catch(e){}
        } else {
          // default: blur so client can read value and submit
          ev.preventDefault();
          try{ input.blur(); }catch(e){}
          try{ if (nativeFallback) nativeFallback.value = getValue(); }catch(e){}
          try{ updateVisibility(); }catch(e){}
        }
      }
    });

    try{ if (nativeFallback) { try{ nativeFallback.value = getValue(); }catch(e){} } }catch(e){}
    requestAnimationFrame(()=>{ try{ autosize(); updateVisibility(); }catch(e){} });

    const handle = { input, inputWrap, native: nativeFallback, out, evidence: evidenceWrap };
    handle.getValue = getValue;
    handle.setValue = setValue;
    handle.autosize = autosize;
    handle.updateVisibility = updateVisibility;
    handle._state = state;
    return handle;
  };

})();
