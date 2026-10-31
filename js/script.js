/**
 * AntriGo — Campus Canteen Pre-Order Dashboard
 * js/script.js  (v3)
 *
 * Modules:
 *  1. Greeting
 *  2. Navigation (sidebar section switching)
 *  3. Category filters + search
 *  4. Cart — add / remove / clear / totals (NO alert/confirm)
 *  5. Custom modal system (replaces all alert/confirm)
 *  6. Order receipt modal
 *  7. Order history
 *  8. Profile stats
 *  9. Bell notification dropdown
 * 10. Profile avatar click → Profile section
 * 11. Toast notification
 */

'use strict';

/* =================================================================
   CONSTANTS
================================================================= */
const SERVICE_FEE = 1000; // IDR

/* =================================================================
   STATE
================================================================= */

/**
 * cart — Map<itemId: string, { name, price, qty, emoji, colorClass }>
 */
const cart = new Map();

/**
 * orderHistory — Array of plain-object order snapshots
 * Each entry: { id, date, items: [{name, qty, lineTotal}], total }
 */
const orderHistory = [];

/** Currently active category filter */
let activeFilter = 'all';

/* =================================================================
   DOM REFERENCES
================================================================= */
// Greeting
const greetingEl = document.getElementById('greeting-text');

// Navigation
const navBtns      = document.querySelectorAll('.nav-btn[data-section]');
const pageSections = document.querySelectorAll('.page-section');

// Filters & grid
const filterChips  = document.querySelectorAll('.filter-chip');
const foodCards    = document.querySelectorAll('#food-grid .food-card');
const emptyState   = document.getElementById('empty-state');
const visibleCount = document.getElementById('visible-count');
const searchInput  = document.getElementById('search-input');

// Cart
const cartItemsEl   = document.getElementById('cart-items');
const cartEmptyMsg  = document.getElementById('cart-empty-msg');
const cartCountEl   = document.getElementById('cart-count');
const subtotalEl    = document.getElementById('subtotal-val');
const totalEl       = document.getElementById('total-val');
const serviceFeeRow = document.getElementById('service-fee-row');
const clearCartBtn  = document.getElementById('clear-cart-btn');
const checkoutBtn   = document.getElementById('checkout-btn');

// Modal (shared overlay)
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalBody    = document.getElementById('modal-body');
const modalFooter  = document.getElementById('modal-footer');
const modalClose   = document.getElementById('modal-close');

// History
const historyList  = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const historyCount = document.getElementById('history-count');

// Profile stats
const statOrders = document.getElementById('stat-orders');
const statSpent  = document.getElementById('stat-spent');

// Bell dropdown
const bellBtn       = document.getElementById('bell-btn');
const notifDropdown = document.getElementById('notif-dropdown');
const markAllRead   = document.getElementById('mark-all-read');

// Profile avatar
const profileAvatarBtn = document.getElementById('profile-avatar-btn');

// Logout
const logoutBtn = document.getElementById('logout-btn');

// Toast
const successToast = document.getElementById('success-toast');

/* =================================================================
   1. GREETING — time-aware
================================================================= */
function initGreeting() {
  if (!greetingEl) return;
  const hour = new Date().getHours();
  const phrase = hour < 12 ? 'Good morning'
               : hour < 17 ? 'Good afternoon'
               :              'Good evening';
  greetingEl.textContent = `${phrase}, Deandra! 👋`;
}

/* =================================================================
   2. NAVIGATION — sidebar section switching
================================================================= */

/**
 * Shows the section matching targetId, hides all others.
 * @param {string} targetId - matches `data-section` attribute values
 */
function switchSection(targetId) {
  navBtns.forEach(btn => {
    const active = btn.dataset.section === targetId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });

  pageSections.forEach(section => {
    const match = section.id === `section-${targetId}`;
    if (match) {
      section.removeAttribute('hidden');
    } else {
      section.setAttribute('hidden', '');
    }
  });
}

