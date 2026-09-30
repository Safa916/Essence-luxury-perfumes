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
          alert('This product has no available size right now.');
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
            alert(data.message || 'Could not add to bag.');
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
          alert('Something went wrong adding this to your bag.');
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
              alert(data.message || 'Could not remove from wishlist.');
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
              alert(data.message || 'Could not add to wishlist.');
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
          alert('Something went wrong updating your wishlist.');
        }
      });
    });
  }

  bindGridEvents();
})();