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

  document.body.addEventListener('click', function (ev) {
    const a = ev.target.closest && ev.target.closest('.search-link');
    if (!a) return;
    ev.preventDefault();
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

  // Simulate a keyup for Enter so search UIs that listen for Enter will run
  try {
    const down = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
    const up = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
    input.dispatchEvent(down);
    input.dispatchEvent(up);
  } catch (e) {}

  // Also dispatch a synthetic input event after a short delay to cover some implementations
  setTimeout(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, 50);
}