function initNavigation() {
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.section) switchSection(btn.dataset.section);
    });
  });

  // Logout — custom confirm modal (no native confirm())
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      openConfirmModal({
        title: '🚪 Logout',
        message: 'Are you sure you want to <strong>log out</strong>? Any unsaved cart items will be lost.',
        confirmLabel: 'Yes, Logout',
        confirmStyle: 'danger',
        onConfirm: () => {
          window.location.href = 'login.html';
        },
      });
    });
  }
}

/* =================================================================
   3. CATEGORY FILTERS + SEARCH
================================================================= */

/**
 * Shows/hides food cards based on the active category filter
 * and the current search term (combined filtering).
 * @param {string} filter - 'all' | 'meal' | 'snack' | 'drink' | 'dessert'
 */
function applyFilter(filter) {
  activeFilter = filter;
  const searchTerm = (searchInput?.value ?? '').toLowerCase().trim();
  let shown = 0;

  foodCards.forEach(card => {
    const matchesFilter = filter === 'all' || card.dataset.category === filter;
    const matchesSearch = card.dataset.name?.toLowerCase().includes(searchTerm) ?? true;
    const visible = matchesFilter && matchesSearch;

    visible ? card.removeAttribute('hidden') : card.setAttribute('hidden', '');
    if (visible) shown++;
  });

  if (visibleCount) {
    visibleCount.textContent = `${shown} item${shown !== 1 ? 's' : ''}`;
  }

  if (emptyState) {
    shown === 0
      ? emptyState.removeAttribute('hidden')
      : emptyState.setAttribute('hidden', '');
  }
}

function initFilters() {
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyFilter(chip.dataset.filter);
    });
  });
}

function initSearch() {
  searchInput?.addEventListener('input', () => applyFilter(activeFilter));
}

/* =================================================================
   4. CART LOGIC
================================================================= */

/**
 * Format as Indonesian Rupiah.
 * @param {number} n
 * @returns {string} "Rp 18.000"
 */
function formatRupiah(n) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

/**
 * Escapes HTML special chars to prevent XSS when inserting
 * data-attribute strings into innerHTML.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Calculates cart totals. */
function calcTotals() {
  let itemCount = 0, subtotal = 0;
  for (const [, item] of cart) {
    itemCount += item.qty;
    subtotal  += item.price * item.qty;
  }
  const total = subtotal > 0 ? subtotal + SERVICE_FEE : 0;
  return { itemCount, subtotal, total };
}

/**
 * Adds one unit to cart (or increments existing).
 */
function addToCart(id, name, price, emoji, colorClass) {
  if (cart.has(id)) {
    cart.get(id).qty++;
  } else {
    cart.set(id, { name, price, qty: 1, emoji, colorClass });
  }
  renderCart();
  syncCardControls(id);
  animateBadge();
}

/**
 * Removes one unit from cart; deletes entry if qty reaches 0.
 */
function removeFromCart(id) {
  if (!cart.has(id)) return;
  const item = cart.get(id);
  item.qty--;
  if (item.qty <= 0) cart.delete(id);
  renderCart();
  syncCardControls(id);
}

/**
 * Syncs the food card's +/− buttons and quantity label
 * to reflect the current cart state. Called after every mutation.
 * Explicitly hides − and clears qty when count is 0 (BUG FIX).
 * @param {string} id
 */
function syncCardControls(id) {
  const card    = document.querySelector(`.food-card[data-id="${id}"]`);
  if (!card) return;
  const minus   = card.querySelector('.btn-minus');
  const qtyVal  = card.querySelector('.card-qty-val');
  const qty     = cart.has(id) ? cart.get(id).qty : 0;

  if (minus) {
    // Explicitly toggle hidden attribute — fixes state mismatch bug
    if (qty > 0) {
      minus.removeAttribute('hidden');
    } else {
      minus.setAttribute('hidden', '');
    }
  }
  if (qtyVal) {
    qtyVal.textContent = qty > 0 ? String(qty) : '';
  }
}

