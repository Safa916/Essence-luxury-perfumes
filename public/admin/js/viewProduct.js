// Powers viewProduct.ejs — Add/Edit/Delete variant popups.

const PRODUCT_ID = window.__PRODUCT_ID__;

// ---- Add / Edit modal ----------------------------------------------------
const formOverlay = document.getElementById('variantFormOverlay');
const formTitle = document.getElementById('variantFormTitle');
const formSub = document.getElementById('variantFormSub');
const variantForm = document.getElementById('variantForm');
const variantIdField = document.getElementById('variantIdField');
const fConcentration = document.getElementById('variantConcentration');
const fName = document.getElementById('variantName');
const fSize = document.getElementById('variantSize');
const fStock = document.getElementById('variantStock');
const fPrice = document.getElementById('variantPrice');
const fActive = document.getElementById('variantActive');
const saveBtn = document.getElementById('saveVariantBtn');

function openAddVariantModal() {
  formTitle.textContent = 'ADD NEW VARIANT';
  formSub.textContent = `Configure specific attributes for this variant`;
  variantIdField.value = '';
  variantForm.reset();
  fActive.checked = true;
  saveBtn.textContent = 'SAVE VARIANT';
  formOverlay.classList.add('open');
}

async function openEditVariantModal(variantId) {
  formTitle.textContent = 'EDIT VARIANT';
  saveBtn.textContent = 'SAVE CHANGES';
  formOverlay.classList.add('open');

  const res = await fetch(`/admin/variants/single/${variantId}`);
  const data = await res.json();
  if (!data.success) {
    alert(data.message || 'Could not load variant');
    formOverlay.classList.remove('open');
    return;
  }
  const v = data.variant;
  formSub.textContent = `Update attributes for Variant ${v.sku}`;
  variantIdField.value = v._id;
  fName.value = v.variant_name || '';
  fConcentration.value = v.concentration || '';
  fSize.value = v.size_ml;
  fStock.value = v.quantity;
  fPrice.value = v.price; // already a plain number thanks to the toJSON transform
  fActive.checked = !!v.is_active;
}

function closeVariantFormModal() {
  formOverlay.classList.remove('open');
}

document.getElementById('openAddVariantBtn').addEventListener('click', openAddVariantModal);
document.getElementById('cancelVariantFormBtn').addEventListener('click', closeVariantFormModal);

document.querySelectorAll('.edit-variant-btn').forEach((btn) => {
  btn.addEventListener('click', () => openEditVariantModal(btn.dataset.id));
});

variantForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveBtn.disabled = true;

  const payload = {
    variant_name: fName.value,
    concentration: fConcentration.value,
    size_ml: fSize.value,
    quantity: fStock.value,
    price: fPrice.value,
    is_active: fActive.checked,
  };

  const editingId = variantIdField.value;
  const url = editingId ? `/admin/variants/${editingId}` : `/admin/variants/${PRODUCT_ID}`;
  const method = editingId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      window.location.reload();
    } else {
      alert(data.message || 'Could not save variant');
    }
  } catch (err) {
    alert('Network error while saving variant');
  } finally {
    saveBtn.disabled = false;
  }
});

// ---- Delete modal ---------------------------------------------------------
const deleteOverlay = document.getElementById('deleteVariantOverlay');
const deleteCodeEl = document.getElementById('deleteVariantCode');
const confirmDeleteBtn = document.getElementById('confirmDeleteVariantBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteVariantBtn');

let pendingDeleteVariantId = null;

document.querySelectorAll('.delete-variant-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    pendingDeleteVariantId = btn.dataset.id;
    deleteCodeEl.textContent = btn.dataset.code;
    deleteOverlay.classList.add('open');
  });
});

cancelDeleteBtn.addEventListener('click', () => {
  deleteOverlay.classList.remove('open');
  pendingDeleteVariantId = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
  if (!pendingDeleteVariantId) return;
  confirmDeleteBtn.disabled = true;
  try {
    const res = await fetch(`/admin/variants/${pendingDeleteVariantId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      window.location.reload();
    } else {
      alert(data.message || 'Could not delete variant');
    }
  } catch (err) {
    alert('Network error while deleting variant');
  } finally {
    confirmDeleteBtn.disabled = false;
  }
});

// ---- lightweight client-side search across the visible rows --------------
const searchInput = document.getElementById('variantSearch');
searchInput &&
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    document.querySelectorAll('#variantsTbody tr[data-variant-id]').forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
