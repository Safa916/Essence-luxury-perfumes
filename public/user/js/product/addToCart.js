(function () {
  const addToBagBtn = document.getElementById('addToBagBtn');
  const sizeOptions = document.getElementById('sizeOptions');
  if (!addToBagBtn) return;

  // Track the currently-selected variant. If a size selector exists, its
  // "is-selected" button drives this; otherwise fall back to the first
  // (only) variant already encoded on the page via data attributes.
  function getSelectedVariantId() {
    if (sizeOptions) {
      const selected = sizeOptions.querySelector('.size-btn.is-selected');
      return selected ? selected.dataset.variantId : null;
    }
    return addToBagBtn.dataset.variantId || null;
  }

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
      const res = await fetch('/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, variant_id: variantId, quantity: 1 }),
      });
      const data = await res.json();

      if (!res.ok) {
        // 401 means the auth middleware didn't find a session — send to login.
        if (res.status === 401) {
          window.location.href = '/auth/login';
          return;
        }
        alert(data.message || 'Could not add this item to your bag');
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
})();