/**
 * Resets ALL food card controls to qty 0 / hidden −.
 * Must be called on Clear All and after Checkout confirms.
 */
function resetAllCardControls() {
  foodCards.forEach(card => {
    const minus  = card.querySelector('.btn-minus');
    const qtyVal = card.querySelector('.card-qty-val');
    if (minus)  minus.setAttribute('hidden', '');
    if (qtyVal) qtyVal.textContent = '';
  });
}

/** Triggers badge bump animation. */
function animateBadge() {
  cartCountEl?.classList.remove('bump');
  void cartCountEl?.offsetWidth; // force reflow
  cartCountEl?.classList.add('bump');
}

/**
 * Full cart panel re-render.
 * Also manages visibility of service fee row (hidden when cart empty).
 */
function renderCart() {
  const { itemCount, subtotal, total } = calcTotals();

  // Badge
  if (cartCountEl) cartCountEl.textContent = itemCount;

  // Totals
  if (subtotalEl) subtotalEl.textContent = formatRupiah(subtotal);
  if (totalEl)    totalEl.textContent    = formatRupiah(total);

  // Service fee row — hide when cart empty (BUG FIX: was always shown)
  if (serviceFeeRow) {
    cart.size > 0
      ? serviceFeeRow.removeAttribute('hidden')
      : serviceFeeRow.setAttribute('hidden', '');
  }

  // Empty message + checkout button state
  if (cart.size === 0) {
    cartEmptyMsg?.removeAttribute('hidden');
    if (checkoutBtn) checkoutBtn.disabled = true;
  } else {
    cartEmptyMsg?.setAttribute('hidden', '');
    if (checkoutBtn) checkoutBtn.disabled = false;
  }

  // Remove existing rendered rows (keep empty msg)
  cartItemsEl?.querySelectorAll('.cart-item').forEach(el => el.remove());

  // Render one row per cart entry
  for (const [id, item] of cart) {
    const lineTotal = item.price * item.qty;
    const row = document.createElement('div');
    row.classList.add('cart-item');
    row.dataset.cartId = id;
    row.innerHTML = `
      <div class="cart-item__thumb ${escapeHtml(item.colorClass)}" aria-hidden="true">
        ${item.emoji}
      </div>
      <div class="cart-item__info">
        <p class="cart-item__name">${escapeHtml(item.name)}</p>
        <p class="cart-item__meta">${item.qty} × ${formatRupiah(item.price)}</p>
      </div>
      <span class="cart-item__price">${formatRupiah(lineTotal)}</span>
    `;
    cartItemsEl?.appendChild(row);
  }
}

/** Attaches delegated click listeners on the food grid and cart buttons. */
function initCartHandlers() {
  // Food grid — delegated handler for +/− buttons
  const grid = document.getElementById('food-grid');
  grid?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-qty');
    if (!btn) return;
    const card = btn.closest('.food-card');
    if (!card) return;

    const id         = card.dataset.id;
    const name       = card.dataset.name;
    const price      = parseInt(card.dataset.price, 10);
    const imgEl      = card.querySelector('.food-card__img');
    const emoji      = imgEl?.textContent?.trim() ?? '🍽️';
    const colorClass = [...(imgEl?.classList ?? [])].find(c => c.startsWith('food-card__img--')) ?? '';

    if (btn.classList.contains('btn-add')) {
      addToCart(id, name, price, emoji, colorClass);
    } else if (btn.classList.contains('btn-minus')) {
      removeFromCart(id);
    }
  });

  // Clear cart button — custom confirm modal (no native confirm())
  clearCartBtn?.addEventListener('click', () => {
    if (cart.size === 0) return;
    openConfirmModal({
      title: '🗑️ Clear Cart',
      message: 'Remove <strong>all items</strong> from your cart? This cannot be undone.',
      confirmLabel: 'Clear All',
      confirmStyle: 'danger',
      onConfirm: () => {
        cart.clear();
        resetAllCardControls(); // BUG FIX: explicitly reset all card states
        renderCart();
      },
    });
  });

  // Checkout button — opens receipt modal
  checkoutBtn?.addEventListener('click', () => {
    if (cart.size === 0) return;
    openReceiptModal();
  });
}

