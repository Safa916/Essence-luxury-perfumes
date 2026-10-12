/**
 * Checkout coupon apply / remove
 * Talks to POST /coupon/apply and DELETE /coupon/remove
 * Updates the order summary totals live without a page reload
 */
(function () {

  const applyBtn      = document.getElementById('couponApplyBtn');
  const removeBtn     = document.getElementById('couponRemoveBtn');
  const input         = document.getElementById('couponInput');
  const errorEl       = document.getElementById('couponError');
  const appliedState  = document.getElementById('couponAppliedState');
  const inputState    = document.getElementById('couponInputState');
  const appliedCode   = document.getElementById('couponAppliedCode');

  // Summary DOM nodes (set by checkout.ejs)
  const subtotalEl    = document.getElementById('co-subtotal');
  const discountRow   = document.getElementById('co-discount-row');
  const discountLabel = document.getElementById('co-discount-label');
  const discountVal   = document.getElementById('co-discount-val');
  const taxEl         = document.getElementById('co-tax');
  const shippingEl    = document.getElementById('co-shipping');
  const totalEl       = document.getElementById('co-total');
  const shipNote      = document.getElementById('co-ship-note');

  if (!applyBtn && !removeBtn) return; // coupon section not present on this page

  // ── helpers ────────────────────────────────────────────────────────────────

  function fmt(n) {
    return '₹' + Number(n).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }

  // Update the right-side summary with values returned from the API
  function updateSummary(data) {
    if (subtotalEl) subtotalEl.textContent = fmt(data.subtotal);

    if (data.discount > 0) {
      if (discountLabel) discountLabel.textContent = `Coupon Discount (${data.couponCode || ''})`;
      if (discountVal)   discountVal.textContent   = `−${fmt(data.discount)}`;
      if (discountRow)   discountRow.style.display = '';
    } else {
      if (discountRow) discountRow.style.display = 'none';
    }

    if (taxEl)      taxEl.textContent      = fmt(data.tax);

    if (shippingEl) {
      shippingEl.innerHTML = data.shipping === 0
        ? '<span class="free-tag">Free</span>'
        : fmt(data.shipping);
    }

    if (totalEl)    totalEl.textContent    = fmt(data.total);

    // Update the free-shipping hint
    if (shipNote) {
      if (data.shipping === 0) {
        shipNote.textContent = '✦ Free shipping applied';
      } else {
        const gap = Math.max(0, 2000 - (data.subtotal - data.discount));
        shipNote.textContent = `Add ₹${gap.toLocaleString('en-IN')} more for free shipping`;
      }
    }
  }

  // Flip between input state and applied state
  function showApplied(code) {
    if (appliedCode) appliedCode.textContent = code;
    if (appliedState) appliedState.style.display = 'flex';
    if (inputState)   inputState.style.display   = 'none';
    if (input)        input.value = '';
    clearError();
  }

  function showInput() {
    if (appliedState) appliedState.style.display = 'none';
    if (inputState)   inputState.style.display   = '';
  }

  // ── Apply coupon ───────────────────────────────────────────────────────────

  async function handleApply() {
    const code = input ? input.value.trim().toUpperCase() : '';
    if (!code) {
      showError('Please enter a coupon code.');
      return;
    }

    clearError();
    applyBtn.disabled = true;
    applyBtn.textContent = '...';

    try {
      const res  = await fetch('/coupon/apply', {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!data.success) {
        showError(data.message || 'Could not apply coupon.');
        return;
      }

      updateSummary(data);
      showApplied(data.couponCode);
      essToast(data.message, 'success');
    } catch (err) {
      console.error('applyCoupon error:', err);
      showError('Something went wrong. Please try again.');
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply';
    }
  }

  // ── Remove coupon ──────────────────────────────────────────────────────────

  async function handleRemove() {
    removeBtn.disabled = true;

    try {
      const res  = await fetch('/coupon/remove', { method: 'DELETE' });
      const data = await res.json();

      if (!data.success) {
        essToast(data.message || 'Could not remove coupon.', 'error');
        return;
      }

      updateSummary(data);
      showInput();
      essToast('Coupon removed.', 'info');
    } catch (err) {
      console.error('removeCoupon error:', err);
      essToast('Something went wrong.', 'error');
    } finally {
      removeBtn.disabled = false;
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────────

  if (applyBtn)  applyBtn.addEventListener('click', handleApply);
  if (removeBtn) removeBtn.addEventListener('click', handleRemove);

  // Allow pressing Enter inside the coupon input to apply
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleApply();
      }
    });
    // Auto uppercase as user types
    input.addEventListener('input', function () {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
    });
  }

})();
