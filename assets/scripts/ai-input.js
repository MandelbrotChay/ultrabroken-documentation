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

    const updateVisibility = ()=>{
      // minimal: placeholder handling is left to CSS or the client
    };

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
