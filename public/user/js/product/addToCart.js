(function () {
  const addToBagBtn = document.getElementById('addToBagBtn');
  const buyNowBtn   = document.getElementById('buyNowBtn');
  const sizeOptions = document.getElementById('sizeOptions');

  if (!addToBagBtn && !buyNowBtn) return;

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Read product id from whichever button has it */
  function getProductId() {
    if (addToBagBtn && addToBagBtn.dataset.productId) return addToBagBtn.dataset.productId;
    if (buyNowBtn   && buyNowBtn.dataset.productId)   return buyNowBtn.dataset.productId;
    return null;
  }

  /** Return the currently selected variant button */
  function getSelectedVariantBtn() {
    if (!sizeOptions) return null;
    return sizeOptions.querySelector('.size-btn.is-selected');
  }

  /** Flash a red outline on the size selector to guide the user */
  function shakeSizeSelector() {
    if (!sizeOptions) return;
    sizeOptions.style.outline = '2px solid #c0392b';
    sizeOptions.style.borderRadius = '4px';
    setTimeout(() => {
      sizeOptions.style.outline = '';
      sizeOptions.style.borderRadius = '';
    }, 1800);
  }

  async function addToCartRequest(productId, variantId, buyNow) {
    const res = await fetch('/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        variant_id: variantId,
        quantity: 1,
        buy_now: buyNow,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = data.redirect || '/auth/login?next=' + next;
        return null;
      }
      essToast(data.message || 'Could not add this item to your bag', 'error');
      return null;
    }

    if (data && typeof data.itemCount !== 'undefined') {
      if (window.updateCartBadge) window.updateCartBadge(data.itemCount);
    }

    return data;
  }

  // ── Add to Bag ─────────────────────────────────────────────────────────────

  if (addToBagBtn) {
    addToBagBtn.addEventListener('click', async function () {
      const productId = getProductId();
      const variantBtn = getSelectedVariantBtn();

      if (!variantBtn) {
        shakeSizeSelector();
        essToast('Please select a size first.', 'warning');
        return;
      }

      const stock = parseInt(variantBtn.dataset.stock, 10);
      if (isNaN(stock) || stock <= 0 || variantBtn.classList.contains('is-disabled')) {
        shakeSizeSelector();
        essToast('Sorry, this size is currently out of stock.', 'error');
        return;
      }

      const variantId = variantBtn.dataset.variantId;

      addToBagBtn.disabled = true;
      const originalText = addToBagBtn.textContent;
      addToBagBtn.textContent = 'Adding...';

      try {
        const data = await addToCartRequest(productId, variantId, false);
        if (!data) {
          addToBagBtn.textContent = originalText;
          addToBagBtn.disabled = false;
          return;
        }
        addToBagBtn.textContent = 'Added ✓';
        setTimeout(function () {
          addToBagBtn.textContent = originalText;
          addToBagBtn.disabled = false;
        }, 1500);
      } catch (err) {
        console.error('Add to cart failed:', err);
        essToast('Something went wrong — please try again.', 'error');
        addToBagBtn.textContent = originalText;
        addToBagBtn.disabled = false;
      }
    });
  }

  // ── Buy Now ────────────────────────────────────────────────────────────────

  if (buyNowBtn) {
    buyNowBtn.addEventListener('click', async function () {
      if (buyNowBtn.disabled) return;

      const productId = getProductId();
      const variantBtn = getSelectedVariantBtn();

      if (!productId || !variantBtn) {
        shakeSizeSelector();
        essToast('Please select a size first.', 'warning');
        return;
      }

      const stock = parseInt(variantBtn.dataset.stock, 10);
      if (isNaN(stock) || stock <= 0 || variantBtn.classList.contains('is-disabled')) {
        shakeSizeSelector();
        essToast('Sorry, this size is currently out of stock.', 'error');
        return;
      }

      const variantId = variantBtn.dataset.variantId;

      buyNowBtn.disabled = true;
      const originalText = buyNowBtn.textContent;
      buyNowBtn.textContent = 'Redirecting...';

      try {
        const data = await addToCartRequest(productId, variantId, true);
        if (!data) {
          buyNowBtn.textContent = originalText;
          buyNowBtn.disabled = false;
          return;
        }
        window.location.href = data.redirect || '/checkout';
      } catch (err) {
        console.error('Buy now failed:', err);
        essToast('Something went wrong — please try again.', 'error');
        buyNowBtn.textContent = originalText;
        buyNowBtn.disabled = false;
      }
    });
  }
})();