/* =================================================================
   5. CUSTOM MODAL SYSTEM
   Replaces ALL native alert() / confirm() calls.
================================================================= */

/** Currently registered onConfirm callback for the active modal. */
let _modalOnConfirm = null;

/**
 * Opens the shared modal overlay.
 * @param {{ title, bodyHTML, footerHTML, onConfirm? }} opts
 */
function openModal({ title, bodyHTML, footerHTML, onConfirm = null }) {
  _modalOnConfirm = onConfirm;

  modalTitle.textContent = title;
  modalBody.innerHTML    = bodyHTML;
  modalFooter.innerHTML  = footerHTML;

  modalOverlay.removeAttribute('hidden');
  // Focus the close button for accessibility
  modalClose?.focus();
}

/** Closes the modal and clears state. */
function closeModal() {
  modalOverlay.setAttribute('hidden', '');
  _modalOnConfirm = null;
  // Small delay before clearing content so close animation plays
  setTimeout(() => {
    modalBody.innerHTML   = '';
    modalFooter.innerHTML = '';
  }, 250);
}

/**
 * Opens a generic confirm dialog with a danger or success primary action.
 * @param {{ title, message, confirmLabel, confirmStyle, onConfirm }} opts
 */
function openConfirmModal({ title, message, confirmLabel, confirmStyle = 'danger', onConfirm }) {
  const styleClass = confirmStyle === 'success'
    ? 'btn-modal-primary btn-modal-primary--success'
    : 'btn-modal-primary btn-modal-primary--danger';

  openModal({
    title,
    bodyHTML: `<p class="modal-confirm-msg">${message}</p>`,
    footerHTML: `
      <button class="btn-modal-secondary" id="mc-cancel">Cancel</button>
      <button class="${styleClass}" id="mc-confirm">${escapeHtml(confirmLabel)}</button>
    `,
    onConfirm,
  });

  // Bind buttons after injection
  document.getElementById('mc-cancel')?.addEventListener('click', closeModal);
  document.getElementById('mc-confirm')?.addEventListener('click', () => {
    closeModal();
    onConfirm?.();
  });
}

/** Attaches permanent modal overlay close handlers. */
function initModalHandlers() {
  // Close button (X)
  modalClose?.addEventListener('click', closeModal);

  // Click outside modal box
  modalOverlay?.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalOverlay?.hasAttribute('hidden')) {
      closeModal();
    }
  });
}

/* =================================================================
   6. RECEIPT MODAL
================================================================= */

/** Generates receipt HTML string from current cart. */
function buildReceiptHTML() {
  const { subtotal, total } = calcTotals();
  const now     = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  const orderId = Math.floor(Math.random() * 90000) + 10000;

  let rows = '';
  for (const [, item] of cart) {
    rows += `
      <div class="receipt__row">
        <span>${escapeHtml(item.name)} ×${item.qty}</span>
        <span>${formatRupiah(item.price * item.qty)}</span>
      </div>`;
  }

  return { orderId, html: `
    <div class="receipt">
      <p class="receipt__title">AntriGo Canteen</p>
      <p class="receipt__meta">
        ${dateStr} — ${timeStr}<br/>
        Order <strong>#${orderId}</strong> · Deandra Naufal Maulana
      </p>
      <hr class="receipt__divider" />
      ${rows}
      <hr class="receipt__divider" />
      <div class="receipt__row">
        <span>Subtotal</span><span>${formatRupiah(subtotal)}</span>
      </div>
      <div class="receipt__row">
        <span>Service fee</span><span>${formatRupiah(SERVICE_FEE)}</span>
      </div>
      <hr class="receipt__divider" />
      <div class="receipt__row receipt__row--total">
        <span>TOTAL</span><span>${formatRupiah(total)}</span>
      </div>
      <hr class="receipt__divider" />
      <p style="text-align:center;color:#8888A8;font-size:11px;margin-top:6px;">
        Please pick up at Counter 3. Thank you! 🙏
      </p>
    </div>
  `};
}

