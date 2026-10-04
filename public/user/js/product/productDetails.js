(function () {
  // ===== Thumbnail switching =====
  const mainImage = document.getElementById('mainImage');
  const thumbs = document.querySelectorAll('.thumb-btn');

  thumbs.forEach((btn) => {
    btn.addEventListener('click', () => {
      thumbs.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      mainImage.src = btn.dataset.image;
    });
  });

  // ===== Hover zoom — the lens itself shows a magnified crop (desktop only) =====
  const galleryMain = document.getElementById('galleryMain');
  const lens = document.getElementById('zoomLens');
  const ZOOM_FACTOR = 2.4;

  if (galleryMain && lens && mainImage) {
    galleryMain.addEventListener('mousemove', (e) => {
      if (window.innerWidth < 900) return;

      const rect = galleryMain.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;
      const lensSize = lens.offsetWidth;

      x = Math.max(lensSize / 2, Math.min(x, rect.width - lensSize / 2));
      y = Math.max(lensSize / 2, Math.min(y, rect.height - lensSize / 2));

      lens.style.left = `${x - lensSize / 2}px`;
      lens.style.top = `${y - lensSize / 2}px`;
      lens.style.display = 'block';

      // This is the part that was missing — actually paint a zoomed
      // crop of the image inside the lens box itself.
      lens.style.backgroundImage = `url('${mainImage.src}')`;
      lens.style.backgroundRepeat = 'no-repeat';
      lens.style.backgroundSize = `${rect.width * ZOOM_FACTOR}px ${rect.height * ZOOM_FACTOR}px`;
      const bgX = -(x - lensSize / 2) * ZOOM_FACTOR;
      const bgY = -(y - lensSize / 2) * ZOOM_FACTOR;
      lens.style.backgroundPosition = `${bgX}px ${bgY}px`;
    });

    galleryMain.addEventListener('mouseleave', () => {
      lens.style.display = 'none';
    });
  }

  // ===== Lightbox (click to zoom — works on mobile too) =====
  const lightboxOverlay = document.getElementById('lightboxOverlay');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxClose = document.getElementById('lightboxClose');

  function openLightbox() {
    lightboxImage.src = mainImage.src;
    lightboxOverlay.classList.add('is-open');
  }

  function closeLightbox() {
    lightboxOverlay.classList.remove('is-open');
  }

  if (mainImage) mainImage.addEventListener('click', openLightbox);
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxOverlay) {
    lightboxOverlay.addEventListener('click', (e) => {
      if (e.target === lightboxOverlay) closeLightbox();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // ===== Size selector — live price + stock state =====
  const sizeButtons = document.querySelectorAll('.size-btn');
  const priceRow = document.getElementById('priceRow');
  const sizeStockNote = document.getElementById('sizeStockNote');
  const addToBagBtn = document.getElementById('addToBagBtn');
  const buyNowBtn = document.getElementById('buyNowBtn');

  function formatINR(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN');
  }

  function selectVariant(btn) {
    sizeButtons.forEach((b) => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');

    const price = parseFloat(btn.dataset.price);
    const compare = btn.dataset.compare ? parseFloat(btn.dataset.compare) : null;
    const stock = parseInt(btn.dataset.stock, 10);

    let html = `<span class="price-current" id="priceCurrent">${formatINR(price)}</span>`;
    if (compare && compare > price) {
      html += `<span class="price-compare" id="priceCompare">${formatINR(compare)}</span>`;
    }
    priceRow.innerHTML = html;

    const outOfStockForThisSize = stock <= 0;
    sizeStockNote.style.display = outOfStockForThisSize ? 'block' : 'none';

    if (addToBagBtn) {
      addToBagBtn.disabled = outOfStockForThisSize;
      addToBagBtn.textContent = outOfStockForThisSize ? 'Out of Stock' : 'Add to Atelier Bag';
    }
    if (buyNowBtn) {
      buyNowBtn.disabled = outOfStockForThisSize;
    }
  }

  sizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-disabled')) return;
      selectVariant(btn);
    });
  });

  // ===== Add to bag (stub — wired up fully in the Cart Management phase) =====
  if (addToBagBtn) {
    addToBagBtn.addEventListener('click', () => {
      if (addToBagBtn.disabled) return;
      console.log('Add to cart:', addToBagBtn.dataset.productId);
    });
  }

  if (buyNowBtn) {
    buyNowBtn.addEventListener('click', () => {
      if (buyNowBtn.disabled) return;
      console.log('Buy now clicked');
    });
  }

  // ===== Wishlist toggle on product detail page =====
  const wishlistDetailBtn = document.getElementById('wishlistDetailBtn');
  const wishlistDetailLabel = document.getElementById('wishlistDetailLabel');

  if (wishlistDetailBtn) {
    wishlistDetailBtn.addEventListener('click', async () => {
      // Redirect guests to login
      if (typeof window.IS_LOGGED_IN !== 'undefined' && !window.IS_LOGGED_IN) {
        window.location.href = '/auth/login';
        return;
      }

      const productId = wishlistDetailBtn.dataset.productId;
      const isWishlisted = wishlistDetailBtn.classList.contains('is-wishlisted');
      const svg = wishlistDetailBtn.querySelector('svg');

      // Optimistic UI flip
      if (isWishlisted) {
        wishlistDetailBtn.classList.remove('is-wishlisted');
        if (svg) svg.setAttribute('fill', 'none');
        wishlistDetailBtn.setAttribute('aria-label', 'Add to wishlist');
        if (wishlistDetailLabel) wishlistDetailLabel.textContent = 'Add to Wishlist';
      } else {
        wishlistDetailBtn.classList.add('is-wishlisted');
        if (svg) svg.setAttribute('fill', 'currentColor');
        wishlistDetailBtn.setAttribute('aria-label', 'Remove from wishlist');
        if (wishlistDetailLabel) wishlistDetailLabel.textContent = 'Wishlisted';
      }

      try {
        let res, data;
        if (isWishlisted) {
          res = await fetch(`/wishlist/remove-by-product/${productId}`, { method: 'DELETE' });
          data = await res.json();
        } else {
          res = await fetch('/wishlist/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId }),
          });
          data = await res.json();
          if (data.redirect) { window.location.href = data.redirect; return; }
        }

        if (!data.success && !data.alreadyExists) {
          // Revert on failure
          if (isWishlisted) {
            wishlistDetailBtn.classList.add('is-wishlisted');
            if (svg) svg.setAttribute('fill', 'currentColor');
            wishlistDetailBtn.setAttribute('aria-label', 'Remove from wishlist');
            if (wishlistDetailLabel) wishlistDetailLabel.textContent = 'Wishlisted';
          } else {
            wishlistDetailBtn.classList.remove('is-wishlisted');
            if (svg) svg.setAttribute('fill', 'none');
            wishlistDetailBtn.setAttribute('aria-label', 'Add to wishlist');
            if (wishlistDetailLabel) wishlistDetailLabel.textContent = 'Add to Wishlist';
          }
          alert(data.message || 'Could not update wishlist.');
        }
      } catch (err) {
        console.error('wishlist toggle error:', err);
        // Revert on network error
        if (isWishlisted) {
          wishlistDetailBtn.classList.add('is-wishlisted');
          if (svg) svg.setAttribute('fill', 'currentColor');
          if (wishlistDetailLabel) wishlistDetailLabel.textContent = 'Wishlisted';
        } else {
          wishlistDetailBtn.classList.remove('is-wishlisted');
          if (svg) svg.setAttribute('fill', 'none');
          if (wishlistDetailLabel) wishlistDetailLabel.textContent = 'Add to Wishlist';
        }
      }
    });
  }
})();