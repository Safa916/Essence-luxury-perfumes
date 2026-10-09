(function () {

  /* ============================================================
     TOAST NOTIFICATION SYSTEM
     Replaces all native alert() calls with elegant branded toasts
  ============================================================ */

  function createToastContainer() {
    let container = document.getElementById('essence-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'essence-toast-container';
      container.setAttribute('role', 'region');
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Show a toast notification
   * @param {string} message  - Message to display
   * @param {'success'|'error'|'info'|'warning'} type - Toast type
   * @param {number} duration - Auto-dismiss in ms (default 3500)
   */
  function showToast(message, type = 'info', duration = 3500) {
    const container = createToastContainer();

    const icons = {
      success: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M6 10.5l2.5 2.5L14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      error:   `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.75" fill="currentColor"/></svg>`,
      warning: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.134 3.408L2.27 15.25A1 1 0 003.136 17h13.728a1 1 0 00.866-1.5L10.866 3.408a1 1 0 00-1.732 0z" stroke="currentColor" stroke-width="1.5"/><path d="M10 8v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.75" fill="currentColor"/></svg>`,
      info:    `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.75" fill="currentColor"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `essence-toast essence-toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="essence-toast__icon">${icons[type] || icons.info}</span>
      <span class="essence-toast__msg">${message}</span>
      <button class="essence-toast__close" aria-label="Dismiss">&times;</button>
    `;

    // Progress bar
    const progress = document.createElement('div');
    progress.className = 'essence-toast__progress';
    toast.appendChild(progress);

    container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('essence-toast--visible'));
    });

    // Animate progress bar
    progress.style.transition = `width ${duration}ms linear`;
    setTimeout(() => { progress.style.width = '0%'; }, 50);

    let dismissTimer = setTimeout(() => dismiss(toast), duration);

    // Pause on hover
    toast.addEventListener('mouseenter', () => {
      clearTimeout(dismissTimer);
      progress.style.transition = 'none';
    });
    toast.addEventListener('mouseleave', () => {
      const remaining = 1500;
      progress.style.transition = `width ${remaining}ms linear`;
      progress.style.width = '0%';
      dismissTimer = setTimeout(() => dismiss(toast), remaining);
    });

    // Manual dismiss
    toast.querySelector('.essence-toast__close').addEventListener('click', () => {
      clearTimeout(dismissTimer);
      dismiss(toast);
    });
  }

  function dismiss(toast) {
    toast.classList.remove('essence-toast--visible');
    toast.classList.add('essence-toast--leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  /* Inject toast styles once */
  (function injectStyles() {
    if (document.getElementById('essence-toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'essence-toast-styles';
    style.textContent = `
      #essence-toast-container {
        position: fixed;
        top: 1.5rem;
        right: 1.5rem;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 360px;
        width: calc(100vw - 3rem);
        pointer-events: none;
      }
      .essence-toast {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1rem 1rem 1rem 1.1rem;
        background: #fff;
        border: 1px solid #e8e2d9;
        border-left: 3px solid #a08b6e;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
        position: relative;
        overflow: hidden;
        pointer-events: all;
        transform: translateX(110%);
        opacity: 0;
        transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity 0.3s ease;
      }
      .essence-toast--visible {
        transform: translateX(0);
        opacity: 1;
      }
      .essence-toast--leaving {
        transform: translateX(110%);
        opacity: 0;
        transition: transform 0.28s ease-in, opacity 0.22s ease-in;
      }
      .essence-toast--success { border-left-color: #5a7c5a; }
      .essence-toast--error   { border-left-color: #9e3d3d; }
      .essence-toast--warning { border-left-color: #b08030; }
      .essence-toast--info    { border-left-color: #a08b6e; }

      .essence-toast__icon {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        margin-top: 1px;
      }
      .essence-toast--success .essence-toast__icon { color: #5a7c5a; }
      .essence-toast--error   .essence-toast__icon { color: #9e3d3d; }
      .essence-toast--warning .essence-toast__icon { color: #b08030; }
      .essence-toast--info    .essence-toast__icon { color: #a08b6e; }

      .essence-toast__msg {
        flex: 1;
        font-family: 'Jost', sans-serif;
        font-size: 0.85rem;
        line-height: 1.5;
        color: #2c2c2c;
        letter-spacing: 0.01em;
      }
      .essence-toast__close {
        flex-shrink: 0;
        background: none;
        border: none;
        font-size: 1.1rem;
        line-height: 1;
        color: #a0948a;
        cursor: pointer;
        padding: 0;
        margin-top: -1px;
        transition: color 0.2s;
      }
      .essence-toast__close:hover { color: #2c2c2c; }

      .essence-toast__progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        width: 100%;
        background: currentColor;
        opacity: 0.25;
      }
      .essence-toast--success .essence-toast__progress { background: #5a7c5a; }
      .essence-toast--error   .essence-toast__progress { background: #9e3d3d; }
      .essence-toast--warning .essence-toast__progress { background: #b08030; }
      .essence-toast--info    .essence-toast__progress { background: #a08b6e; }

      /* Size selector modal */
      .essence-size-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.45);
        backdrop-filter: blur(3px);
        z-index: 9000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .essence-size-modal-overlay.visible { opacity: 1; }
      .essence-size-modal {
        background: #fff;
        max-width: 380px;
        width: calc(100% - 2rem);
        padding: 2.5rem 2rem 2rem;
        text-align: center;
        position: relative;
        transform: translateY(20px) scale(0.97);
        transition: transform 0.3s cubic-bezier(0.34,1.4,0.64,1);
      }
      .essence-size-modal-overlay.visible .essence-size-modal { transform: translateY(0) scale(1); }
      .essence-size-modal__eyebrow {
        font-family: 'Jost', sans-serif;
        font-size: 0.65rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #a08b6e;
        margin: 0 0 0.75rem;
      }
      .essence-size-modal__title {
        font-family: 'Cormorant Garamond', serif;
        font-size: 1.5rem;
        font-weight: 500;
        color: #1a1a1a;
        margin: 0 0 0.75rem;
      }
      .essence-size-modal__body {
        font-family: 'Jost', sans-serif;
        font-size: 0.85rem;
        color: #6e6460;
        line-height: 1.6;
        margin: 0 0 1.75rem;
      }
      .essence-size-modal__actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
      }
      .essence-size-modal__btn {
        font-family: 'Jost', sans-serif;
        font-size: 0.7rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 0.75rem 1.5rem;
        cursor: pointer;
        border: 1px solid #1a1a1a;
        transition: background 0.2s, color 0.2s;
        text-decoration: none;
        display: inline-block;
      }
      .essence-size-modal__btn--primary {
        background: #1a1a1a;
        color: #fff;
      }
      .essence-size-modal__btn--primary:hover { background: #333; }
      .essence-size-modal__btn--secondary {
        background: transparent;
        color: #1a1a1a;
      }
      .essence-size-modal__btn--secondary:hover { background: #f5f2ee; }
      .essence-size-modal__close {
        position: absolute;
        top: 0.9rem;
        right: 1rem;
        background: none;
        border: none;
        font-size: 1.3rem;
        color: #a0948a;
        cursor: pointer;
        line-height: 1;
      }
      .essence-size-modal__close:hover { color: #1a1a1a; }
    `;
    document.head.appendChild(style);
  })();

  /* ============================================================
     SIZE SELECTION MODAL
     Shown instead of alert() when no variant is selected
  ============================================================ */

  function showSizeModal(productSlug) {
    const overlay = document.createElement('div');
    overlay.className = 'essence-size-modal-overlay';

    overlay.innerHTML = `
      <div class="essence-size-modal" role="dialog" aria-modal="true" aria-labelledby="sizeModalTitle">
        <button class="essence-size-modal__close" aria-label="Close">&times;</button>
        <p class="essence-size-modal__eyebrow">Action Required</p>
        <h2 class="essence-size-modal__title" id="sizeModalTitle">Select a Size First</h2>
        <p class="essence-size-modal__body">
          This fragrance comes in multiple sizes. Please visit the product page and choose your preferred size before adding it to your bag.
        </p>
        <div class="essence-size-modal__actions">
          <a href="${productSlug ? '/product/' + productSlug : '/shop'}" class="essence-size-modal__btn essence-size-modal__btn--primary">View Product</a>
          <button class="essence-size-modal__btn essence-size-modal__btn--secondary js-size-modal-cancel">Maybe Later</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('visible'));
    });

    function closeModal() {
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }

    overlay.querySelector('.essence-size-modal__close').addEventListener('click', closeModal);
    overlay.querySelector('.js-size-modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    // Trap escape key
    const handleKey = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleKey); } };
    document.addEventListener('keydown', handleKey);
  }

  /* ============================================================
     WISHLIST GRID EVENTS
  ============================================================ */

  const grid = document.getElementById('wishlistGrid');
  if (!grid) return;

  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.wishlist-card');
    if (!card) return;
    const wishlistItemId = card.dataset.wishlistItemId;

    // ===== Remove =====
    if (e.target.classList.contains('wishlist-remove-btn')) {
      const removeBtn = e.target;
      removeBtn.disabled = true;
      try {
        const res = await fetch(`/wishlist/remove/${wishlistItemId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          // Animate card out
          card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => {
            card.remove();
            if (grid.querySelectorAll('.wishlist-card').length === 0) window.location.reload();
          }, 300);
          showToast('Item removed from your wishlist.', 'info');
        } else {
          showToast(data.message || 'Could not remove item.', 'error');
          removeBtn.disabled = false;
        }
      } catch (err) {
        console.error(err);
        showToast('Something went wrong. Please try again.', 'error');
        removeBtn.disabled = false;
      }
      return;
    }

    // ===== Move to bag =====
    if (e.target.classList.contains('wishlist-move-btn') && !e.target.disabled) {
      const btn = e.target;
      const productId  = btn.dataset.productId;
      const variantId  = btn.dataset.variantId;
      const productSlug = card.querySelector('.wishlist-name')?.getAttribute('href')?.replace('/product/', '') || '';

      // No variant selected — show the size selection modal instead of alert()
      if (!variantId) {
        showSizeModal(productSlug);
        return;
      }

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Moving…';

      try {
        const cartRes = await fetch('/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId, variant_id: variantId, quantity: 1 }),
        });
        const cartData = await cartRes.json();

        if (cartData.redirect) {
          window.location.href = cartData.redirect;
          return;
        }
        if (!cartData.success) {
          showToast(cartData.message || 'Could not add to bag. Please try again.', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }

        // Show success toast then remove card
        showToast('Added to your bag successfully!', 'success');
        if (window.updateCartBadge && cartData.itemCount !== undefined) {
          window.updateCartBadge(cartData.itemCount);
        }
        card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => {
          card.remove();
          if (grid.querySelectorAll('.wishlist-card').length === 0) window.location.reload();
        }, 350);

      } catch (err) {
        console.error(err);
        showToast('Something went wrong. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });

})();

