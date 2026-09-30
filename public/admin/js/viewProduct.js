/**
 * public/admin/js/viewProduct.js
 * Variant Manager — handles Add / Edit / Delete variant modals via fetch JSON API.
 * Requires: window.__PRODUCT_ID__ set in viewproduct.ejs
 */
(function () {
  'use strict';

  const PRODUCT_ID = window.__PRODUCT_ID__;

  // ── Modal element refs ───────────────────────────────────────────────────────
  const formOverlay     = document.getElementById('variantFormOverlay');
  const formTitle       = document.getElementById('variantFormTitle');
  const variantForm     = document.getElementById('variantForm');
  const variantIdField  = document.getElementById('variantIdField');
  const nameInput       = document.getElementById('variantName');
  const concentInput    = document.getElementById('variantConcentration');
  const sizeInput       = document.getElementById('variantSize');
  const stockInput      = document.getElementById('variantStock');
  const priceInput      = document.getElementById('variantPrice');
  const activeCheck     = document.getElementById('variantActive');
  const saveBtn         = document.getElementById('saveVariantBtn');
  const cancelFormBtn   = document.getElementById('cancelVariantFormBtn');
  const formErrorBanner = document.getElementById('variantFormError');

  const deleteOverlay   = document.getElementById('deleteVariantOverlay');
  const deleteCodeEl    = document.getElementById('deleteVariantCode');
  const confirmDelBtn   = document.getElementById('confirmDeleteVariantBtn');
  const cancelDelBtn    = document.getElementById('cancelDeleteVariantBtn');

  const openAddBtn      = document.getElementById('openAddVariantBtn');
  const tbody           = document.getElementById('variantsTbody');
  const variantSearch   = document.getElementById('variantSearch');

  let pendingDeleteId   = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function openForm(mode) {
    if (formTitle) formTitle.textContent = mode === 'add' ? 'ADD NEW VARIANT' : 'EDIT VARIANT';
    if (saveBtn)   saveBtn.textContent   = mode === 'add' ? 'SAVE VARIANT'    : 'UPDATE VARIANT';
    clearFormError();
    if (formOverlay) formOverlay.classList.add('open');
  }

  function closeForm() {
    if (formOverlay) formOverlay.classList.remove('open');
    if (variantForm)    variantForm.reset();
    if (variantIdField) variantIdField.value = '';
    clearFormError();
  }

  // ── Inline error helpers ─────────────────────────────────────────────────────
  function showFormError(msg) {
    if (!formErrorBanner) return;
    formErrorBanner.textContent = msg;
    formErrorBanner.style.display = 'block';
  }

  function clearFormError() {
    if (!formErrorBanner) return;
    formErrorBanner.textContent = '';
    formErrorBanner.style.display = 'none';
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    if (deleteOverlay) deleteOverlay.classList.remove('open');
  }

  function stockLabel(qty) {
    if (qty <= 0)  return { text: 'OUT OF STOCK', cls: 'soldout' };
    if (qty <= 10) return { text: 'LOW STOCK',    cls: 'lowstock' };
    return { text: 'ACTIVE', cls: 'active' };
  }

  function buildRow(v) {
    const { text, cls } = stockLabel(v.quantity);
    const stockTag = v.quantity <= 0 ? 'Sold Out' : v.quantity <= 10 ? 'Critical' : v.quantity <= 60 ? 'Moderate' : 'High';
    const stockTagCls = v.quantity <= 0 ? 'soldout' : v.quantity <= 10 ? 'critical' : 'high';
    return `
      <tr data-variant-id="${v._id}">
        <td class="variant-id">${v.sku || '—'}</td>
        <td class="variant-name-cell">${v.variant_name || '—'}</td>
        <td>${v.concentration || '—'}</td>
        <td>${v.size_ml}</td>
        <td>
          <div class="stock-cell">
            <span class="stock-count ${v.quantity <= 10 ? 'critical' : ''}">${v.quantity} units</span>
            <span class="stock-tag ${stockTagCls}">${stockTag}</span>
          </div>
        </td>
        <td class="price">₹${Number(v.price).toFixed(2)}</td>
        <td><span class="status-pill ${cls}">${text}</span></td>
        <td class="col-actions">
          <button class="icon-btn edit-variant-btn" data-id="${v._id}" title="Edit">✎</button>
          <button class="icon-btn delete-variant-btn" data-id="${v._id}" data-code="${v.sku || v._id}" title="Delete">🗑</button>
        </td>
      </tr>`;
  }

  function refreshEmptyRow() {
    if (!tbody) return;
    const hasRows = tbody.querySelectorAll('tr[data-variant-id]').length > 0;
    const emptyRow = tbody.querySelector('tr.empty-state-row');
    if (!hasRows && !emptyRow) {
      tbody.insertAdjacentHTML('beforeend', '<tr class="empty-state-row"><td colspan="8" class="empty-row">No variants yet — add the first one.</td></tr>');
    } else if (hasRows && emptyRow) {
      emptyRow.remove();
    }
  }

  // ── Add variant ──────────────────────────────────────────────────────────────
  if (openAddBtn) {
    openAddBtn.addEventListener('click', function () {
      closeForm();
      openForm('add');
    });
  }

  // ── Form submit (Add or Edit) ────────────────────────────────────────────────
  if (variantForm) {
    variantForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const isEdit = variantIdField && variantIdField.value;
      const payload = {
        variant_name:  nameInput   ? nameInput.value.trim()   : '',
        concentration: concentInput ? concentInput.value.trim() : '',
        size_ml:       sizeInput   ? sizeInput.value           : '',
        quantity:      stockInput  ? stockInput.value          : 0,
        price:         priceInput  ? priceInput.value          : 0,
        is_active:     activeCheck ? String(activeCheck.checked) : 'true',
      };

      // Basic client-side validation
      if (!payload.variant_name) {
        showFormError('Variant name is required and must be unique.');
        if (nameInput) nameInput.focus();
        return;
      }
      if (!payload.size_ml || Number(payload.size_ml) <= 0) {
        showFormError('Size (ml) is required and must be greater than 0.');
        if (sizeInput) sizeInput.focus();
        return;
      }
      if (!payload.price || Number(payload.price) <= 0) {
        showFormError('Price is required and must be greater than 0.');
        if (priceInput) priceInput.focus();
        return;
      }

      clearFormError();

      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

      try {
        const url    = isEdit
          ? `/admin/variants/${variantIdField.value}`
          : `/admin/variants/product/${PRODUCT_ID}`;
        const method = isEdit ? 'PUT' : 'POST';

        const res  = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!data.success) {
          showFormError(data.message || 'Could not save variant.');
          return;
        }

        const v = data.variant;

        if (isEdit) {
          const existingRow = tbody ? tbody.querySelector(`tr[data-variant-id="${v._id}"]`) : null;
          if (existingRow) {
            existingRow.outerHTML = buildRow(v);
            bindRowButtons();
          }
        } else {
          // Remove the empty-state row if present
          const emptyRow = tbody ? tbody.querySelector('tr.empty-state-row') : null;
          if (emptyRow) emptyRow.remove();
          if (tbody) tbody.insertAdjacentHTML('beforeend', buildRow(v));
          bindRowButtons();
          // Update the "Showing X of Y" count
          const showingEl = document.querySelector('.showing-count strong:first-child');
          if (showingEl) showingEl.textContent = tbody.querySelectorAll('tr[data-variant-id]').length;
        }

        closeForm();
      } catch (err) {
        console.error('Save variant error:', err);
        showFormError('Server error saving variant. Please try again.');
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'UPDATE VARIANT' : 'SAVE VARIANT'; }
      }
    });
  }

  // ── Edit variant ─────────────────────────────────────────────────────────────
  function handleEditClick(btn) {
    btn.addEventListener('click', async function () {
      const id = btn.dataset.id;
      try {
        const res  = await fetch(`/admin/variants/${id}`);
        const data = await res.json();
        if (!data.success) { alert(data.message || 'Could not load variant.'); return; }

        const v = data.variant;
        if (variantIdField)  variantIdField.value  = v._id;
        if (nameInput)       nameInput.value        = v.variant_name  || '';
        if (concentInput)    concentInput.value      = v.concentration  || '';
        if (sizeInput)       sizeInput.value         = v.size_ml        || '';
        if (stockInput)      stockInput.value        = v.quantity       || 0;
        if (priceInput)      priceInput.value        = Number(v.price).toFixed(2);
        if (activeCheck)     activeCheck.checked     = v.is_active !== false;
        openForm('edit');
      } catch (err) {
        console.error('Load variant error:', err);
        alert('Could not load variant data.');
      }
    });
  }

  // ── Delete variant ────────────────────────────────────────────────────────────
  function handleDeleteClick(btn) {
    btn.addEventListener('click', function () {
      pendingDeleteId = btn.dataset.id;
      if (deleteCodeEl) deleteCodeEl.textContent = btn.dataset.code || btn.dataset.id;
      if (deleteOverlay) deleteOverlay.classList.add('open');
    });
  }

  if (confirmDelBtn) {
    confirmDelBtn.addEventListener('click', async function () {
      if (!pendingDeleteId) return;
      confirmDelBtn.disabled = true;
      confirmDelBtn.textContent = 'Deleting…';

      try {
        const res  = await fetch(`/admin/variants/${pendingDeleteId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
          const row = tbody ? tbody.querySelector(`tr[data-variant-id="${pendingDeleteId}"]`) : null;
          if (row) {
            row.style.transition = 'opacity 0.3s';
            row.style.opacity = '0';
            setTimeout(function () {
              row.remove();
              refreshEmptyRow();
              // Update showing count
              const showingEl = document.querySelector('.showing-count strong:first-child');
              if (showingEl && tbody) showingEl.textContent = tbody.querySelectorAll('tr[data-variant-id]').length;
            }, 300);
          }
          closeDeleteModal();
        } else {
          alert(data.message || 'Could not delete variant.');
        }
      } catch (err) {
        console.error('Delete variant error:', err);
        alert('Server error deleting variant.');
      } finally {
        confirmDelBtn.disabled = false;
        confirmDelBtn.textContent = 'DELETE';
      }
    });
  }

  if (cancelDelBtn) cancelDelBtn.addEventListener('click', closeDeleteModal);
  if (deleteOverlay) {
    deleteOverlay.addEventListener('click', function (e) {
      if (e.target === deleteOverlay) closeDeleteModal();
    });
  }

  // ── Form close ────────────────────────────────────────────────────────────────
  if (cancelFormBtn) cancelFormBtn.addEventListener('click', closeForm);
  if (formOverlay) {
    formOverlay.addEventListener('click', function (e) {
      if (e.target === formOverlay) closeForm();
    });
  }

  // ── Variant search (client-side live filter) ─────────────────────────────────
  if (variantSearch && tbody) {
    variantSearch.addEventListener('input', function () {
      const q = variantSearch.value.toLowerCase().trim();
      tbody.querySelectorAll('tr[data-variant-id]').forEach(function (row) {
        const text = row.textContent.toLowerCase();
        row.style.display = !q || text.includes(q) ? '' : 'none';
      });
    });
  }

  // ── Bind row-level buttons (called on initial load + after DOM changes) ───────
  function bindRowButtons() {
    if (!tbody) return;
    tbody.querySelectorAll('.edit-variant-btn').forEach(function (btn) {
      // Remove previous listener to avoid doubles (clone trick)
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      handleEditClick(fresh);
    });
    tbody.querySelectorAll('.delete-variant-btn').forEach(function (btn) {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      handleDeleteClick(fresh);
    });
  }

  // Initial bind on page load
  bindRowButtons();
  refreshEmptyRow();
})();
