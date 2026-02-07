document.addEventListener('DOMContentLoaded', function () {
  const header = document.querySelector('.md-header');
  if (!header) return;

  const title = header.querySelector('.md-header__title');
  if (!title) return;

  function updateReserve() {
    // compute the leftmost control to the right of the title
    const headerRect = header.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();

    // find all header descendants that are not the title and are visible
    const candidates = Array.from(header.querySelectorAll('*')).filter(el => {
      if (!el.getBoundingClientRect) return false;
      if (title.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    // find the smallest left value among elements positioned to the right of title's left
    const rightSideEls = candidates.filter(el => el.getBoundingClientRect().left > titleRect.left + 4);
    if (rightSideEls.length === 0) {
      // fallback: reserve 84px
      document.documentElement.style.setProperty('--header-controls-width', '84px');
      return;
    }

    const minLeft = Math.min(...rightSideEls.map(el => el.getBoundingClientRect().left));
    // controls occupy from minLeft to headerRect.right
    const controlsWidth = Math.max(0, Math.round(headerRect.right - minLeft));
    // add small buffer for padding
    const buffer = 8;
    document.documentElement.style.setProperty('--header-controls-width', (controlsWidth + buffer) + 'px');
  }

  // initial update and on resize
  updateReserve();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => requestAnimationFrame(updateReserve));
    ro.observe(header);
    // also observe body to catch layout changes
    ro.observe(document.body);
  } else {
    window.addEventListener('resize', () => requestAnimationFrame(updateReserve));
  }

  // also update after a short delay to allow images/fonts to settle
  setTimeout(updateReserve, 500);
});
