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
    if (productNameEl) productNameEl.textContent = name || 'this product';
    if (productRefEl)  productRefEl.textContent  = 'REF: ' + id.slice(-8).toUpperCase();
    resetConfirmBtn();
    if (overlay) overlay.classList.add('open');
  }

  // ── Close modal ──────────────────────────────────────────────────────────────
  function closeDeleteModal() {
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
      if (!pendingProductId) return;

      const idToDelete = pendingProductId;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting…';

      try {
        const res = await fetch('/admin/products/' + idToDelete, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();

        if (data.success) {
          // Remove the row from the table smoothly
          const row = document.querySelector(`.btn-delete[data-id="${idToDelete}"]`)?.closest('tr');
          if (row) {
            row.style.transition = 'opacity 0.3s';
            row.style.opacity = '0';
            setTimeout(function () {
              row.remove();
              const tbody = document.querySelector('.data-table tbody');
              if (tbody && tbody.querySelectorAll('tr').length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: #888;">No products found</td></tr>';
              }
            }, 300);
          }
          closeDeleteModal();

          // Update "Showing X of Y" count if present
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
          resetConfirmBtn();
        }
      } catch (err) {
        console.error('Delete product error:', err);
        alert('Server error while deleting product. Please try again.');
        resetConfirmBtn();
      } finally {
        resetConfirmBtn();
      }
    });
  }
})();
