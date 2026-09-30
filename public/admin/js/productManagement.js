/**
 * public/admin/js/productManagement.js
 * Handles:
 *  - Delete product confirmation modal (open → confirm → DELETE /admin/products/:id)
 *  - Row-click navigation to product detail page
 */
(function () {
  'use strict';

  // ── Element refs ────────────────────────────────────────────────────────────
  const overlay       = document.getElementById('deleteProductOverlay');
  const productNameEl = document.getElementById('deleteProductName');
  const productRefEl  = document.getElementById('deleteProductRef');
  const confirmBtn    = document.getElementById('confirmDeleteProductBtn');
  const cancelBtn     = document.getElementById('cancelDeleteProductBtn');
  const closeBtn      = document.getElementById('closeDeleteProductBtn');

  let pendingProductId = null;

  // ── Open modal ───────────────────────────────────────────────────────────────
  function openDeleteModal(id, name) {
    pendingProductId = id;
    if (productNameEl) productNameEl.textContent = name;
    if (productRefEl)  productRefEl.textContent  = 'REF: ' + id.slice(-8).toUpperCase();
    if (overlay)       overlay.classList.add('open');
  }

  // ── Close modal ──────────────────────────────────────────────────────────────
  function closeDeleteModal() {
    pendingProductId = null;
    if (overlay) overlay.classList.remove('open');
  }

  // ── Wire delete buttons ──────────────────────────────────────────────────────
  document.querySelectorAll('.btn-delete').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // Don't trigger row click
      openDeleteModal(btn.dataset.id, btn.dataset.name);
    });
  });

  // ── Row-click → navigate to product detail ───────────────────────────────────
  document.querySelectorAll('.row-clickable').forEach(function (row) {
    row.addEventListener('click', function (e) {
      // Ignore clicks on action buttons inside the row
      if (e.target.closest('.actions')) return;
      if (row.dataset.href) window.location.href = row.dataset.href;
    });
    row.style.cursor = 'pointer';
  });

  // ── Modal close triggers ─────────────────────────────────────────────────────
  if (closeBtn)  closeBtn.addEventListener('click', closeDeleteModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeDeleteModal);
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDeleteModal();
    });
  }

  // ── Confirm delete ───────────────────────────────────────────────────────────
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function () {
      if (!pendingProductId) return;

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting…';

      try {
        const res = await fetch('/admin/products/' + pendingProductId, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();

        if (data.success) {
          // Remove the row from the table without a full page reload
          const row = document.querySelector(`.btn-delete[data-id="${pendingProductId}"]`)?.closest('tr');
          if (row) {
            row.style.transition = 'opacity 0.3s';
            row.style.opacity = '0';
            setTimeout(function () { row.remove(); }, 300);
          }
          closeDeleteModal();
          // Update "Showing X of Y" count if present
          const showingCount = document.querySelector('.showing-count strong');
          if (showingCount) {
            const current = parseInt(showingCount.textContent, 10);
            if (!isNaN(current) && current > 0) showingCount.textContent = current - 1;
          }
        } else {
          alert(data.message || 'Could not delete product. Please try again.');
          confirmBtn.disabled = false;
          confirmBtn.textContent = '🗑 Delete';
        }
      } catch (err) {
        console.error('Delete product error:', err);
        alert('Server error while deleting product. Please try again.');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '🗑 Delete';
      }
    });
  }
})();
