// Powers both addProduct.ejs and editProduct.ejs.
// Handles: file selection -> crop each image (Cropper.js) -> resize to a
// sane max dimension -> queue as a File -> live previews -> wires the final
// cropped files back onto the <input type="file" name="images"> via
// DataTransfer so the existing multipart form submit needs zero changes.

(function () {
  const scriptTag = document.currentScript;
  const MODE = (scriptTag && scriptTag.dataset.mode) || 'add';
  const MIN_IMAGES = parseInt((scriptTag && scriptTag.dataset.minImages) || '3', 10);
  const MAX_OUTPUT_DIMENSION = 1200; // client-side resize cap before upload

  const imagesInput = document.getElementById('imagesInput');
  const previewsEl = document.getElementById('imagePreviews');
  const hintEl = document.getElementById('imageCountHint');
  const removedImagesInput = document.getElementById('removedImagesInput');

  let queuedFiles = []; // File[] — already cropped & resized, ready to upload
  let cropQueue = []; // raw File[] waiting to be cropped, one at a time
  let removedExisting = [];

  // ---- existing-image removal (edit mode) ------------------------------
  window.markImageForRemoval = function (btn, url) {
    const wrap = btn.closest('.existing-image');
    if (!wrap) return;
    removedExisting.push(url);
    if (removedImagesInput) removedImagesInput.value = removedExisting.join(',');
    wrap.remove();
    updateHint();
  };

  function existingRemainingCount() {
    if (MODE !== 'edit') return 0;
    const total = window.__EXISTING_IMAGE_COUNT__ || 0;
    return Math.max(total - removedExisting.length, 0);
  }

  function updateHint() {
    const total = existingRemainingCount() + queuedFiles.length;
    if (!hintEl) return;
    hintEl.textContent =
      total >= MIN_IMAGES
        ? `${total} image${total === 1 ? '' : 's'} ready`
        : `${total} of ${MIN_IMAGES} minimum images selected`;
    hintEl.classList.toggle('ok', total >= MIN_IMAGES);
    hintEl.classList.toggle('warn', total < MIN_IMAGES);
  }

  // ---- previews ----------------------------------------------------------
  function renderPreviews() {
    if (!previewsEl) return;
    previewsEl.innerHTML = '';

    queuedFiles.forEach((file, idx) => {
      const slot = document.createElement('div');
      slot.className = 'preview-slot filled';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'preview-remove';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => {
        queuedFiles.splice(idx, 1);
        syncInputFiles();
        renderPreviews();
        updateHint();
      };
      slot.appendChild(img);
      slot.appendChild(removeBtn);
      previewsEl.appendChild(slot);
    });

    // pad with empty "+" slots up to at least 3 for the add-product look
    const minSlots = MODE === 'add' ? 3 : 0;
    for (let i = queuedFiles.length; i < minSlots; i++) {
      const empty = document.createElement('div');
      empty.className = 'preview-slot empty';
      empty.textContent = '+';
      previewsEl.appendChild(empty);
    }
  }

  // Pushes queuedFiles back onto the real <input type="file"> so the normal
  // multipart form submission just works, no fetch/AJAX rewiring needed.
  function syncInputFiles() {
    const dt = new DataTransfer();
    queuedFiles.forEach((f) => dt.items.add(f));
    imagesInput.files = dt.files;
  }

  // ---- Cropper.js flow -----------------------------------------------------
  const overlay = document.getElementById('cropperOverlay');
  const cropperImageEl = document.getElementById('cropperImage');
  const cropperCountEl = document.getElementById('cropperCount');
  const confirmBtn = document.getElementById('cropperConfirmBtn');
  const skipBtn = document.getElementById('cropperSkipBtn');
  const aspectBtns = document.querySelectorAll('.aspect-btn');
  const zoomInBtn = document.getElementById('cropperZoomIn');
  const zoomOutBtn = document.getElementById('cropperZoomOut');
  const rotateBtn = document.getElementById('cropperRotate');

  let cropperInstance = null;
  let cropQueueTotal = 0;

  function openCropperFor(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      cropperImageEl.src = e.target.result;
      overlay.classList.add('open');
      if (cropperInstance) cropperInstance.destroy();
      cropperInstance = new Cropper(cropperImageEl, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 0.9,
        background: false,
        responsive: true,
      });
      const remaining = cropQueue.length + 1;
      cropperCountEl.textContent = `${cropQueueTotal - remaining + 1} of ${cropQueueTotal}`;
    };
    reader.readAsDataURL(file);
  }

  function closeCropper() {
    overlay.classList.remove('open');
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
  }

  function processNextInQueue() {
    if (!cropQueue.length) {
      closeCropper();
      syncInputFiles();
      renderPreviews();
      updateHint();
      return;
    }
    const nextFile = cropQueue.shift();
    openCropperFor(nextFile);
  }

  aspectBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      aspectBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const ratio = parseFloat(btn.dataset.ratio);
      if (cropperInstance) cropperInstance.setAspectRatio(ratio || NaN);
    });
  });

  zoomInBtn && zoomInBtn.addEventListener('click', () => cropperInstance && cropperInstance.zoom(0.1));
  zoomOutBtn && zoomOutBtn.addEventListener('click', () => cropperInstance && cropperInstance.zoom(-0.1));
  rotateBtn && rotateBtn.addEventListener('click', () => cropperInstance && cropperInstance.rotate(90));

  skipBtn &&
    skipBtn.addEventListener('click', () => {
      processNextInQueue();
    });

  confirmBtn &&
    confirmBtn.addEventListener('click', () => {
      if (!cropperInstance) return;
      const canvas = cropperInstance.getCroppedCanvas({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        imageSmoothingQuality: 'high',
      });
      canvas.toBlob(
        (blob) => {
          const croppedFile = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' });
          queuedFiles.push(croppedFile);
          processNextInQueue();
        },
        'image/jpeg',
        0.9
      );
    });

  // ---- kick off: user selects files -> crop queue --------------------------
  imagesInput &&
    imagesInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      cropQueue = files.slice();
      cropQueueTotal = files.length;
      processNextInQueue();
      // clear the raw selection; the DataTransfer swap happens after cropping
      imagesInput.value = '';
    });

  updateHint();
  renderPreviews();
})();
