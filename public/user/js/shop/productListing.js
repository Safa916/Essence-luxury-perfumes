(function () {
  const gridWrapper = document.getElementById('productGridWrapper');
  const resultsSection = document.querySelector('.shop-results');
  const searchInput = document.getElementById('shopSearchInput');
  const searchClearBtn = document.getElementById('shopSearchClearBtn');
  const searchBtn = document.getElementById('shopSearchBtn');
  const sortSelect = document.getElementById('sortSelect');
  const filterForm = document.getElementById('filterForm');
  const applyFiltersBtn = document.getElementById('applyFiltersBtn');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');

  const minRange = document.getElementById('priceMinRange');
  const maxRange = document.getElementById('priceMaxRange');
  const minPriceInput = document.getElementById('minPriceInput');
  const maxPriceInput = document.getElementById('maxPriceInput');
  const minPriceLabel = document.getElementById('priceMinLabel');
  const maxPriceLabel = document.getElementById('priceMaxLabel');

  let currentState = {
    search: searchInput ? searchInput.value : '',
    sort: sortSelect ? sortSelect.value : 'newest',
    category: getCheckedValues('category'),
    brand: getCheckedValues('brand'),
    concentration: getCheckedValues('concentration'),
    size: getCheckedValues('size'),
    minPrice: minPriceInput ? minPriceInput.value : '',
    maxPrice: maxPriceInput ? maxPriceInput.value : '',
    page: 1,
  };

  let debounceTimer = null;

  function getCheckedValues(name) {
    if (!filterForm) return [];
    return Array.from(filterForm.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
  }

  function buildQueryString(state) {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.sort && state.sort !== 'newest') params.set('sort', state.sort);
    if (state.category.length) params.set('category', state.category.join(','));
    if (state.brand.length) params.set('brand', state.brand.join(','));
    if (state.concentration.length) params.set('concentration', state.concentration.join(','));
    if (state.size.length) params.set('size', state.size.join(','));
    if (state.minPrice) params.set('minPrice', state.minPrice);
    if (state.maxPrice) params.set('maxPrice', state.maxPrice);
    if (state.page && state.page > 1) params.set('page', state.page);
    return params.toString();
  }

  async function fetchProducts(pushHistory = true) {
    if (resultsSection) resultsSection.classList.add('is-loading');

    const qs = buildQueryString(currentState);

    try {
      const res = await fetch(`/shop/products${qs ? `?${qs}` : ''}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const data = await res.json();

      if (data.success && gridWrapper) {
        gridWrapper.innerHTML = data.html;
        bindGridEvents();
      }

      if (pushHistory) {
        const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
        window.history.pushState({}, '', newUrl);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      if (resultsSection) resultsSection.classList.remove('is-loading');
    }
  }

  // ---- Search (debounced, with cancel/clear) ----
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchClearBtn.style.display = searchInput.value ? 'inline-flex' : 'none';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentState.search = searchInput.value.trim();
        currentState.page = 1;
        fetchProducts();
      }, 400);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(debounceTimer);
        currentState.search = searchInput.value.trim();
        currentState.page = 1;
        fetchProducts();
      }
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentState.search = searchInput.value.trim();
      currentState.page = 1;
      fetchProducts();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      currentState.search = '';
      currentState.page = 1;
      fetchProducts();
    });
  }

  // ---- Sort ----
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentState.sort = sortSelect.value;
      currentState.page = 1;
      fetchProducts();
    });
  }

  // ---- Price range slider (two-thumb) ----
  function syncPriceLabels() {
    if (!minRange || !maxRange) return;
    let minVal = parseInt(minRange.value, 10);
    let maxVal = parseInt(maxRange.value, 10);
    if (minVal > maxVal) {
      [minVal, maxVal] = [maxVal, minVal];
    }
    minPriceLabel.textContent = `₹${minVal.toLocaleString('en-IN')}`;
    maxPriceLabel.textContent = `₹${maxVal.toLocaleString('en-IN')}`;
    minPriceInput.value = minVal;
    maxPriceInput.value = maxVal;
  }

  if (minRange && maxRange) {
    minRange.addEventListener('input', syncPriceLabels);
    maxRange.addEventListener('input', syncPriceLabels);
  }

  // ---- Apply / Clear filters ----
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', () => {
      currentState.category = getCheckedValues('category');
      currentState.brand = getCheckedValues('brand');
      currentState.concentration = getCheckedValues('concentration');
      currentState.size = getCheckedValues('size');
      currentState.minPrice = minPriceInput ? minPriceInput.value : '';
      currentState.maxPrice = maxPriceInput ? maxPriceInput.value : '';
      currentState.page = 1;
      fetchProducts();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      filterForm.querySelectorAll('input[type="checkbox"]').forEach((el) => { el.checked = false; });
      if (minRange && maxRange) {
        minRange.value = minRange.min;
        maxRange.value = maxRange.max;
        syncPriceLabels();
      }
      currentState.category = [];
      currentState.brand = [];
      currentState.concentration = [];
      currentState.size = [];
      currentState.minPrice = '';
      currentState.maxPrice = '';
      currentState.page = 1;
      fetchProducts();
    });
  }

  // ---- Helpers shared by cart + wishlist actions ----
  function updateCartBadge(count) {
    const badge = document.getElementById('cartCountBadge');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  function requireLoginOrRedirect() {
    if (window.IS_LOGGED_IN) return true;
    window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    return false;
  }

  // ---- Pagination + grid-scoped buttons (delegated, since grid is re-rendered) ----
  function bindGridEvents() {
    document.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        currentState.page = parseInt(btn.dataset.page, 10);
        fetchProducts();
        if (resultsSection) resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    const clearAllBtn = document.getElementById('clearAllFiltersBtn');
    if (clearAllBtn && clearFiltersBtn) {
      clearAllBtn.addEventListener('click', () => clearFiltersBtn.click());
    }

    // ===== Add to bag =====
 
      document.querySelectorAll('.add-to-bag-btn').forEach((btn) => {
  
  if (btn.tagName === 'A') return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    if (!requireLoginOrRedirect()) return;
        const variantId = btn.dataset.defaultVariantId;
        if (!variantId) {
          essToast('This product has no available size right now.', 'warning');
          return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Adding...';

        try {
          const res = await fetch('/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: btn.dataset.productId, variant_id: variantId, quantity: 1 }),
          });
          const data = await res.json();

          if (data.redirect) {
            window.location.href = data.redirect;
            return;
          }
          if (!data.success) {
            essToast(data.message || 'Could not add to bag.', 'error');
            btn.disabled = false;
            btn.textContent = originalText;
            return;
          }

          btn.textContent = 'Added ✓';
          updateCartBadge(data.itemCount);
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
          }, 1500);
        } catch (err) {
          console.error(err);
          essToast('Something went wrong adding this to your bag.', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });

    // ===== Wishlist heart toggle =====
    document.querySelectorAll('.wishlist-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation(); // prevent the parent <a> from navigating
        if (!requireLoginOrRedirect()) return;

        const productId = btn.dataset.productId;
        const isActive = btn.classList.contains('is-active');
        const svg = btn.querySelector('svg');

        // Optimistic UI — flip state immediately for snappiness
        if (isActive) {
          btn.classList.remove('is-active');
          if (svg) svg.setAttribute('fill', 'none');
          btn.setAttribute('aria-label', 'Add to wishlist');
        } else {
          btn.classList.add('is-active');
          if (svg) svg.setAttribute('fill', 'currentColor');
          btn.setAttribute('aria-label', 'Remove from wishlist');
        }

        try {
          let res, data;
          if (isActive) {
            res = await fetch(`/wishlist/remove-by-product/${productId}`, { method: 'DELETE' });
            data = await res.json();
            if (!data.success) {
              // Revert on failure
              btn.classList.add('is-active');
              if (svg) svg.setAttribute('fill', 'currentColor');
              btn.setAttribute('aria-label', 'Remove from wishlist');
              essToast(data.message || 'Could not remove from wishlist.', 'error');
            }
          } else {
            res = await fetch('/wishlist/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ product_id: productId }),
            });
            data = await res.json();
            if (data.redirect) {
              window.location.href = data.redirect;
              return;
            }
            if (!data.success) {
              // Revert on failure
              btn.classList.remove('is-active');
              if (svg) svg.setAttribute('fill', 'none');
              btn.setAttribute('aria-label', 'Add to wishlist');
              essToast(data.message || 'Could not add to wishlist.', 'error');
            }
          }
        } catch (err) {
          console.error(err);
          // Revert optimistic change
          if (isActive) {
            btn.classList.add('is-active');
            if (svg) svg.setAttribute('fill', 'currentColor');
            btn.setAttribute('aria-label', 'Remove from wishlist');
          } else {
            btn.classList.remove('is-active');
            if (svg) svg.setAttribute('fill', 'none');
            btn.setAttribute('aria-label', 'Add to wishlist');
          }
          essToast('Something went wrong updating your wishlist.', 'error');
        }
      });
    });
  }

  bindGridEvents();

  // =============================================
  //  MOBILE FILTER & SORT DRAWER SYSTEM
  // =============================================

  const mobileFilterBar  = document.getElementById('mobileFilterBar');
  const mobileFilterBtn  = document.getElementById('mobileFilterBtn');
  const mobileSortBtn    = document.getElementById('mobileSortBtn');
  const mobileSortLabel  = document.getElementById('mobileSortLabel');
  const mobileFilterCount = document.getElementById('mobileFilterCount');

  const filterDrawer     = document.getElementById('filterDrawer');
  const filterDrawerClose = document.getElementById('filterDrawerClose');
  const filterDrawerBody  = document.getElementById('filterDrawerBody');
  const drawerApplyBtn   = document.getElementById('drawerApplyBtn');
  const drawerClearBtn   = document.getElementById('drawerClearBtn');
  const drawerOverlay    = document.getElementById('filterDrawerOverlay');

  const sortDrawer       = document.getElementById('sortDrawer');
  const sortDrawerClose  = document.getElementById('sortDrawerClose');
  const sortOptionBtns   = document.querySelectorAll('.sort-option-btn');

  const activeChipsContainer = document.getElementById('activeFilterChips');

  // Sort label mapping
  const sortLabels = {
    newest:          'Curated',
    price_low_high:  'Price ↑',
    price_high_low:  'Price ↓',
    name_a_z:        'A – Z',
    name_z_a:        'Z – A',
  };

  // ---- Drawer open/close helpers ----
  function openDrawer(drawer) {
    closeAllDrawers();
    drawerOverlay.classList.add('is-open');
    drawer.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeAllDrawers() {
    drawerOverlay.classList.remove('is-open');
    if (filterDrawer) filterDrawer.classList.remove('is-open');
    if (sortDrawer)   sortDrawer.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // ---- Sync the sidebar filterForm into the drawer ----
  function syncFilterDrawer() {
    if (!filterDrawerBody || !filterForm) return;

    // Clone the filterForm's inner content (groups only, not the buttons)
    const groups = filterForm.querySelectorAll('.filter-group');
    filterDrawerBody.innerHTML = '';
    groups.forEach(group => {
      filterDrawerBody.appendChild(group.cloneNode(true));
    });

    // Sync checked states from the sidebar form into drawer
    ['category', 'brand', 'concentration', 'size'].forEach(name => {
      const checkedVals = getCheckedValues(name);
      filterDrawerBody.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.checked = checkedVals.includes(input.value);
      });
    });

    // Sync price slider values
    const drawerMinRange = filterDrawerBody.querySelector('#priceMinRange');
    const drawerMaxRange = filterDrawerBody.querySelector('#priceMaxRange');
    const drawerMinLabel = filterDrawerBody.querySelector('#priceMinLabel');
    const drawerMaxLabel = filterDrawerBody.querySelector('#priceMaxLabel');
    const drawerMinInput = filterDrawerBody.querySelector('#minPriceInput');
    const drawerMaxInput = filterDrawerBody.querySelector('#maxPriceInput');

    if (drawerMinRange && minRange) {
      drawerMinRange.value = minRange.value;
      if (drawerMinLabel) drawerMinLabel.textContent = minPriceLabel.textContent;
    }
    if (drawerMaxRange && maxRange) {
      drawerMaxRange.value = maxRange.value;
      if (drawerMaxLabel) drawerMaxLabel.textContent = maxPriceLabel.textContent;
    }
    if (drawerMinInput && minPriceInput) drawerMinInput.value = minPriceInput.value;
    if (drawerMaxInput && maxPriceInput) drawerMaxInput.value = maxPriceInput.value;

    // Wire up price range sliders inside drawer
    if (drawerMinRange && drawerMaxRange) {
      function syncDrawerPrice() {
        let minVal = parseInt(drawerMinRange.value, 10);
        let maxVal = parseInt(drawerMaxRange.value, 10);
        if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
        if (drawerMinLabel) drawerMinLabel.textContent = `₹${minVal.toLocaleString('en-IN')}`;
        if (drawerMaxLabel) drawerMaxLabel.textContent = `₹${maxVal.toLocaleString('en-IN')}`;
        if (drawerMinInput) drawerMinInput.value = minVal;
        if (drawerMaxInput) drawerMaxInput.value = maxVal;
      }
      drawerMinRange.addEventListener('input', syncDrawerPrice);
      drawerMaxRange.addEventListener('input', syncDrawerPrice);
    }
  }

  // ---- Count active filters ----
  function countActiveFilters() {
    let count = 0;
    ['category', 'brand', 'concentration', 'size'].forEach(name => {
      count += getCheckedValues(name).length;
    });
    const globalMin = minRange ? parseInt(minRange.min, 10) : 0;
    const globalMax = maxRange ? parseInt(maxRange.max, 10) : 0;
    const curMin = parseInt((minPriceInput ? minPriceInput.value : 0), 10);
    const curMax = parseInt((maxPriceInput ? maxPriceInput.value : 0), 10);
    if (curMin > globalMin || curMax < globalMax) count++;
    return count;
  }

  // ---- Update mobile filter count badge ----
  function updateFilterBadge() {
    if (!mobileFilterCount) return;
    const count = countActiveFilters();
    mobileFilterCount.textContent = count;
    mobileFilterCount.style.display = count > 0 ? 'inline-block' : 'none';
  }

  // ---- Render active filter chips (below toolbar) ----
  function renderActiveChips() {
    if (!activeChipsContainer) return;
    activeChipsContainer.innerHTML = '';

    const addChip = (label, onRemove) => {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.innerHTML = `${label}<span class="filter-chip-remove" aria-hidden="true">×</span>`;
      chip.addEventListener('click', () => {
        onRemove();
        updateFilterBadge();
        renderActiveChips();
        // Auto-apply on chip remove
        currentState.category      = getCheckedValues('category');
        currentState.brand         = getCheckedValues('brand');
        currentState.concentration = getCheckedValues('concentration');
        currentState.size          = getCheckedValues('size');
        currentState.minPrice      = minPriceInput ? minPriceInput.value : '';
        currentState.maxPrice      = maxPriceInput ? maxPriceInput.value : '';
        currentState.page          = 1;
        fetchProducts();
      });
      activeChipsContainer.appendChild(chip);
    };

    // Category chips
    filterForm && filterForm.querySelectorAll('input[name="category"]:checked').forEach(input => {
      const label = input.nextElementSibling ? input.nextElementSibling.textContent.trim() : input.value;
      addChip(label, () => { input.checked = false; });
    });

    // Brand chips
    filterForm && filterForm.querySelectorAll('input[name="brand"]:checked').forEach(input => {
      const label = input.nextElementSibling ? input.nextElementSibling.textContent.trim() : input.value;
      addChip(label, () => { input.checked = false; });
    });

    // Concentration chips
    filterForm && filterForm.querySelectorAll('input[name="concentration"]:checked').forEach(input => {
      addChip(input.value, () => { input.checked = false; });
    });

    // Size chips
    filterForm && filterForm.querySelectorAll('input[name="size"]:checked').forEach(input => {
      addChip(`${input.value}ml`, () => { input.checked = false; });
    });

    // Price chip
    const globalMin = minRange ? parseInt(minRange.min, 10) : 0;
    const globalMax = maxRange ? parseInt(maxRange.max, 10) : 0;
    const curMin = parseInt((minPriceInput ? minPriceInput.value : 0), 10);
    const curMax = parseInt((maxPriceInput ? maxPriceInput.value : 0), 10);
    if (curMin > globalMin || curMax < globalMax) {
      addChip(`₹${curMin.toLocaleString('en-IN')} – ₹${curMax.toLocaleString('en-IN')}`, () => {
        if (minRange && maxRange) {
          minRange.value = minRange.min;
          maxRange.value = maxRange.max;
          syncPriceLabels();
        }
      });
    }
  }

  // ---- Update sort label on mobile ----
  function updateMobileSortLabel(sortVal) {
    if (mobileSortLabel) {
      mobileSortLabel.textContent = sortLabels[sortVal] || 'Sort';
    }
    // Highlight active sort option
    sortOptionBtns.forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.sort === sortVal);
    });
  }

  // ---- Open filter drawer ----
  if (mobileFilterBtn) {
    mobileFilterBtn.addEventListener('click', () => {
      syncFilterDrawer();
      openDrawer(filterDrawer);
    });
  }

  // ---- Close filter drawer ----
  if (filterDrawerClose) {
    filterDrawerClose.addEventListener('click', closeAllDrawers);
  }

  // ---- Drawer Apply ----
  if (drawerApplyBtn) {
    drawerApplyBtn.addEventListener('click', () => {
      // Push drawer values back into the sidebar form
      if (filterForm && filterDrawerBody) {
        ['category', 'brand', 'concentration', 'size'].forEach(name => {
          const drawerChecked = Array.from(
            filterDrawerBody.querySelectorAll(`input[name="${name}"]:checked`)
          ).map(el => el.value);

          filterForm.querySelectorAll(`input[name="${name}"]`).forEach(input => {
            input.checked = drawerChecked.includes(input.value);
          });
        });

        // Push price
        const dMin = filterDrawerBody.querySelector('#minPriceInput');
        const dMax = filterDrawerBody.querySelector('#maxPriceInput');
        const dMinRange = filterDrawerBody.querySelector('#priceMinRange');
        const dMaxRange = filterDrawerBody.querySelector('#priceMaxRange');

        if (dMin && minPriceInput) {
          minPriceInput.value = dMin.value;
          if (minRange && dMinRange) minRange.value = dMinRange.value;
          if (minPriceLabel) minPriceLabel.textContent = `₹${parseInt(dMin.value, 10).toLocaleString('en-IN')}`;
        }
        if (dMax && maxPriceInput) {
          maxPriceInput.value = dMax.value;
          if (maxRange && dMaxRange) maxRange.value = dMaxRange.value;
          if (maxPriceLabel) maxPriceLabel.textContent = `₹${parseInt(dMax.value, 10).toLocaleString('en-IN')}`;
        }
      }

      currentState.category      = getCheckedValues('category');
      currentState.brand         = getCheckedValues('brand');
      currentState.concentration = getCheckedValues('concentration');
      currentState.size          = getCheckedValues('size');
      currentState.minPrice      = minPriceInput ? minPriceInput.value : '';
      currentState.maxPrice      = maxPriceInput ? maxPriceInput.value : '';
      currentState.page          = 1;

      closeAllDrawers();
      updateFilterBadge();
      renderActiveChips();
      fetchProducts();
    });
  }

  // ---- Drawer Clear ----
  if (drawerClearBtn) {
    drawerClearBtn.addEventListener('click', () => {
      if (filterDrawerBody) {
        filterDrawerBody.querySelectorAll('input[type="checkbox"]').forEach(el => { el.checked = false; });
        const dMinRange = filterDrawerBody.querySelector('#priceMinRange');
        const dMaxRange = filterDrawerBody.querySelector('#priceMaxRange');
        const dMinLabel = filterDrawerBody.querySelector('#priceMinLabel');
        const dMaxLabel = filterDrawerBody.querySelector('#priceMaxLabel');
        const dMinInput = filterDrawerBody.querySelector('#minPriceInput');
        const dMaxInput = filterDrawerBody.querySelector('#maxPriceInput');
        if (dMinRange) { dMinRange.value = dMinRange.min; if (dMinLabel) dMinLabel.textContent = `₹${parseInt(dMinRange.min, 10).toLocaleString('en-IN')}`; if (dMinInput) dMinInput.value = dMinRange.min; }
        if (dMaxRange) { dMaxRange.value = dMaxRange.max; if (dMaxLabel) dMaxLabel.textContent = `₹${parseInt(dMaxRange.max, 10).toLocaleString('en-IN')}`; if (dMaxInput) dMaxInput.value = dMaxRange.max; }
      }
    });
  }

  // ---- Open sort drawer ----
  if (mobileSortBtn) {
    mobileSortBtn.addEventListener('click', () => {
      updateMobileSortLabel(currentState.sort || 'newest');
      openDrawer(sortDrawer);
    });
  }

  // ---- Sort option selected ----
  sortOptionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sortVal = btn.dataset.sort;
      currentState.sort = sortVal;
      currentState.page = 1;
      if (sortSelect) sortSelect.value = sortVal;
      updateMobileSortLabel(sortVal);
      closeAllDrawers();
      fetchProducts();
    });
  });

  // ---- Close sort drawer ----
  if (sortDrawerClose) {
    sortDrawerClose.addEventListener('click', closeAllDrawers);
  }

  // ---- Overlay click closes any drawer ----
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', closeAllDrawers);
  }

  // ---- Init ----
  updateFilterBadge();
  renderActiveChips();
  updateMobileSortLabel(currentState.sort || 'newest');

  // Re-render chips after main apply/clear buttons too
  const origApply = applyFiltersBtn;
  if (origApply) {
    origApply.addEventListener('click', () => {
      setTimeout(() => { updateFilterBadge(); renderActiveChips(); }, 100);
    });
  }
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      setTimeout(() => { updateFilterBadge(); renderActiveChips(); }, 100);
    });
  }
})();