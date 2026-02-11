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
    // try common search buttons
    const btnSelectors = [
      '[aria-label="Search"]',
      '.md-icon--search',
      '.md-header-nav__link--search',
      '.md-search--button',
      '.md-header-search__button',
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

  document.body.addEventListener('click', function (ev) {
    const a = ev.target.closest && ev.target.closest('.search-link');
    if (!a) return;
    ev.preventDefault();
    const q = (a.dataset && a.dataset.query) ? a.dataset.query : (a.textContent || '').trim();
    if (!q) return;

    // Try to open search UI first (for Material modal/overlay)
    openSearchUI();

    // allow a short delay for UI to open
    setTimeout(function () {
      const ok = setSearchQuery(q);
      if (!ok) {
        // fallback: try appending ?q= to current URL (some themes respect search query param)
        const href = location.pathname + '?q=' + encodeURIComponent(q);
        try { history.pushState(null, '', href); } catch (e) {}
      }
    }, 120);
  }, false);
});
