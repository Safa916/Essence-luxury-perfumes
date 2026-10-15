/**
 * Essence UI Utilities — essence-ui.js
 * Provides:
 *   window.essToast(message, type, duration)   — branded toast notifications
 *   window.essConfirm(message, onOk, onCancel) — branded confirm dialog
 */
(function () {

  /* ══════════════════════════════════════════════════════
     ICONS
  ══════════════════════════════════════════════════════ */
  const ICONS = {
    success: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M6 10.5l2.5 2.5L14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error:   `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.75" fill="currentColor"/></svg>`,
    warning: `<svg viewBox="0 0 20 20" fill="none"><path d="M9.134 3.408L2.27 15.25A1 1 0 003.136 17h13.728a1 1 0 00.866-1.5L10.866 3.408a1 1 0 00-1.732 0z" stroke="currentColor" stroke-width="1.5"/><path d="M10 8v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.75" fill="currentColor"/></svg>`,
    info:    `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.75" fill="currentColor"/></svg>`,
    confirm: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.75" fill="currentColor"/></svg>`,
  };

  /* ══════════════════════════════════════════════════════
     INJECT STYLES (once)
  ══════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('essence-ui-styles')) return;
    const s = document.createElement('style');
    s.id = 'essence-ui-styles';
    s.textContent = `
      /* ── Toast container ── */
      #essence-toast-container {
        position: fixed;
        top: 1.5rem;
        right: 1.5rem;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 360px;
        width: calc(100vw - 3rem);
        pointer-events: none;
      }

      /* ── Toast card ── */
      .ess-toast {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1rem 1rem 1rem 1.1rem;
        background: #fff;
        border: 1px solid #e8e2d9;
        border-left: 3px solid #a08b6e;
        box-shadow: 0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07);
        position: relative;
        overflow: hidden;
        pointer-events: all;
        transform: translateX(110%);
        opacity: 0;
        transition: transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease;
      }
      .ess-toast--visible  { transform: translateX(0); opacity: 1; }
      .ess-toast--leaving  { transform: translateX(110%); opacity: 0; transition: transform 0.28s ease-in, opacity 0.22s ease-in; }
      .ess-toast--success  { border-left-color: #5a7c5a; }
      .ess-toast--error    { border-left-color: #9e3d3d; }
      .ess-toast--warning  { border-left-color: #b08030; }
      .ess-toast--info     { border-left-color: #a08b6e; }

      .ess-toast__icon { flex-shrink:0; width:18px; height:18px; margin-top:1px; }
      .ess-toast--success .ess-toast__icon { color:#5a7c5a; }
      .ess-toast--error   .ess-toast__icon { color:#9e3d3d; }
      .ess-toast--warning .ess-toast__icon { color:#b08030; }
      .ess-toast--info    .ess-toast__icon { color:#a08b6e; }

      .ess-toast__msg {
        flex:1; font-family:'Jost',sans-serif;
        font-size:0.85rem; line-height:1.5; color:#2c2c2c; letter-spacing:0.01em;
      }
      .ess-toast__close {
        flex-shrink:0; background:none; border:none; font-size:1.1rem;
        line-height:1; color:#a0948a; cursor:pointer; padding:0; margin-top:-1px;
        transition:color 0.2s;
      }
      .ess-toast__close:hover { color:#2c2c2c; }

      .ess-toast__bar {
        position:absolute; bottom:0; left:0; height:2px; width:100%; opacity:0.3;
      }
      .ess-toast--success .ess-toast__bar { background:#5a7c5a; }
      .ess-toast--error   .ess-toast__bar { background:#9e3d3d; }
      .ess-toast--warning .ess-toast__bar { background:#b08030; }
      .ess-toast--info    .ess-toast__bar { background:#a08b6e; }

      /* ── Confirm dialog overlay ── */
      #ess-confirm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(20,16,12,0.52);
        backdrop-filter: blur(3px);
        z-index: 10100;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.22s ease;
        pointer-events: none;
      }
      #ess-confirm-overlay.ess-visible {
        opacity: 1;
        pointer-events: all;
      }

      /* ── Confirm dialog box ── */
      #ess-confirm-box {
        background: #fff;
        border: 1px solid #e4ddd4;
        max-width: 420px;
        width: calc(100vw - 2.5rem);
        padding: 2rem 2rem 1.75rem;
        box-shadow: 0 20px 60px rgba(0,0,0,0.18);
        transform: translateY(16px) scale(0.97);
        transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1);
        text-align: center;
      }
      #ess-confirm-overlay.ess-visible #ess-confirm-box {
        transform: translateY(0) scale(1);
      }

      #ess-confirm-icon {
        width: 44px; height: 44px;
        margin: 0 auto 1.1rem;
        color: #b08030;
      }

      #ess-confirm-msg {
        font-family: 'Jost', sans-serif;
        font-size: 0.9rem;
        line-height: 1.65;
        color: #3a3630;
        margin: 0 0 1.75rem;
        letter-spacing: 0.01em;
      }

      .ess-confirm-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
      }

      .ess-confirm-btn {
        flex: 1;
        max-width: 160px;
        padding: 0.7rem 1.2rem;
        font-family: 'Jost', sans-serif;
        font-size: 0.62rem;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        cursor: pointer;
        border: 1px solid;
        transition: background 0.2s ease, color 0.2s ease;
      }
      .ess-confirm-btn--ok {
        background: #1a1714;
        color: #fff;
        border-color: #1a1714;
      }
      .ess-confirm-btn--ok:hover {
        background: transparent;
        color: #1a1714;
      }
      .ess-confirm-btn--cancel {
        background: transparent;
        color: #6b675e;
        border-color: #cec9c0;
      }
      .ess-confirm-btn--cancel:hover {
        background: #f5f1eb;
        color: #1a1714;
        border-color: #b8b0a4;
      }

      @media (max-width:480px) {
        #ess-confirm-box { padding: 1.5rem 1.25rem 1.25rem; }
        .ess-confirm-btn { font-size: 0.58rem; padding: 0.65rem 0.8rem; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════ */
  function getToastContainer() {
    let c = document.getElementById('essence-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'essence-toast-container';
      c.setAttribute('role', 'region');
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(c);
    }
    return c;
  }

  function dismissToast(toast) {
    toast.classList.remove('ess-toast--visible');
    toast.classList.add('ess-toast--leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  /**
   * Show a branded toast notification.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {number} [duration=3800]
   */
  function essToast(message, type = 'info', duration = 3800) {
    injectStyles();
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `ess-toast ess-toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="ess-toast__icon">${ICONS[type] || ICONS.info}</span>
      <span class="ess-toast__msg">${message}</span>
      <button class="ess-toast__close" aria-label="Dismiss">&times;</button>
      <div class="ess-toast__bar"></div>
    `;
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('ess-toast--visible')));

    // Progress bar
    const bar = toast.querySelector('.ess-toast__bar');
    bar.style.transition = `width ${duration}ms linear`;
    setTimeout(() => { bar.style.width = '0%'; }, 50);

    let timer = setTimeout(() => dismissToast(toast), duration);

    toast.addEventListener('mouseenter', () => { clearTimeout(timer); bar.style.transition = 'none'; });
    toast.addEventListener('mouseleave', () => {
      const rem = 1500;
      bar.style.transition = `width ${rem}ms linear`;
      bar.style.width = '0%';
      timer = setTimeout(() => dismissToast(toast), rem);
    });
    toast.querySelector('.ess-toast__close').addEventListener('click', () => {
      clearTimeout(timer);
      dismissToast(toast);
    });
  }

  /* ══════════════════════════════════════════════════════
     CONFIRM DIALOG
  ══════════════════════════════════════════════════════ */
  let _overlay = null;

  function buildConfirmDOM() {
    if (_overlay) return;
    injectStyles();

    _overlay = document.createElement('div');
    _overlay.id = 'ess-confirm-overlay';
    _overlay.innerHTML = `
      <div id="ess-confirm-box" role="dialog" aria-modal="true" aria-labelledby="ess-confirm-msg">
        <svg id="ess-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"/>
        </svg>
        <p id="ess-confirm-msg"></p>
        <div class="ess-confirm-actions">
          <button class="ess-confirm-btn ess-confirm-btn--cancel" id="ess-confirm-cancel">Cancel</button>
          <button class="ess-confirm-btn ess-confirm-btn--ok"     id="ess-confirm-ok">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(_overlay);
  }

  /**
   * Show a branded confirm dialog (async, resolves true/false).
   * Can also accept legacy callbacks: essConfirm(msg, onOk, onCancel)
   *
   * @param {string} message
   * @param {Function} [onOk]
   * @param {Function} [onCancel]
   * @returns {Promise<boolean>}
   */
  function essConfirm(message, onOk, onCancel) {
    buildConfirmDOM();

    document.getElementById('ess-confirm-msg').textContent = message;

    return new Promise((resolve) => {
      const overlay  = _overlay;
      const okBtn    = document.getElementById('ess-confirm-ok');
      const cancelBtn = document.getElementById('ess-confirm-cancel');

      function close(result) {
        overlay.classList.remove('ess-visible');
        // Remove listeners
        okBtn.replaceWith(okBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        resolve(result);
        if (result && typeof onOk === 'function') onOk();
        if (!result && typeof onCancel === 'function') onCancel();
      }

      // Re-query after replaceWith
      document.getElementById('ess-confirm-ok').addEventListener('click', () => close(true));
      document.getElementById('ess-confirm-cancel').addEventListener('click', () => close(false));

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      }, { once: true });

      // Close on Escape
      function escHandler(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', escHandler); close(false); }
      }
      document.addEventListener('keydown', escHandler);

      overlay.classList.add('ess-visible');
      // Focus the cancel button for keyboard accessibility
      setTimeout(() => document.getElementById('ess-confirm-cancel').focus(), 100);
    });
  }

  /* ══════════════════════════════════════════════════════
     EXPOSE GLOBALLY
  ══════════════════════════════════════════════════════ */
  window.essToast   = essToast;
  window.essConfirm = essConfirm;

})();
