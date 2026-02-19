/*
  Self-contained AI input module.
  Exposes `window.initAIInput(container)` which creates the input UI and
  returns the widget handle matching the shape expected by `ai-worker-client.js`.
*/
(function(){
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> e.setAttribute(k,v));
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
      input = el('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'data-ub-placeholder': _placeholder_text, class: 'ub-ai-input' }, '');
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

    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear', 'aria-label': 'Clear search' }, '');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask', 'aria-label': 'Ask' }, '');
    const shareBtn = el('button', { type: 'button', class: 'ub-ai-share', 'aria-label': 'Share query' }, '');
    const out = el('div', { class: 'ub-ai-out' }, '');
    const evidenceWrap = el('div', { class: 'ub-ai-evidence' }, '');
    inputWrap.appendChild(input);
    try{ if (nativeFallback) inputWrap.appendChild(nativeFallback); }catch(e){}
    // placeholder overlay (click-through)
    const fake = el('div', { class: 'ub-ai-fake-placeholder', 'aria-hidden': 'true' }, input.getAttribute('data-ub-placeholder') || _placeholder_text);
    try{ inputWrap.appendChild(fake); }catch(e){}
    row.appendChild(inputWrap);
    row.appendChild(clearBtn);
    row.appendChild(askBtn);
    row.appendChild(shareBtn);
    root.appendChild(row);
    root.appendChild(out);
    root.appendChild(evidenceWrap);
    container.appendChild(root);

    // State machine
    const state = { _focused: false, _composing: false, _wasBlurredEmpty: false, _placeholderMeasuredHeight: null };

    const normalize = (v)=>{
      if (v == null) return '';
      try{
        let s = String(v);
        s = s.replace(/[\u200B\u200C\u200D\uFEFF]/g,'');
        s = s.replace(/\u00A0/g,' ');
        s = s.replace(/\s+/g,' ').trim();
        return s;
      }catch(e){ return String(v||'').trim(); }
    };

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

    // off-DOM clone for measurement
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
      _clone.style.boxSizing = 'border-box';
      document.body.appendChild(_clone);
      return _clone;
    };
    const measureHeightForText = (text)=>{
      try{
        const clone = ensureClone();
        const cs = getComputedStyle(input);
        clone.style.font = cs.font || (cs.fontSize + ' ' + cs.fontFamily);
        clone.style.padding = cs.padding;
        clone.style.width = cs.width;
        clone.style.lineHeight = cs.lineHeight;
        clone.style.letterSpacing = cs.letterSpacing;
        clone.style.whiteSpace = cs.whiteSpace || 'pre-wrap';
        clone.textContent = text || '';
        return Math.max(12, Math.ceil(clone.scrollHeight));
      }catch(e){ return null; }
    };

    const updateVisibility = ()=>{
      try{
        const raw = getValue();
        const norm = normalize(raw);
        const has = Boolean(norm);
        try{ clearBtn.style.display = has ? 'flex' : 'none'; }catch(e){}
        try{ askBtn.style.display = has ? 'flex' : 'none'; }catch(e){}
        try{ shareBtn.style.display = has ? 'flex' : 'none'; }catch(e){}
        try{ const showFake = !state._focused && state._wasBlurredEmpty && !has; fake.style.display = showFake ? 'block' : 'none'; }catch(e){}
      }catch(e){}
    };

    const autosize = ()=>{
      try{
        const raw = getValue();
        const targetH = measureHeightForText(raw);
        if (typeof targetH === 'number') input.style.height = targetH + 'px';
      }catch(e){}
    };

    input.addEventListener('focus', ()=>{
      state._focused = true;
      try{ fake.style.display = 'none'; }catch(e){}
    });
    input.addEventListener('blur', ()=>{
      state._focused = false;
      const raw = getValue();
      const norm = normalize(raw);
      state._wasBlurredEmpty = (norm === '');
      if (state._wasBlurredEmpty) {
        state._placeholderMeasuredHeight = measureHeightForText(fake.textContent || input.getAttribute('data-ub-placeholder') || '');
        if (state._placeholderMeasuredHeight) input.style.height = state._placeholderMeasuredHeight + 'px';
      }
      updateVisibility();
    });

    input.addEventListener('compositionstart', ()=>{ state._composing = true; });
    input.addEventListener('compositionend', ()=>{ state._composing = false; try{ if (nativeFallback) nativeFallback.value = getValue(); }catch(e){}; updateVisibility(); autosize(); });

    ['input','paste','cut','change'].forEach(evt => input.addEventListener(evt, ()=>{
      try{ if (nativeFallback) nativeFallback.value = getValue(); }catch(e){}
      if (state._composing) return;
      updateVisibility();
      requestAnimationFrame(()=>{ try{ autosize(); }catch(e){} });
    }));

    try{ if (nativeFallback) nativeFallback.value = getValue(); }catch(e){}
    requestAnimationFrame(()=>{ try{ autosize(); updateVisibility(); }catch(e){} });

    // expose minimal API compatible with existing client code
    const handle = { input, inputWrap, native: nativeFallback, btn: askBtn, share: shareBtn, out, clear: clearBtn, evidence: evidenceWrap };
    handle.getValue = getValue;
    handle.setValue = setValue;
    handle._state = state;
    handle.autosize = autosize;
    handle.updateVisibility = updateVisibility;
    return handle;
  };

});
