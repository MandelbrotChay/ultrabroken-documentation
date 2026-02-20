/*
  Extracted input UI (baseline from commit a31b06...) adapted into a
  self-contained module. This restores native-first behavior and the
  original visible/native interplay so we can iterate from the earlier
  working baseline.
*/
(function(){
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> { try{ e.setAttribute(k,v); }catch(e){} });
    (Array.isArray(children)?children:[children]).forEach(c=>{ if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if (c) e.appendChild(c); });
    return e;
  }

  window.initAIInput = function(container){
    if (!container) return null;
    const root = el('div', { class: 'ub-ai-root' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:flex-end;' });
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1; display:flex;' });
    const _placeholder_text = 'What is referred to as Wacko Boingo?';
    const MAX_QUERY_CHARS = (typeof window !== 'undefined' && window.AI_MAX_QUERY_CHARS) ? Number(window.AI_MAX_QUERY_CHARS) : 50;
    const useFaux = true;
    let input;
    let nativeFallback = null;
    if (useFaux) {
      // Visible contenteditable (UX-first) but keep native as authoritative
      input = el('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input' }, '');
      try{
        nativeFallback = el('textarea', { 'aria-hidden': 'true', tabindex: '-1', class: 'ub-ai-native-hidden' }, '');
        // visually hide but keep in DOM for reliable value/IME behavior
        nativeFallback.style.position = 'absolute';
        nativeFallback.style.left = '-9999px';
        nativeFallback.style.top = '0';
        nativeFallback.style.width = '1px';
        nativeFallback.style.height = '1px';
        nativeFallback.style.opacity = '0';
        nativeFallback.style.pointerEvents = 'none';
      }catch(e){ nativeFallback = null; }
    } else {
      input = el('textarea', { placeholder: '', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input', maxlength: String(MAX_QUERY_CHARS), rows: '1' });
    }

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

    // baseline: no action buttons in the original commit
    const out = el('div', { class: 'ub-ai-out' }, '');
    const evidenceWrap = el('div', { class: 'ub-ai-evidence' }, '');
    inputWrap.appendChild(input);
    try{ if (nativeFallback) inputWrap.appendChild(nativeFallback); }catch(e){}

    row.appendChild(inputWrap);
    root.appendChild(row);
    root.appendChild(out);
    root.appendChild(evidenceWrap);
    container.appendChild(root);
    try { container.dataset.aiInput = 'module'; } catch (e) {}

    // state
    const state = { _composing: false };

    const normalize = (v)=>{ if (v == null) return ''; try{ return String(v).replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim(); }catch(e){ return String(v||'').trim(); } };

    // Native-first value retrieval (matches older behavior)
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

    // simple off-DOM clone based autosize (baseline)
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
    const measureHeightForText = (text)=>{
      try{
        const clone = ensureClone();
        const cs = getComputedStyle(input);
        clone.style.font = cs.font || (cs.fontSize + ' ' + cs.fontFamily);
        try{ clone.style.padding = cs.padding; }catch(e){}
        clone.style.width = cs.width || (input.offsetWidth ? (input.offsetWidth + 'px') : '100%');
        clone.textContent = (typeof text === 'string' ? text : getValue()) || '';
        return Math.max(12, Math.ceil(clone.scrollHeight));
      }catch(e){ return null; }
    };
    const autosize = ()=>{
      try{
        const raw = getValue();
        const targetH = measureHeightForText(raw);
        if (typeof targetH === 'number') input.style.height = targetH + 'px';
      }catch(e){}
    };

    // visibility helpers
    const updateVisibility = ()=>{};

    // events
    // keep native in sync on microtask so old code paths that read native still work
    ['input','paste','cut','change'].forEach(evt => input.addEventListener(evt, ()=>{
      try{ if (nativeFallback) Promise.resolve().then(()=>{ try{ nativeFallback.value = (input && input.contentEditable === 'true') ? String(input.textContent||'') : (input.value||''); }catch(e){} }); }catch(e){}
      try{ updateVisibility(); }catch(e){}
      try{ requestAnimationFrame(()=>{ try{ autosize(); }catch(e){} }); }catch(e){}
    }));

    input.addEventListener('compositionstart', ()=>{ state._composing = true; });
    input.addEventListener('compositionend', ()=>{ state._composing = false; try{ if (nativeFallback) nativeFallback.value = getValue(); }catch(e){}; updateVisibility(); autosize(); });

    // Enter behavior: submit on Enter, Ctrl+Enter inserts newline
    input.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter'){
        if (ev.ctrlKey || ev.metaKey){
          ev.preventDefault();
          if (input && input.contentEditable === 'true'){
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
            try{
              const el = input;
              const start = el.selectionStart || 0;
              const end = el.selectionEnd || 0;
              const v = el.value || '';
              el.value = v.slice(0, start) + '\n' + v.slice(end);
              const pos = start + 1;
              el.selectionStart = el.selectionEnd = pos;
              try{ autosize(); }catch(e){}
              try{ updateVisibility(); }catch(e){}
            }catch(e){}
          }
        } else {
          ev.preventDefault();
          // let the client wire the ask button; just blur to trigger sync
          try{ if (input && input.contentEditable === 'true') input.blur(); }catch(e){}
          try{ if (nativeFallback) nativeFallback.value = getValue(); }catch(e){}
          try{ updateVisibility(); }catch(e){}
        }
      }
    });

    try{ if (nativeFallback) { try{ nativeFallback.value = getValue(); }catch(e){} } }catch(e){}
    requestAnimationFrame(()=>{ try{ autosize(); updateVisibility(); }catch(e){} });

    // expose handle matching ai-worker-client expectations (no buttons)
    const handle = { input, inputWrap, native: nativeFallback, out, evidence: evidenceWrap };
    handle.getValue = getValue;
    handle.setValue = setValue;
    handle.autosize = autosize;
    handle.updateVisibility = updateVisibility;
    handle._state = state;
    return handle;
  };

})();
