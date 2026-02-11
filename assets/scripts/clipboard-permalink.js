/**
 * Clipboard Permalink Script
 * Click any heading to copy its permalink to clipboard
 * Uses event delegation for instant navigation compatibility
 */

(function() {
  // Insert a persistent, hidden copy icon span into each heading so it can
  // be shown on hover and toggled visible after copy. Run on DOMContentLoaded
  // to avoid racing with instant navigation DOM updates.
  function ensureHeadingIcons() {
    const sel = '.md-content h1[id], .md-content h2[id], .md-content h3[id], .md-content h4[id], .md-content h5[id], .md-content h6[id]';
    const headings = document.querySelectorAll(sel);
    const SVG_NS = 'http://www.w3.org/2000/svg';
    headings.forEach(heading => {
      if (!heading.querySelector('.ub-copy-check')) {
        const check = document.createElement('span');
        check.className = 'ub-copy-check';
        check.setAttribute('aria-hidden', 'true');
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.width = '1em';
        svg.style.height = '1em';
        svg.style.display = 'inline-block';
        svg.style.verticalAlign = 'text-bottom';
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 0 0 3-3 3 3 0 0 0-3-3 3 3 0 0 0-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9a3 3 0 0 0-3 3 3 3 0 0 0 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.15c-.05.21-.08.43-.08.66 0 1.61 1.31 2.91 2.92 2.91s2.92-1.3 2.92-2.91A2.92 2.92 0 0 0 18 16.08');
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);
        check.appendChild(svg);
        heading.appendChild(check);
      }
    });
  }

  // Ensure icons exist initially and also when DOM updates may add headings
  document.addEventListener('DOMContentLoaded', ensureHeadingIcons);
  // Some instant-navigation setups mutate the DOM; attempt a short re-run
  setTimeout(ensureHeadingIcons, 300);

  // Use event delegation for clicks to copy permalink and show the icon persistently
  document.addEventListener('click', function(e) {
    const heading = e.target.closest('.md-content h1, .md-content h2, .md-content h3, .md-content h4, .md-content h5, .md-content h6');
    if (!heading || !heading.id) return;
    const id = heading.id;
    const permalink = window.location.href.split('#')[0] + '#' + id;

    navigator.clipboard.writeText(permalink).then(() => {
      try {
        const check = heading.querySelector('.ub-copy-check');
        if (check) {
          // Clear any previous timer and ensure visible class is set so it stays
          if (check._ubTimeout) clearTimeout(check._ubTimeout);
          check.classList.add('ub-copy-check--visible');
          // After delay, remove visible class so hover behavior resumes control
          check._ubTimeout = setTimeout(() => {
            check.classList.remove('ub-copy-check--visible');
            check._ubTimeout = null;
          }, 1400);
        }
      } catch (err) { console.error('Clipboard feedback error:', err); }
      try { showCopiedToast && showCopiedToast('Copied to clipboard'); } catch (e) {}
    }).catch(err => {
      console.error('Failed to copy permalink:', err);
    });
  });
})();

// Lightweight global toast for "Copied to clipboard" messages.
// Exposed at module level so other scripts can reuse it.
function showCopiedToast(message) {
  try {
    // Reuse Material's dialog markup so the theme's built-in styles apply.
    const id = 'ub-global-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'md-dialog';
      el.setAttribute('data-md-component', 'dialog');
      document.body.appendChild(el);
    }
    // Use the theme dialog inner so fonts, sizing and shadow match exactly.
    el.innerHTML = '<div class="md-dialog__inner md-typeset" role="status" aria-live="polite">' + (message || 'Copied to clipboard') + '</div>';
    // Show by adding the active class the theme watches
    el.classList.add('md-dialog--active');
    // Clear any previous hide timer
    if (el._ubHideTimer) {
      clearTimeout(el._ubHideTimer);
      el._ubHideTimer = null;
    }
    // Hide after a short delay, then remove element after the theme's hide animation
    el._ubHideTimer = setTimeout(() => {
      el.classList.remove('md-dialog--active');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 1400);
  } catch (e) { console.error('showCopiedToast error', e); }
}
