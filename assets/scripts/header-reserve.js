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
    // Prefer measuring the actual text container (ellipsis) instead of the title wrapper
    // — this ensures we compute available width from the text left edge to the
    // viewport right edge.
    const ellipsisEl = title.querySelector('.md-ellipsis');
    const textRect = ellipsisEl ? ellipsisEl.getBoundingClientRect() : title.getBoundingClientRect();
    // available = distance from text left to viewport right minus controlsWidth and a small margin
    const margin = 6; // breathing room between text and controls
    const rawAvailable = Math.round(window.innerWidth - textRect.left - (controlsWidth + buffer) - margin);
    // boost available width more aggressively so clipping starts much later when zooming
    const zoomBoost = Math.round(window.innerWidth * 0.18); // 18% of viewport width
    const boosted = rawAvailable + zoomBoost;
    // dynamic minimum: use at least 35% of viewport or 220px whichever is larger
    const minAvailable = Math.max(120, Math.round(Math.max(220, window.innerWidth * 0.35)));
    const maxAvailable = Math.max(48, Math.round(headerRect.width - 16));
    const available = Math.max(Math.min(boosted, maxAvailable), minAvailable);
    if (window.__UB_DEBUG_HEADER) {
      console.debug('header-reserve:', { rawAvailable, minAvailable, maxAvailable, available, windowInner: window.innerWidth, textLeft: textRect.left, controlsWidth, buffer });
    }
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
