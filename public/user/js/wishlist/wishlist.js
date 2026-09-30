(function () {
  const grid = document.getElementById('wishlistGrid');
  if (!grid) return;

  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.wishlist-card');
    if (!card) return;
    const wishlistItemId = card.dataset.wishlistItemId;

    // ===== Remove =====
    if (e.target.classList.contains('wishlist-remove-btn')) {
      try {
        const res = await fetch(`/wishlist/remove/${wishlistItemId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          card.remove();
          if (!grid.children.length) window.location.reload();
        } else {
          alert(data.message || 'Could not remove item.');
        }
      } catch (err) {
        console.error(err);
        alert('Something went wrong removing this item.');
      }
      return;
    }

    // ===== Move to bag =====
    if (e.target.classList.contains('wishlist-move-btn') && !e.target.disabled) {
      const btn = e.target;
      const productId = btn.dataset.productId;
      const variantId = btn.dataset.variantId;

      if (!variantId) {
        alert('Please select a size on the product page first.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Moving...';

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
          alert(cartData.message || 'Could not add to bag.');
          btn.disabled = false;
          btn.textContent = 'Move to Bag';
          return;
        }

        // addToCart already removes it from the wishlist server-side —
        // just reflect that in the UI.
        card.remove();
        if (!grid.children.length) window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Something went wrong moving this to your bag.');
        btn.disabled = false;
        btn.textContent = 'Move to Bag';
      }
    }
  });
})();
