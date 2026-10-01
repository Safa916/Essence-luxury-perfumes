(function () {
  const cartItemsWrapper = document.getElementById('cartItems');
  const cartSubtotalEl = document.getElementById('cartSubtotal');
  const checkoutBtn = document.getElementById('checkoutBtn');

  function formatINR(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN');
  }

  if (!cartItemsWrapper) return;

  cartItemsWrapper.addEventListener('click', async (e) => {
    const row = e.target.closest('.cart-item');
    if (!row) return;
    const cartItemId = row.dataset.cartItemId;

    // ── Quantity change ──────────────────────────────────────────────────────
    if (e.target.classList.contains('qty-increase') || e.target.classList.contains('qty-decrease')) {
      if (e.target.disabled) return;
      const action = e.target.classList.contains('qty-increase') ? 'increase' : 'decrease';

      try {
        const res = await fetch('/cart/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart_item_id: cartItemId, action }),
        });
        const data = await res.json();
        if (!data.success) return alert(data.message || 'Could not update quantity.');

        row.querySelector('.qty-value').textContent = data.quantity;
        row.querySelector('.item-total').textContent = formatINR(data.total_price);
        row.querySelector('.qty-decrease').disabled = data.minReached;
        row.querySelector('.qty-increase').disabled = data.maxReached;
        if (cartSubtotalEl) cartSubtotalEl.textContent = formatINR(data.subtotal);
      } catch (err) {
        console.error(err);
        alert('Something went wrong updating quantity.');
      }
      return;
    }

    // ── Remove item ──────────────────────────────────────────────────────────
    if (e.target.classList.contains('cart-item-remove')) {
      try {
        const res = await fetch(`/cart/remove/${cartItemId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) return alert(data.message || 'Could not remove item.');

        row.remove();
        if (cartSubtotalEl) cartSubtotalEl.textContent = formatINR(data.subtotal);

        const currentPage = parseInt(cartItemsWrapper.dataset.currentPage, 10) || 1;
        const totalPages  = parseInt(cartItemsWrapper.dataset.totalPages, 10) || 1;

        if (data.itemCount === 0) {
          // Cart is completely empty — reload to show empty state
          window.location.href = '/cart';
        } else {
          // If we just removed the last item on this page and there are
          // still items on earlier pages, go back one page
          const remainingOnPage = cartItemsWrapper.querySelectorAll('.cart-item').length;
          if (remainingOnPage === 0 && currentPage > 1) {
            window.location.href = '/cart?page=' + (currentPage - 1);
          } else if (remainingOnPage === 0) {
            // Last item on page 1 but more items exist — reload to normalise
            window.location.href = '/cart';
          }
          // Otherwise just leave the remaining items visible and update subtotal
        }
      } catch (err) {
        console.error(err);
        alert('Something went wrong removing this item.');
      }
    }
  });

  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (checkoutBtn.disabled) return;
      console.log('Proceed to checkout clicked');
    });
  }
})();