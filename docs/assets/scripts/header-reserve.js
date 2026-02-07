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
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0 && r.right > headerRect.left);

    if (visible.length === 0) {
      document.documentElement.style.setProperty('--header-controls-width', '84px');
      return;
    }

    const minLeft = Math.min(...visible.map(r => r.left));
    const controlsWidth = Math.max(0, Math.round(headerRect.right - minLeft));
    const buffer = 8; // small breathing room
    document.documentElement.style.setProperty('--header-controls-width', (controlsWidth + buffer) + 'px');
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
