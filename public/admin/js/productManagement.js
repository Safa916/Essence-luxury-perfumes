// Delete Product confirmation popup (soft delete) + row click-to-view

const overlay = document.getElementById('deleteProductOverlay');
const nameEl = document.getElementById('deleteProductName');
const refEl = document.getElementById('deleteProductRef');
const confirmBtn = document.getElementById('confirmDeleteProductBtn');

let pendingDeleteId = null;

window.openDeleteProductModal = function (btn) {
  pendingDeleteId = btn.dataset.id;
  nameEl.textContent = btn.dataset.name;
  refEl.textContent = `REFERENCE ID: ${btn.dataset.id}`;
  overlay.classList.add('open');
};

window.closeDeleteProductModal = function () {
  overlay.classList.remove('open');
  pendingDeleteId = null;
};

confirmBtn &&
  confirmBtn.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting…';
    try {
      const res = await fetch(`/admin/products/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      } else {
        alert(data.message || 'Could not delete product');
      }
    } catch (err) {
      alert('Network error while deleting product');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '🗑 Delete';
    }
  });

// Clicking anywhere on a row (except the actions cell) opens the variant/view page
document.querySelectorAll('tr.row-clickable').forEach((row) => {
  row.addEventListener('click', () => {
    const href = row.dataset.href;
    if (href) window.location.href = href;
  });
});

// Bind Delete buttons via JS instead of inline onclick — avoids any
// browser-extension/security-software interference with inline handlers.
document.querySelectorAll('.btn-delete').forEach((btn) => {
  btn.addEventListener('click', () => openDeleteProductModal(btn));
});