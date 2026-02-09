/**
 * Clipboard Permalink Script
 * Click any heading to copy its permalink to clipboard
 * Uses event delegation for instant navigation compatibility
 */

(function() {
  // Use event delegation - attach ONE listener that works for all headings, 
  // present and future (handles instant navigation automatically)
  document.addEventListener('click', function(e) {
    // Check if the clicked element is a heading within .md-content
    const heading = e.target.closest('.md-content h1, .md-content h2, .md-content h3, .md-content h4, .md-content h5, .md-content h6');
    
    if (heading && heading.id) {
      const id = heading.id;
      const permalink = window.location.href.split('#')[0] + '#' + id;
      
      navigator.clipboard.writeText(permalink).then(() => {
        // Show a transient checkmark next to the heading instead of replacing text
        try {
          // If a previous check exists, clear its timeout and remove it first
          const prev = heading.querySelector('.ub-copy-check');
          if (prev) {
            if (prev._ubTimeout) clearTimeout(prev._ubTimeout);
            prev.remove();
          }

          const check = document.createElement('span');
          check.className = 'ub-copy-check';
          check.setAttribute('aria-hidden', 'true');
          check.textContent = '✓';
          heading.appendChild(check);

          // Trigger visible state for CSS transition
          requestAnimationFrame(() => check.classList.add('ub-copy-check--visible'));

          // Remove after short delay
          const t = setTimeout(() => {
            check.classList.remove('ub-copy-check--visible');
            setTimeout(() => { if (check.parentNode) check.parentNode.removeChild(check); }, 180);
          }, 1400);
          // store timeout so we can clear if another copy happens quickly
          check._ubTimeout = t;
        } catch (err) {
          console.error('Clipboard feedback error:', err);
        }
      }).catch(err => {
        console.error('Failed to copy permalink:', err);
      });
    }
  });
})();