/** Opens the checkout receipt modal. */
function openReceiptModal() {
  const { orderId, html } = buildReceiptHTML();
  const { total } = calcTotals();

  openModal({
    title: '🧾 Order Receipt',
    bodyHTML: html,
    footerHTML: `
      <button class="btn-modal-secondary" id="mr-cancel">Back to Cart</button>
      <button class="btn-modal-primary btn-modal-primary--success" id="mr-confirm">
        ✅ Confirm Order
      </button>
    `,
  });

  document.getElementById('mr-cancel')?.addEventListener('click', closeModal);
  document.getElementById('mr-confirm')?.addEventListener('click', () => {
    // Capture snapshot before clearing cart
    const snapshot = buildOrderSnapshot(orderId, total);
    closeModal();
    confirmOrder(snapshot);
  });
}

/* =================================================================
   7. ORDER HISTORY
================================================================= */

/**
 * Builds a plain-object snapshot of the current cart for history storage.
 * @param {number} orderId
 * @param {number} total
 * @returns {{ id, date, items, total }}
 */
function buildOrderSnapshot(orderId, total) {
  const items = [];
  for (const [, item] of cart) {
    items.push({
      name:      item.name,
      qty:       item.qty,
      lineTotal: item.price * item.qty,
    });
  }
  return {
    id:    orderId,
    date:  new Date().toLocaleString('id-ID', {
             day:'2-digit', month:'short', year:'numeric',
             hour:'2-digit', minute:'2-digit'
           }),
    items,
    total,
  };
}

/**
 * Appends a completed order to the history section.
 * @param {{ id, date, items, total }} snapshot
 */
function appendToHistory(snapshot) {
  orderHistory.push(snapshot);

  // Remove empty-state placeholder
  historyEmpty?.setAttribute('hidden', '');

  // Update count badge
  if (historyCount) {
    historyCount.textContent = `${orderHistory.length} order${orderHistory.length !== 1 ? 's' : ''}`;
  }

  // Build history card
  const card = document.createElement('div');
  card.classList.add('history-card');

  const itemRows = snapshot.items
    .map(i => `<li><span>${escapeHtml(i.name)} ×${i.qty}</span><span>${formatRupiah(i.lineTotal)}</span></li>`)
    .join('');

  card.innerHTML = `
    <div class="history-card__header">
      <div>
        <p class="history-card__id">Order #${snapshot.id}</p>
        <p class="history-card__date">${snapshot.date}</p>
      </div>
      <span class="history-status history-status--done">✅ Completed</span>
    </div>
    <ul class="history-card__items">${itemRows}</ul>
    <div class="history-card__total">
      <span>Total Paid</span>
      <span>${formatRupiah(snapshot.total)}</span>
    </div>
  `;

  // Prepend so newest order appears at the top
  historyList?.insertBefore(card, historyList.firstChild);
}

/** Updates profile stats counters. */
function updateProfileStats() {
  const totalOrders = orderHistory.length;
  const totalSpent  = orderHistory.reduce((sum, o) => sum + o.total, 0);
  if (statOrders) statOrders.textContent = totalOrders;
  if (statSpent)  statSpent.textContent  = formatRupiah(totalSpent);
}

/**
 * Finalises an order: clears cart + card UI, appends to history,
 * updates profile stats, shows success toast.
 * @param {{ id, date, items, total }} snapshot
 */
