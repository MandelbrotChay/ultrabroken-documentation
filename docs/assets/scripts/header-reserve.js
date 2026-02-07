document.addEventListener('DOMContentLoaded', function () {
  const header = document.querySelector('.md-header');
  if (!header) return;

  const title = header.querySelector('.md-header__title');
  if (!title) return;

  function updateReserve() {
    const headerRect = header.getBoundingClientRect();

    // Target common header control selectors so we only measure true controls
    const selectors = [
      '.md-header__button',
      'label.md-header__button',
      '.md-search',
      '.md-search__icon',
      '.md-tabs',
      '.md-header-nav',
      '.md-logo',
      '.md-header__logo'
    ];
    const candidates = selectors
      .map(sel => Array.from(header.querySelectorAll(sel)))
      .reduce((a, b) => a.concat(b), [])
      .filter(el => !!el.getBoundingClientRect);

    const visible = candidates
      .filter(el => !el.classList.contains('md-logo') && !el.closest('.md-header__title'))
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0 && r.right > headerRect.left);

    if (visible.length === 0) {
      document.documentElement.style.setProperty('--header-controls-width', '84px');
      return;
    }

    const minLeft = Math.min(...visible.map(r => r.left));
    const controlsWidth = Math.max(0, Math.round(headerRect.right - minLeft));
    const buffer = 8; // small breathing room for controls measurement
    // Set controls width as a fallback (used by calc fallback in CSS)
    document.documentElement.style.setProperty('--header-controls-width', (controlsWidth + buffer) + 'px');

    // Compute available width from viewport right edge so only necessary clipping occurs
    const titleRect = title.getBoundingClientRect();
    // available = distance from title left to viewport right minus controlsWidth and a small margin
    const margin = 6; // breathing room between text and controls
    // Compute available; clamp to a reasonable minimum to avoid showing just
    // a single character at extreme zoom levels. Also cap at header width.
    const rawAvailable = Math.round(window.innerWidth - titleRect.left - (controlsWidth + buffer) - margin);
    const minAvailable = 140; // px — shows a useful amount of the title
    const maxAvailable = Math.max(48, Math.round(headerRect.width - 16));
    const available = Math.max(Math.min(rawAvailable, maxAvailable), minAvailable);
    document.documentElement.style.setProperty('--header-available-width', available + 'px');
  }

  // initial update and on resize/DOM changes
  requestAnimationFrame(updateReserve);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => requestAnimationFrame(updateReserve));
    ro.observe(header);
    ro.observe(document.body);
  } else {
    window.addEventListener('resize', () => requestAnimationFrame(updateReserve));
  }

  // Observe DOM changes inside header that may add/remove controls
  if (window.MutationObserver) {
    const mo = new MutationObserver(() => requestAnimationFrame(updateReserve));
    mo.observe(header, { childList: true, subtree: true });
  }

  // update after fonts/images settle
  setTimeout(updateReserve, 600);
});
