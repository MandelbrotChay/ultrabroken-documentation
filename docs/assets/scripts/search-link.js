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

  // Immediately neutralize .search-link anchors so they can't trigger navigation
  function neutralizeSearchLinkAnchors() {
    try {
      document.querySelectorAll('.search-link').forEach(a => {
        try {
          if (a.tagName && a.tagName.toLowerCase() === 'a') {
            a.setAttribute('href', 'javascript:void(0)');
            a.setAttribute('role', 'button');
            if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
            a.style.cursor = 'pointer';
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  // Replace anchor .search-link elements with non-navigating buttons to fully avoid
  // any browser navigation or other handlers attached to anchors.
  function replaceAnchorsWithButtons() {
    try {
      document.querySelectorAll('a.search-link').forEach(a => {
        try {
          const btn = document.createElement('button');
          btn.type = 'button';
          // copy class
          btn.className = a.className;
          // copy dataset
          for (const key in a.dataset) {
            try { btn.dataset[key] = a.dataset[key]; } catch (e) {}
          }
          // copy innerHTML so markup is preserved
          btn.innerHTML = a.innerHTML;
          // preserve ARIA/title
          try { if (a.title) btn.title = a.title; } catch (e) {}
          try { if (a.getAttribute('aria-label')) btn.setAttribute('aria-label', a.getAttribute('aria-label')); } catch (e) {}
          // set same styling cursor
          btn.style.cursor = 'pointer';
          a.replaceWith(btn);
        } catch (e) {}
      });
    } catch (e) {}
  }

  // Neutralize and replace anchors immediately so they cannot navigate
  try { neutralizeSearchLinkAnchors(); } catch (e) {}
  try { replaceAnchorsWithButtons(); } catch (e) {}

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

  // Intercept custom search: links like [Label](search:Term)
  function interceptSearchHrefLinks() {
    document.body.addEventListener('click', function (ev) {
      const a = ev.target.closest && ev.target.closest('a[href^="search:"]');
      if (!a) return;
      ev.preventDefault();
      try { ev.stopPropagation(); } catch (e) {}
      try { ev.stopImmediatePropagation(); } catch (e) {}
      try { a.blur(); } catch (e) {}
      const raw = (a.getAttribute('href') || '').slice('search:'.length);
      try { raw; } catch (e) {}
      let q = '';
      try { q = decodeURIComponent(raw).replace(/^\/+/, '').trim(); } catch (e) { q = raw.replace(/^\/+/, '').trim(); }
      if (!q) return;

      openSearchUI();

      const start = Date.now();
      const timeout = 1200; // ms
      const interval = 40; // ms

      const waiter = setInterval(function () {
        const input = findSearchInput();
        if (input) {
          clearInterval(waiter);
          setSearchQueryAndSubmit(input, q);
          return;
        }
        if (Date.now() - start > timeout) {
          clearInterval(waiter);
          setSearchQuery(q);
        }
      }, interval);
    }, true);

    document.body.addEventListener('pointerdown', function (ev) {
      const a = ev.target.closest && ev.target.closest('a[href^="search:"]');
      if (!a) return;
      try { ev.preventDefault(); } catch (e) {}
      try { ev.stopPropagation(); } catch (e) {}
      try { ev.stopImmediatePropagation(); } catch (e) {}
    }, true);
  }

  try { interceptSearchHrefLinks(); } catch (e) {}

  // Make entire task-list item clickable to toggle its checkbox.
  // Allows clicking the text to toggle the checkbox and supports keyboard (Space/Enter).
  function enhanceTasklistClickable() {
    try {
      // Click handler (capture) to run early and avoid interfering with inner interactive elements
      document.body.addEventListener('click', function (ev) {
        const li = ev.target.closest && ev.target.closest('li.task-list-item, li.task-list');
        if (!li) return;
        // If the click target is an interactive element, skip (allow native behavior)
        const interactive = ev.target.closest && ev.target.closest('a, button, input, textarea, select, label');
        if (interactive && interactive !== li) return;

        const checkbox = li.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        if (checkbox.disabled) return;

        ev.preventDefault();
        ev.stopPropagation();

        // Toggle and emit events so other listeners react
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }, true);

      // Keyboard handling removed — click-only behavior is desired.
    } catch (e) {}
  }

  try { enhanceTasklistClickable(); } catch (e) {}

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

    // diagnostic wrapper removed

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
  }, true);

  // Also intercept pointerdown (capture) to prevent other handlers that react on mousedown
  document.body.addEventListener('pointerdown', function (ev) {
    const a = ev.target.closest && ev.target.closest('.search-link');
    if (!a) return;
    try { ev.preventDefault(); } catch (e) {}
    try { ev.stopPropagation(); } catch (e) {}
    try { ev.stopImmediatePropagation(); } catch (e) {}
  }, true);
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
    // Only set the input value and dispatch input/change events.
    // Do NOT submit forms or click submit buttons — that causes navigation on some builds.
    try {
      const val = (input.value || '').trim();
      if (!val) return;
      // ensure reactive listeners are triggered
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // small extra pulse for frameworks that debounce
      setTimeout(() => { try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} }, 50);
    } catch (e) {}
  } catch (e) {}
}
