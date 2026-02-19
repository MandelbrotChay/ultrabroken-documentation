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
    row.appendChild(inputWrap);
    row.appendChild(clearBtn);
    row.appendChild(askBtn);
    row.appendChild(shareBtn);
    root.appendChild(row);
    root.appendChild(out);
    root.appendChild(evidenceWrap);
    container.appendChild(root);

    // expose minimal API compatible with existing client code
    return { input, inputWrap, native: nativeFallback, btn: askBtn, share: shareBtn, out, clear: clearBtn, evidence: evidenceWrap };
  };

});
