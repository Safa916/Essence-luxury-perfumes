/**
 * public/admin/js/productForm.js
 *
 * Handles the image upload UX for Add Product and Edit Product forms:
 *  1. "Select Files" / drag-and-drop triggers the hidden <input type="file">
 *  2. Each selected image is queued and shown one-by-one in the Cropper.js modal
 *  3. After cropping (or skipping), the cropped canvas blob is converted to a File
 *     and injected into a fresh <input type="file"> — one per image — so the form
 *     actually submits real files to the server (multer picks them all up).
 *  4. Preview thumbnails are rendered in the #imagePreviews grid.
 *  5. The image-count hint updates live and turns green when >= minImages are ready.
 *  6. In Edit mode the existing image removal (markImageForRemoval) is also here.
 *
 * Usage (in the EJS template):
 *   <script src="/admin/js/productForm.js" data-mode="add" data-min-images="3"></script>
 *   <script src="/admin/js/productForm.js" data-mode="edit" data-min-images="3"></script>
 */
(function () {
  'use strict';

  // ── Config read from the <script> tag ─────────────────────────────────────
  const scriptTag  = document.currentScript || document.querySelector('script[data-mode]');
  const MODE       = scriptTag ? (scriptTag.dataset.mode || 'add') : 'add';
  const MIN_IMAGES = scriptTag ? (parseInt(scriptTag.dataset.minImages, 10) || 3) : 3;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const fileInput      = document.getElementById('imagesInput');
  const previewsGrid   = document.getElementById('imagePreviews');
  const countHint      = document.getElementById('imageCountHint');
  const dropzone       = document.querySelector('.dropzone');

  // Cropper modal elements
  const cropperOverlay  = document.getElementById('cropperOverlay');
  const cropperImg      = document.getElementById('cropperImage');
  const cropperCountEl  = document.getElementById('cropperCount');
  const cropperConfirm  = document.getElementById('cropperConfirmBtn');
  const cropperSkip     = document.getElementById('cropperSkipBtn');
  const cropperZoomIn   = document.getElementById('cropperZoomIn');
  const cropperZoomOut  = document.getElementById('cropperZoomOut');
  const cropperRotate   = document.getElementById('cropperRotate');
  const aspectBtns      = document.querySelectorAll('.aspect-btn');

  // ── Allowed image types (MIME + extension whitelist) ────────────────────
  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

  // ── State ─────────────────────────────────────────────────────────────────
  let cropper         = null;   // active Cropper.js instance
  let fileQueue       = [];     // raw File objects waiting to be cropped
  let queueIndex      = 0;      // which file we're currently showing
  let croppedFiles    = [];     // final File objects ready for submission
  let removedImages   = [];     // edit mode: URLs of existing images to delete

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Returns true if the file passes both MIME type AND extension checks.
   * Checking both prevents a renamed file (e.g. "virus.exe" renamed to
   * "photo.jpg") slipping through on the extension alone.
   */
  function isValidImageFile(file) {
    const mimeOk = ALLOWED_MIME_TYPES.includes(file.type);
    const ext    = ('.' + file.name.split('.').pop()).toLowerCase();
    const extOk  = ALLOWED_EXTENSIONS.includes(ext);
    return mimeOk && extOk;
  }

  /**
   * Shows a dismissible error banner above the dropzone listing rejected files.
   * If a banner already exists it is replaced, not duplicated.
   */
  function showFileTypeError(rejectedNames) {
    const aside = document.querySelector('.form-media');
    if (!aside) return;

    // Remove any existing banner
    const existing = aside.querySelector('.file-type-error-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'file-type-error-banner';
    banner.innerHTML = `
      <span class="file-type-error-icon">⚠</span>
      <span>
        <strong>Invalid file type rejected:</strong><br>
        ${rejectedNames.map(n => `<em>${n}</em>`).join(', ')}<br>
        <small>Allowed types: JPG, PNG, WebP, GIF</small>
      </span>
      <button type="button" class="file-type-error-close" aria-label="Dismiss">✕</button>
    `;
    banner.querySelector('.file-type-error-close').addEventListener('click', function () {
      banner.remove();
    });
    // Auto-dismiss after 6 seconds
    setTimeout(function () { if (banner.parentNode) banner.remove(); }, 6000);

    aside.insertBefore(banner, aside.firstChild);
  }

  function countNewSlots() {
    return previewsGrid ? previewsGrid.querySelectorAll('.preview-slot:not(.empty)').length : 0;
  }

  function existingCount() {
    if (MODE !== 'edit') return 0;
    const existing = document.querySelectorAll('.existing-image:not(.removed)').length;
    return existing;
  }

  function totalImageCount() {
    return existingCount() + countNewSlots();
  }

  function updateCountHint() {
    if (!countHint) return;
    const total = totalImageCount();
    if (total >= MIN_IMAGES) {
      countHint.textContent = `${total} image${total !== 1 ? 's' : ''} selected ✓`;
      countHint.classList.add('ok');
      countHint.classList.remove('warn');
    } else {
      countHint.textContent = `${total} of ${MIN_IMAGES} minimum images selected`;
      countHint.classList.remove('ok', 'warn');
    }
  }

  // Replace the empty placeholder slots with real thumbs (add mode only)
  function initEmptySlots() {
    if (!previewsGrid || MODE === 'edit') return;
    // Slots are already in the HTML for add mode — keep them as-is
  }

  // Add a thumbnail to the previews grid
  function addPreviewThumb(file, objectUrl) {
    if (!previewsGrid) return;

    // Fill in the first empty slot if any, otherwise append a new one
    const emptySlot = previewsGrid.querySelector('.preview-slot.empty');
    const slot = emptySlot || document.createElement('div');

    if (!emptySlot) {
      slot.className = 'preview-slot';
      previewsGrid.appendChild(slot);
    } else {
      slot.classList.remove('empty');
    }

    slot.innerHTML = `
      <img src="${objectUrl}" alt="preview" style="width:100%;height:100%;object-fit:cover;display:block;">
      <button type="button" class="preview-remove" title="Remove">✕</button>
    `;

    // Remove button
    slot.querySelector('.preview-remove').addEventListener('click', function () {
      const idx = croppedFiles.indexOf(file);
      if (idx !== -1) croppedFiles.splice(idx, 1);

      // Also remove the matching hidden file input
      const inputs = document.querySelectorAll('input[type="file"][data-cropped="true"]');
      if (inputs[idx]) inputs[idx].remove();

      slot.remove();
      // Restore an empty placeholder if we dropped below the min
      if (countNewSlots() < MIN_IMAGES && MODE === 'add') {
        const empty = document.createElement('div');
        empty.className = 'preview-slot empty';
        empty.textContent = '+';
        previewsGrid.appendChild(empty);
      }
      URL.revokeObjectURL(objectUrl);
      updateCountHint();
    });

    updateCountHint();
  }

  // Inject the cropped File as a hidden file input so multer picks it up
  function injectFileInput(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    const inp = document.createElement('input');
    inp.type  = 'file';
    inp.name  = 'images';
    inp.style.display = 'none';
    inp.dataset.cropped = 'true';
    inp.files = dt.files;
    document.querySelector('.product-form').appendChild(inp);
  }

  // ── Cropper pipeline ──────────────────────────────────────────────────────

  function destroyCropper() {
    if (cropper) { cropper.destroy(); cropper = null; }
    if (cropperImg) { cropperImg.src = ''; }
  }

  function closeCropperModal() {
    destroyCropper();
    if (cropperOverlay) cropperOverlay.classList.remove('open');
  }

  function processNextInQueue() {
    if (queueIndex >= fileQueue.length) {
      // Done — clear queue
      fileQueue  = [];
      queueIndex = 0;
      closeCropperModal();
      updateCountHint();
      return;
    }

    const file   = fileQueue[queueIndex];
    const reader = new FileReader();

    if (cropperCountEl) {
      cropperCountEl.textContent = `Image ${queueIndex + 1} of ${fileQueue.length}`;
    }

    reader.onload = function (e) {
      if (!cropperImg) return;

      // Open the modal first so the image element is visible and has
      // layout dimensions before Cropper.js tries to measure it.
      if (cropperOverlay) cropperOverlay.classList.add('open');

      // Destroy any previous Cropper instance before changing the src.
      destroyCropper();

      // Initialize Cropper.js INSIDE the image onload so that the browser
      // has fully decoded and painted the image before Cropper measures it.
      // Using setTimeout or setting src before onload causes a black canvas.
      cropperImg.onload = function () {
        if (typeof Cropper === 'undefined') {
          console.warn('Cropper.js not loaded — skipping crop');
          finishCurrentImage(null);
          return;
        }
        cropper = new Cropper(cropperImg, {
          aspectRatio:  1,
          viewMode:     1,
          autoCropArea: 0.85,
          responsive:   true,
        });
      };

      cropperImg.src = e.target.result;
    };

    reader.readAsDataURL(file);
  }

  function finishCurrentImage(canvasOrNull) {
    const file = fileQueue[queueIndex];
    queueIndex++;

    function proceed(blob, filename) {
      const croppedFile = new File([blob], filename, { type: 'image/jpeg' });
      croppedFiles.push(croppedFile);
      injectFileInput(croppedFile);
      const url = URL.createObjectURL(croppedFile);
      addPreviewThumb(croppedFile, url);
      processNextInQueue();
    }

    if (canvasOrNull) {
      // Get the cropped image as a Blob at 88% JPEG quality
      canvasOrNull.toBlob(function (blob) {
        proceed(blob, file.name.replace(/\.[^.]+$/, '') + '-cropped.jpg');
      }, 'image/jpeg', 0.88);
    } else {
      // Skip — use original file as-is
      const url = URL.createObjectURL(file);
      croppedFiles.push(file);
      injectFileInput(file);
      addPreviewThumb(file, url);
      processNextInQueue();
    }
  }

  // ── Cropper buttons ───────────────────────────────────────────────────────

  if (cropperConfirm) {
    cropperConfirm.addEventListener('click', function () {
      if (!cropper) { finishCurrentImage(null); return; }
      const canvas = cropper.getCroppedCanvas({ maxWidth: 1200, maxHeight: 1200 });
      finishCurrentImage(canvas);
    });
  }

  if (cropperSkip) {
    cropperSkip.addEventListener('click', function () {
      finishCurrentImage(null);
    });
  }

  if (cropperZoomIn)  cropperZoomIn.addEventListener('click',  function () { if (cropper) cropper.zoom(0.1); });
  if (cropperZoomOut) cropperZoomOut.addEventListener('click', function () { if (cropper) cropper.zoom(-0.1); });
  if (cropperRotate)  cropperRotate.addEventListener('click',  function () { if (cropper) cropper.rotate(90); });

  aspectBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      aspectBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (cropper) {
        const ratio = parseFloat(btn.dataset.ratio);
        cropper.setAspectRatio(ratio === 0 ? NaN : ratio);
      }
    });
  });

  // ── File input change ─────────────────────────────────────────────────────

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      const allFiles     = Array.from(fileInput.files);
      const validFiles   = [];
      const rejectedNames = [];

      allFiles.forEach(function (f) {
        if (isValidImageFile(f)) {
          validFiles.push(f);
        } else {
          rejectedNames.push(f.name);
        }
      });

      // Reset the native input so the same file can be re-selected after removal
      fileInput.value = '';

      if (rejectedNames.length) {
        showFileTypeError(rejectedNames);
      }

      if (!validFiles.length) return;

      fileQueue  = validFiles;
      queueIndex = 0;
      processNextInQueue();
    });
  }

  // ── Drag & drop on the dropzone ───────────────────────────────────────────
  if (dropzone) {
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.style.borderColor = '#111';
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.style.borderColor = '';
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.style.borderColor = '';
      const allFiles      = Array.from(e.dataTransfer.files);
      const validFiles    = [];
      const rejectedNames = [];

      allFiles.forEach(function (f) {
        if (isValidImageFile(f)) {
          validFiles.push(f);
        } else {
          rejectedNames.push(f.name);
        }
      });

      if (rejectedNames.length) {
        showFileTypeError(rejectedNames);
      }

      if (!validFiles.length) return;
      fileQueue  = validFiles;
      queueIndex = 0;
      processNextInQueue();
    });
  }

  // ── Edit mode: mark existing image for removal ────────────────────────────
  // Called from the inline onclick="markImageForRemoval(this, url)" in editProduct.ejs
  window.markImageForRemoval = function (btn, imageUrl) {
    const container = btn.closest('.existing-image');
    if (!container) return;
    container.classList.add('removed');
    container.style.opacity = '0.3';
    btn.disabled = true;

    if (!removedImages.includes(imageUrl)) removedImages.push(imageUrl);

    const inp = document.getElementById('removedImagesInput');
    if (inp) inp.value = removedImages.join(',');

    updateCountHint();
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  initEmptySlots();
  updateCountHint();
})();
