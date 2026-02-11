document.addEventListener('DOMContentLoaded', function () {
  function findSearchInput() {
    const selectors = [
      '.md-search__input',
      'input.md-search__input',
      'input[type="search"].md-search__input',
      'input[type="search"]',
      '.md-header-search input',
      '.md-search input',
      '#search-input',
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function openSearchUI() {
    // try common search buttons/selectors used by Material and other themes
    const btnSelectors = [
      '[aria-label="Search"]',
      '.md-icon--search',
      '.md-header-nav__link--search',
      '.md-search--button',
      '.md-header-search__button',
      '.md-top-nav__search',
      '.md-header__search',
    ];
    for (const s of btnSelectors) {
      const b = document.querySelector(s);
      if (b) {
        try { b.click(); } catch (e) {}
        // stop at first
        return;
      }
    }
  }

  function setSearchQuery(q) {
    const input = findSearchInput();
    if (!input) return false;
    try {
      input.focus({preventScroll: true});
      // set value and emit events so MkDocs / Material / Lunr react
      input.value = q;
      const ev = new Event('input', { bubbles: true });
      input.dispatchEvent(ev);
      const change = new Event('change', { bubbles: true });
      input.dispatchEvent(change);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Use capture phase so this handler runs before other click handlers that may close the search UI.
  document.body.addEventListener('click', function (ev) {
    const a = ev.target.closest && ev.target.closest('.search-link');
    if (!a) return;
    // Prevent default navigation and stop other handlers that may close the search UI.
    ev.preventDefault();
    try { ev.stopPropagation(); } catch (e) {}
    try { ev.stopImmediatePropagation(); } catch (e) {}
    try { a.blur(); } catch (e) {}
    try { a.setAttribute('href', 'javascript:void(0)'); } catch (e) {}
    const q = (a.dataset && a.dataset.query) ? a.dataset.query : (a.textContent || '').trim();
    if (!q) return;

    // Try to open search UI first (for Material modal/overlay)
    openSearchUI();

    // Wait for the search input to appear (the UI may render it asynchronously)
    const start = Date.now();
    const timeout = 1200; // ms
    const interval = 40; // ms

    const waiter = setInterval(function () {
      const input = findSearchInput();
      if (input) {
        clearInterval(waiter);
        // set the query and dispatch events
        setSearchQueryAndSubmit(input, q);
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(waiter);
        // last resort: try to set any input if present
        setSearchQuery(q);
      }
    }, interval);
  }, false);
});

function setSearchQueryAndSubmit(input, q) {
  try {
    input.focus({preventScroll: true});
  } catch (e) {}
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // Avoid simulating Enter: other scripts intentionally block Enter.
  // Instead try to submit via form or click a submit button so the search UI handles it.
  try {
    const val = (input.value || '').trim();
    if (!val) return;

    // 1) If input is inside a form, try to click a submit button or submit the form
    const form = input.closest && input.closest('form');
    if (form) {
      const submit = form.querySelector('button[type="submit"], input[type="submit"], .md-search__submit, .md-search__button');
      if (submit) {
        try { submit.click(); return; } catch (e) {}
      }
      try {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } catch (e) {}
      try { if (typeof form.submit === 'function') { form.submit(); return; } } catch (e) {}
    }

    // 2) Try global/nearby submit buttons that some themes expose
    const globalSubmitSelectors = [
      'button.md-search__button[type="submit"]',
      '.md-search__submit',
      'button[type="submit"]',
      '.md-search--submit',
      '.md-search__button',
    ];
    for (const s of globalSubmitSelectors) {
      const btn = document.querySelector(s);
      if (btn) {
        try { btn.click(); return; } catch (e) {}
      }
    }

    // 3) Dispatch a native 'search' event (some implementations listen for it)
    try { input.dispatchEvent(new Event('search', { bubbles: true })); } catch (e) {}

    // 4) As a final fallback, re-dispatch input after a short delay to encourage reactive listeners
    setTimeout(() => { try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} }, 50);
    // Do not modify the URL; search UIs typically react to input events internally.
  } catch (e) {}
}