function confirmOrder(snapshot) {
  // Append to history BEFORE clearing cart state
  appendToHistory(snapshot);
  updateProfileStats();

  // Clear cart state
  cart.clear();

  // EXPLICIT reset of all card controls (BUG FIX)
  resetAllCardControls();

  // Re-render empty cart
  renderCart();

  // Show toast
  showToast();
}

/* =================================================================
   8. BELL NOTIFICATION DROPDOWN
================================================================= */

/** Toggles the notification dropdown open/closed. */
function toggleNotifDropdown() {
  const isHidden = notifDropdown?.hasAttribute('hidden');

  if (isHidden) {
    notifDropdown.removeAttribute('hidden');
    // Trigger CSS transition by adding .open after display is set
    requestAnimationFrame(() => notifDropdown.classList.add('open'));
    bellBtn?.setAttribute('aria-expanded', 'true');
  } else {
    closeNotifDropdown();
  }
}

/** Closes the dropdown if open. */
function closeNotifDropdown() {
  if (!notifDropdown) return;
  notifDropdown.classList.remove('open');
  // Wait for transition then set hidden
  notifDropdown.addEventListener('transitionend', () => {
    if (!notifDropdown.classList.contains('open')) {
      notifDropdown.setAttribute('hidden', '');
    }
  }, { once: true });
  bellBtn?.setAttribute('aria-expanded', 'false');
}

function initBellDropdown() {
  bellBtn?.addEventListener('click', e => {
    e.stopPropagation(); // prevent immediate document close
    toggleNotifDropdown();
  });

  // "Mark all as read" — removes red dots and bell badge
  markAllRead?.addEventListener('click', () => {
    document.querySelectorAll('.notif-dot').forEach(dot => {
      dot.classList.add('notif-dot--read');
    });
    document.querySelectorAll('.notif-item--new').forEach(item => {
      item.classList.remove('notif-item--new');
    });
    const countBadge = document.querySelector('.notif-badge-count');
    if (countBadge) countBadge.textContent = '0 new';
    bellBtn?.classList.add('all-read');
    closeNotifDropdown();
  });

  // Close dropdown when clicking anywhere outside
  document.addEventListener('click', e => {
    if (!document.getElementById('notif-wrap')?.contains(e.target)) {
      if (!notifDropdown?.hasAttribute('hidden')) {
        closeNotifDropdown();
      }
    }
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !notifDropdown?.hasAttribute('hidden')) {
      closeNotifDropdown();
    }
  });
}

/* =================================================================
   9. PROFILE AVATAR BUTTON → switch to Profile section
================================================================= */
function initProfileAvatar() {
  profileAvatarBtn?.addEventListener('click', () => {
    switchSection('profile');
    // Close notif dropdown if open
    if (!notifDropdown?.hasAttribute('hidden')) closeNotifDropdown();
  });
}

/* =================================================================
   10. SUCCESS TOAST
================================================================= */

/**
 * Shows a success toast for ~3.5 seconds, then hides it.
 */
function showToast() {
  if (!successToast) return;
  successToast.removeAttribute('hidden');
  void successToast.offsetWidth; // force reflow for transition
  successToast.classList.add('show');

  setTimeout(() => {
    successToast.classList.remove('show');
    // Hide fully after CSS transition completes (--t-base = 0.18s)
    setTimeout(() => successToast.setAttribute('hidden', ''), 300);
  }, 3500);
}

/* =================================================================
   INITIALISATION
================================================================= */
function init() {
  initGreeting();
  initNavigation();
  initFilters();
  initSearch();
  initCartHandlers();
  initModalHandlers();
  initBellDropdown();
  initProfileAvatar();

  // Ensure checkout button starts disabled and service fee is hidden
  if (checkoutBtn) checkoutBtn.disabled = true;
  serviceFeeRow?.setAttribute('hidden', '');

  // Set correct item count on load
  applyFilter('all');
}

document.addEventListener('DOMContentLoaded', init);
