(function () {
  const addToBagBtn = document.getElementById('addToBagBtn');
  const buyNowBtn = document.getElementById('buyNowBtn');
  const sizeOptions = document.getElementById('sizeOptions');
  if (!addToBagBtn && !buyNowBtn) return;

  function getSelectedVariantId() {
    if (sizeOptions) {
      const selected = sizeOptions.querySelector('.size-btn.is-selected');
      return selected ? selected.dataset.variantId : null;
    }
    return (addToBagBtn && addToBagBtn.dataset.variantId) || null;
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
      alert(data.message || 'Could not add this item to your bag');
      return null;
    }

    if (data && typeof data.itemCount !== 'undefined') {
      if (window.updateCartBadge) window.updateCartBadge(data.itemCount);
    }

    return data;
  }

  if (addToBagBtn) {
    addToBagBtn.addEventListener('click', async function () {
      const productId = addToBagBtn.dataset.productId;
      const variantId = getSelectedVariantId();

      if (!variantId) {
        alert('Please select a size first.');
        return;
      }

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
        alert('Something went wrong — please try again.');
        addToBagBtn.textContent = originalText;
        addToBagBtn.disabled = false;
      }
    });
  }

  if (buyNowBtn) {
    buyNowBtn.addEventListener('click', async function () {
      if (buyNowBtn.disabled) return;

      const productId = addToBagBtn && addToBagBtn.dataset.productId;
      const variantId = getSelectedVariantId();

      if (!productId || !variantId) {
        alert('Please select a size first.');
        return;
      }

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
        alert('Something went wrong — please try again.');
        buyNowBtn.textContent = originalText;
        buyNowBtn.disabled = false;
      }
    });
  }
})();
