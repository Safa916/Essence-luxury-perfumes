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

  // Track pending ID and whether a deletion is actively in-flight
  let pendingProductId = null;
  let isDeleting       = false;

  function resetConfirmBtn() {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '🗑 Delete';
    }
  }

  // ── Open modal ───────────────────────────────────────────────────────────────
  function openDeleteModal(id, name) {
    if (!id) return;
    pendingProductId = id;
    isDeleting = false;
    if (productNameEl) productNameEl.textContent = name || 'this product';
    if (productRefEl)  productRefEl.textContent  = 'REF: ' + id.slice(-8).toUpperCase();
    resetConfirmBtn();
    if (overlay) overlay.classList.add('open');
  }

  // ── Close modal ──────────────────────────────────────────────────────────────
  function closeDeleteModal() {
    // Don't allow closing via backdrop/ESC/cancel while a deletion is in-flight
    if (isDeleting) return;
    pendingProductId = null;
    resetConfirmBtn();
    if (overlay) overlay.classList.remove('open');
  }

  // ── Wire delete buttons via event delegation ─────────────────────────────────
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn-delete');
    if (btn) {
      e.stopPropagation();
      e.preventDefault();
      openDeleteModal(btn.dataset.id, btn.dataset.name);
    }
  });

  // ── Row-click → navigate to product detail ───────────────────────────────────
  document.querySelectorAll('.row-clickable').forEach(function (row) {
    row.addEventListener('click', function (e) {
      // Ignore clicks on action buttons or links inside the row
      if (e.target.closest('.actions') || e.target.closest('a') || e.target.closest('button')) return;
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

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
      closeDeleteModal();
    }
  });

  // ── Confirm delete ───────────────────────────────────────────────────────────
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function () {
      if (!pendingProductId || isDeleting) return;

      const idToDelete = pendingProductId;
      isDeleting = true;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting…';

      let succeeded = false;

      try {
        const res = await fetch('/admin/products/' + idToDelete, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();

        if (data.success) {
          succeeded = true;

          // Close modal first, then animate-remove the row so the
          // button state is fully reset before the animation plays.
          isDeleting = false;
          pendingProductId = null;
          resetConfirmBtn();
          if (overlay) overlay.classList.remove('open');

          // Fade-out and remove the deleted row from the table
          const row = document.querySelector(`.btn-delete[data-id="${idToDelete}"]`)?.closest('tr');
          if (row) {
            row.style.transition = 'opacity 0.3s';
            row.style.opacity = '0';
            setTimeout(function () {
              row.remove();
              // Show "no products" message if the table is now empty
              const tbody = document.querySelector('.products-table tbody');
              if (tbody && tbody.querySelectorAll('tr').length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#888;">No products found</td></tr>';
              }
            }, 300);
          }

          // Update "Showing X of Y" counters
          const showingEl = document.querySelector('.showing-count');
          if (showingEl) {
            const strongs = showingEl.querySelectorAll('strong');
            if (strongs.length >= 1) {
              const current = parseInt(strongs[0].textContent, 10);
              if (!isNaN(current) && current > 0) strongs[0].textContent = current - 1;
            }
            if (strongs.length >= 2) {
              const total = parseInt(strongs[1].textContent, 10);
              if (!isNaN(total) && total > 0) strongs[1].textContent = total - 1;
            }
          }
        } else {
          alert(data.message || 'Could not delete product. Please try again.');
        }
      } catch (err) {
        console.error('Delete product error:', err);
        alert('Server error while deleting product. Please try again.');
      } finally {
        // Always unblock the modal so the user can retry or open another
        // deletion — but only if we didn't already handle success above.
        if (!succeeded) {
          isDeleting = false;
          resetConfirmBtn();
        }
      }
    });
  }
})();
