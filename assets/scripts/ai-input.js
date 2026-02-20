// Isolated, mountable AI Searchbar module
// - Can render either a compact input (when mounted into the client's input container)
//   or a full standalone widget (when mounted into the page placeholder).
// - Exposes a small API: `getValue`, `setValue`, `focus`, `destroy`, `onAsk`.
// - Designed to be developed independently from the client; the client may
//   still instantiate this via `initAIInput(container)` and will receive the
//   returned API object.
(function(){
  const DEFAULT_WORKER_URL = 'https://ultrabroken-rag.gl1tchcr4vt.workers.dev';

  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=> e.setAttribute(k,v));
    (Array.isArray(children)?children:[children]).forEach(c=>{ if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if (c) e.appendChild(c); });
    return e;
  }

  function fetchAsk(q){
    const url = window.AI_WORKER_URL || localStorage.getItem('ai_worker_url') || DEFAULT_WORKER_URL;
    return fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ query: q }) })
      .then(async res => {
        if (!res.ok) {
          const text = await res.text().catch(()=>null);
          throw new Error(text || ('worker error '+res.status));
        }
        return res.json();
      });
  }

  function createCompact(container, opts={}){
    const root = (typeof container === 'string') ? document.querySelector(container) : container;
    if (!root) throw new Error('createCompact: container not found');
    const input = document.createElement('div');
    input.contentEditable = 'true';
    input.setAttribute('role','textbox');
    input.setAttribute('aria-multiline','true');
    input.className = 'ub-ai-input ub-ai-input--module';
    input.style.minHeight = '1.4rem';
    input.style.outline = 'none';
    input.style.width = '100%';
    root.appendChild(input);

    const hooks = { askHandlers: [] };

    function getValue(){ return (input.textContent || '').trim(); }
    function setValue(v){ input.textContent = v == null ? '' : String(v); }
    function focus(){ try{ input.focus(); }catch(e){} }
    function onAsk(cb){ if (typeof cb === 'function') hooks.askHandlers.push(cb); }
    function destroy(){ try{ if (input.parentNode) input.parentNode.removeChild(input); }catch(e){} }

    // submit on Enter (plain Enter => notify; Ctrl/Cmd+Enter => newline)
    input.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter'){
        if (ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          try{ document.execCommand('insertText', false, '\n'); }catch(e){}
        } else {
          ev.preventDefault();
          const q = getValue(); if (!q) return;
          hooks.askHandlers.forEach(h=>{ try{ h(q); }catch(e){ console.error(e); } });
        }
      }
    });

    return { input, getValue, setValue, focus, destroy, onAsk };
  }

  function createFull(container, opts={}){
    const placeholder = (typeof container === 'string') ? document.querySelector(container) : container;
    if (!placeholder) throw new Error('createFull: container not found');

    // Clear existing contents so module fully owns the placeholder.
    placeholder.innerHTML = '';

    const root = el('div', { class: 'ub-ai-root ub-ai-root--module' });
    const row = el('div', { style: 'display:flex; gap:0.4rem; align-items:flex-end;' });
    const inputWrap = el('div', { class: 'ub-ai-input-wrap', style: 'position:relative; flex:1; display:flex;' });
    const input = el('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', class: 'ub-ai-input ub-ai-input--module' }, '');
    input.style.minHeight = '1.4rem';
    input.style.width = '100%';
    inputWrap.appendChild(input);
    const clearBtn = el('button', { type: 'button', class: 'ub-ai-clear' }, 'Clear');
    const askBtn = el('button', { type: 'button', class: 'ub-ai-ask' }, 'Ask');
    const out = el('div', { class: 'ub-ai-out' }, '');
    const evidence = el('div', { class: 'ub-ai-evidence' }, '');

    row.appendChild(inputWrap);
    row.appendChild(clearBtn);
    row.appendChild(askBtn);
    root.appendChild(row);
    root.appendChild(out);
    root.appendChild(evidence);
    placeholder.appendChild(root);

    const hooks = { askHandlers: [] };

    function getValue(){ return (input.textContent || '').trim(); }
    function setValue(v){ input.textContent = v == null ? '' : String(v); }
    function focus(){ try{ input.focus(); }catch(e){} }
    function onAsk(cb){ if (typeof cb === 'function') hooks.askHandlers.push(cb); }
    function destroy(){ try{ if (placeholder.parentNode) placeholder.innerHTML = ''; }catch(e){} }

    askBtn.addEventListener('click', async ()=>{
      const q = getValue(); if (!q) return;
      hooks.askHandlers.forEach(h=>{ try{ h(q); }catch(e){ console.error(e); } });
      out.textContent = 'Thinking…';
      evidence.innerHTML = '';
      try{
        const r = await fetchAsk(q);
        out.textContent = r.response_text || r.answer || '';
        if (Array.isArray(r.sources) && r.sources.length){
          const ul = el('ul', { class: 'ub-ai-evidence-list' }, []);
          r.sources.forEach(s => { const li = el('li', {}, (s.title||s.path||'')); ul.appendChild(li); });
          evidence.appendChild(ul);
        }
      }catch(e){ out.textContent = 'Error: ' + String(e.message || e); }
    });

    clearBtn.addEventListener('click', ()=> setValue(''));

    // Enter handling similar to compact
    input.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter'){
        if (ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          try{ document.execCommand('insertText', false, '\n'); }catch(e){}
        } else {
          ev.preventDefault();
          askBtn.click();
        }
      }
    });

    return { input, getValue, setValue, focus, destroy, onAsk, out, evidence };
  }

  // Main initializer. Detect rendering target and choose compact vs full.
  function initAIInput(container, opts={}){
    const root = (typeof container === 'string') ? document.querySelector(container) : container;
    if (!root) throw new Error('initAIInput: container not found');

    // If mounted within a rendered client root, pick compact mode when
    // container is the client's `.ub-ai-module-container` or inside `inputWrap`.
    let node = root;
    const isInsideClientRoot = !!root.closest && !!root.closest('.ub-ai-root');
    const isModuleMount = root.classList && (root.classList.contains('ub-ai-module-container') || root.classList.contains('ub-ai-input-wrap') || root.classList.contains('ub-ai-input'));

    if (isModuleMount || isInsideClientRoot) {
      return createCompact(root, opts);
    }

    // Otherwise treat the provided container as the page placeholder and render full widget.
    return createFull(root, opts);
  }

  window.initAIInput = initAIInput;
})();
