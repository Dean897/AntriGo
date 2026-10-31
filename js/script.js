/**
 * AntriGo — Campus Canteen Pre-Order Dashboard
 * js/script.js
 *
 * Responsibilities:
 *  1. Dynamic greeting based on current time
 *  2. Sidebar navigation — section switching
 *  3. Category filter chips — show/hide food cards
 *  4. Search bar — real-time card filtering
 *  5. Cart logic — add / remove / update quantities, auto-calculate totals
 *  6. Checkout modal — receipt generation
 *  7. Success toast — post-order confirmation
 */

'use strict';

/* =================================================================
   CONSTANTS & STATE
================================================================= */

/** Service fee charged per order (IDR) */
const SERVICE_FEE = 1000;

/**
 * cart — Map<itemId: string, { name, price, qty, emoji, colorClass }>
 * Using a Map preserves insertion order and gives O(1) lookup by id.
 */
const cart = new Map();

/* =================================================================
   DOM REFERENCES
================================================================= */
const greetingEl      = document.getElementById('greeting-text');
const navBtns         = document.querySelectorAll('.nav-btn[data-section]');
const pageSections    = document.querySelectorAll('.page-section');
const filterChips     = document.querySelectorAll('.filter-chip');
const foodCards       = document.querySelectorAll('#food-grid .food-card');
const emptyState      = document.getElementById('empty-state');
const visibleCount    = document.getElementById('visible-count');
const searchInput     = document.getElementById('search-input');

const cartItemsEl     = document.getElementById('cart-items');
const cartEmptyMsg    = document.getElementById('cart-empty-msg');
const cartCountEl     = document.getElementById('cart-count');
const subtotalEl      = document.getElementById('subtotal-val');
const totalEl         = document.getElementById('total-val');
const clearCartBtn    = document.getElementById('clear-cart-btn');
const checkoutBtn     = document.getElementById('checkout-btn');

const modalOverlay    = document.getElementById('modal-overlay');
const modalBody       = document.getElementById('modal-body');
const modalClose      = document.getElementById('modal-close');
const modalConfirm    = document.getElementById('modal-confirm');
const modalCancel     = document.getElementById('modal-cancel');

const successToast    = document.getElementById('success-toast');

/* =================================================================
   1. DYNAMIC GREETING
================================================================= */

/**
 * Returns a time-appropriate greeting phrase.
 * @returns {string}
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Sets the hero greeting text using the student's first name. */
function initGreeting() {
  if (greetingEl) {
    greetingEl.textContent = `${getGreeting()}, Deandra! 👋`;
  }
}

/* =================================================================
   2. SIDEBAR NAVIGATION — section switching
================================================================= */

/**
 * Activates the target section and deactivates all others.
 * @param {string} targetId - value of data-section attribute
 */
function switchSection(targetId) {
  // Update nav button states
  navBtns.forEach(btn => {
    const isActive = btn.dataset.section === targetId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Toggle page sections
  pageSections.forEach(section => {
    const isTarget = section.id === `section-${targetId}`;
    if (isTarget) {
      section.removeAttribute('hidden');
      section.classList.add('active');
    } else {
      section.setAttribute('hidden', '');
      section.classList.remove('active');
    }
  });
}

/** Attaches click handlers to sidebar nav buttons. */
function initNavigation() {
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionId = btn.dataset.section;
      if (sectionId) switchSection(sectionId);
    });
  });

  // Logout — simple alert for demo purposes
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      alert('You have been logged out. Goodbye, Deandra!');
    });
  }
}

/* =================================================================
   3. CATEGORY FILTER CHIPS
================================================================= */

/** Currently active filter value */
let activeFilter = 'all';

/**
 * Filters the food grid based on category.
 * Cards whose data-category doesn't match are hidden via the `hidden` attribute.
 * @param {string} filter - 'all' | 'meal' | 'snack' | 'drink' | 'dessert'
 */
function applyFilter(filter) {
  activeFilter = filter;
  let shown = 0;

  foodCards.forEach(card => {
    const category = card.dataset.category;
    const nameText = card.dataset.name?.toLowerCase() ?? '';
    const searchTerm = searchInput.value.toLowerCase().trim();

    const matchesFilter   = filter === 'all' || category === filter;
    const matchesSearch   = nameText.includes(searchTerm);
    const shouldShow      = matchesFilter && matchesSearch;

    if (shouldShow) {
      card.removeAttribute('hidden');
      shown++;
    } else {
      card.setAttribute('hidden', '');
    }
  });

  // Update item count label
  if (visibleCount) {
    visibleCount.textContent = `${shown} item${shown !== 1 ? 's' : ''}`;
  }

  // Toggle empty state message
  if (emptyState) {
    if (shown === 0) {
      emptyState.removeAttribute('hidden');
    } else {
      emptyState.setAttribute('hidden', '');
    }
  }
}

/** Attaches click handlers to filter chip buttons. */
function initFilters() {
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      // Deactivate previous chip
      filterChips.forEach(c => c.classList.remove('active'));
      // Activate clicked chip
      chip.classList.add('active');
      applyFilter(chip.dataset.filter);
    });
  });
}

/* =================================================================
   4. SEARCH BAR — real-time filtering
================================================================= */

/** Attaches an input listener to the search field for live filtering. */
function initSearch() {
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    // Re-apply current filter with the new search term
    applyFilter(activeFilter);
  });
}

/* =================================================================
   5. CART LOGIC
================================================================= */

/**
 * Formats a number as Indonesian Rupiah string.
 * @param {number} amount
 * @returns {string} e.g. "Rp 18.000"
 */
function formatRupiah(amount) {
  // Use Indonesian locale for dot-separated thousands
  return 'Rp ' + amount.toLocaleString('id-ID');
}

/**
 * Adds one unit of an item to the cart, or increments its quantity.
 * @param {string} id   - item's data-id
 * @param {string} name - display name
 * @param {number} price - unit price in IDR
 * @param {string} emoji - emoji character for the thumbnail
 * @param {string} colorClass - CSS class for colored thumbnail background
 */
function addToCart(id, name, price, emoji, colorClass) {
  if (cart.has(id)) {
    cart.get(id).qty += 1;
  } else {
    cart.set(id, { name, price, qty: 1, emoji, colorClass });
  }
  renderCart();
  syncCardControls(id);
  animateCartBadge();
}

/**
 * Removes one unit from the cart. If qty reaches 0, the item is removed.
 * @param {string} id - item's data-id
 */
function removeFromCart(id) {
  if (!cart.has(id)) return;
  const item = cart.get(id);
  item.qty -= 1;
  if (item.qty <= 0) {
    cart.delete(id);
  }
  renderCart();
  syncCardControls(id);
}

/**
 * Syncs the +/− buttons and quantity display on the food card
 * to reflect the current cart state for that item.
 * @param {string} id - data-id of the card to sync
 */
function syncCardControls(id) {
  const card = document.querySelector(`.food-card[data-id="${id}"]`);
  if (!card) return;

  const minusBtn = card.querySelector('.btn-minus');
  const qtyVal   = card.querySelector('.card-qty-val');
  const qty      = cart.has(id) ? cart.get(id).qty : 0;

  if (minusBtn) {
    if (qty > 0) {
      minusBtn.removeAttribute('hidden');
    } else {
      minusBtn.setAttribute('hidden', '');
    }
  }

  if (qtyVal) {
    qtyVal.textContent = qty > 0 ? qty : '';
  }
}

/**
 * Triggers a short CSS scale animation on the cart badge.
 */
function animateCartBadge() {
  cartCountEl.classList.remove('bump');
  // Force reflow to restart animation
  void cartCountEl.offsetWidth;
  cartCountEl.classList.add('bump');
}

/**
 * Calculates cart totals.
 * @returns {{ itemCount: number, subtotal: number, total: number }}
 */
function calcTotals() {
  let itemCount = 0;
  let subtotal  = 0;

  for (const [, item] of cart) {
    itemCount += item.qty;
    subtotal  += item.price * item.qty;
  }

  const total = subtotal > 0 ? subtotal + SERVICE_FEE : 0;
  return { itemCount, subtotal, total };
}

/**
 * Re-renders the entire cart panel based on the current cart Map.
 * This is a full re-render strategy — simple and correct for this scale.
 */
function renderCart() {
  const { itemCount, subtotal, total } = calcTotals();

  // ---- Update badge ----
  cartCountEl.textContent = itemCount;

  // ---- Update totals ----
  subtotalEl.textContent = formatRupiah(subtotal);
  totalEl.textContent    = formatRupiah(total);

  // ---- Toggle empty message ----
  if (cart.size === 0) {
    cartEmptyMsg.removeAttribute('hidden');
    checkoutBtn.disabled = true;
  } else {
    cartEmptyMsg.setAttribute('hidden', '');
    checkoutBtn.disabled = false;
  }

  // ---- Build cart item rows ----
  // Remove all existing cart item elements (keep the empty msg)
  const existingItems = cartItemsEl.querySelectorAll('.cart-item');
  existingItems.forEach(el => el.remove());

  for (const [id, item] of cart) {
    const lineTotal = item.price * item.qty;

    /*
     * Each cart row:
     *  [emoji thumb] [name + qty×price meta] [line total]
     */
    const row = document.createElement('div');
    row.classList.add('cart-item');
    row.dataset.cartId = id;

    row.innerHTML = `
      <div class="cart-item__thumb ${item.colorClass}" aria-hidden="true">
        ${item.emoji}
      </div>
      <div class="cart-item__info">
        <p class="cart-item__name">${escapeHtml(item.name)}</p>
        <p class="cart-item__meta">${item.qty} × ${formatRupiah(item.price)}</p>
      </div>
      <span class="cart-item__price">${formatRupiah(lineTotal)}</span>
    `;

    cartItemsEl.appendChild(row);
  }
}

/**
 * Escapes HTML special characters to prevent XSS when inserting
 * user-derived data (food names from data attributes) into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Attaches delegated click handler on the food grid for +/− buttons. */
function initCartHandlers() {
  // Delegated listener on the grid — handles all current and future cards
  const grid = document.getElementById('food-grid');
  if (grid) {
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.btn-qty');
      if (!btn) return;

      const card = btn.closest('.food-card');
      if (!card) return;

      const id         = card.dataset.id;
      const name       = card.dataset.name;
      const price      = parseInt(card.dataset.price, 10);
      const emoji      = card.querySelector('.food-card__img')?.textContent?.trim() ?? '🍽️';
      const colorClass = [...card.querySelector('.food-card__img').classList]
                           .find(c => c.startsWith('food-card__img--')) ?? '';

      if (btn.classList.contains('btn-add')) {
        addToCart(id, name, price, emoji, colorClass);
      } else if (btn.classList.contains('btn-minus')) {
        removeFromCart(id);
      }
    });
  }

  // Clear cart button
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
      if (cart.size === 0) return;
      if (!confirm('Remove all items from your cart?')) return;

      // Reset each card's controls
      cart.forEach((_, id) => {
        cart.delete(id);
        syncCardControls(id);
      });

      renderCart();
    });
  }

  // Checkout button
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', openModal);
  }
}

/* =================================================================
   6. CHECKOUT MODAL
================================================================= */

/** Opens the receipt modal and injects the receipt content. */
function openModal() {
  if (cart.size === 0) return;

  modalBody.innerHTML = buildReceipt();
  modalOverlay.removeAttribute('hidden');
  // Trap focus inside modal for accessibility
  modalClose.focus();
}

/** Closes the checkout modal. */
function closeModal() {
  modalOverlay.setAttribute('hidden', '');
}

/**
 * Builds an HTML receipt string from the current cart state.
 * @returns {string} HTML
 */
function buildReceipt() {
  const { subtotal, total } = calcTotals();
  const now     = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const orderId = Math.floor(Math.random() * 90000) + 10000; // random 5-digit order #

  let rows = '';
  for (const [, item] of cart) {
    const lineTotal = item.price * item.qty;
    rows += `
      <div class="receipt__row">
        <span>${escapeHtml(item.name)} ×${item.qty}</span>
        <span>${formatRupiah(lineTotal)}</span>
      </div>`;
  }

  return `
    <div class="receipt">
      <p class="receipt__title">AntriGo Canteen</p>
      <p class="receipt__meta">
        ${dateStr} — ${timeStr}<br/>
        Order #${orderId} &nbsp;·&nbsp; Deandra Naufal Maulana
      </p>
      <hr class="receipt__divider" />
      ${rows}
      <hr class="receipt__divider" />
      <div class="receipt__row">
        <span>Subtotal</span>
        <span>${formatRupiah(subtotal)}</span>
      </div>
      <div class="receipt__row">
        <span>Service fee</span>
        <span>${formatRupiah(SERVICE_FEE)}</span>
      </div>
      <hr class="receipt__divider" />
      <div class="receipt__row receipt__row--total">
        <span>TOTAL</span>
        <span>${formatRupiah(total)}</span>
      </div>
      <hr class="receipt__divider" />
      <p style="text-align:center;color:#8888A8;font-size:11px;margin-top:6px;">
        Please pick up your order at counter 3. Thank you! 🙏
      </p>
    </div>
  `;
}

/** Attaches event listeners for modal interactions. */
function initModal() {
  if (modalClose)   modalClose.addEventListener('click', closeModal);
  if (modalCancel)  modalCancel.addEventListener('click', closeModal);

  // Confirm order — clear cart and show success toast
  if (modalConfirm) {
    modalConfirm.addEventListener('click', () => {
      closeModal();
      confirmOrder();
    });
  }

  // Close modal on overlay background click
  if (modalOverlay) {
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Close modal on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalOverlay.hasAttribute('hidden')) {
      closeModal();
    }
  });
}

/* =================================================================
   7. ORDER CONFIRMATION & TOAST
================================================================= */

/**
 * Finalises the order: clears cart state, resets card UI,
 * and shows a success toast notification.
 */
function confirmOrder() {
  // Clear all card controls
  cart.forEach((_, id) => syncCardControls(id));
  cart.clear();
  renderCart();
  showToast();
}

/**
 * Shows the success toast for 3.5 seconds then hides it.
 */
function showToast() {
  successToast.removeAttribute('hidden');
  // Force a reflow before adding .show so transition fires
  void successToast.offsetWidth;
  successToast.classList.add('show');

  setTimeout(() => {
    successToast.classList.remove('show');
    // Hide after transition ends (matches --t-base = 0.18s)
    setTimeout(() => successToast.setAttribute('hidden', ''), 300);
  }, 3500);
}

/* =================================================================
   INITIALISATION
================================================================= */

/**
 * Main entry point — called once the DOM is fully parsed.
 */
function init() {
  initGreeting();
  initNavigation();
  initFilters();
  initSearch();
  initCartHandlers();
  initModal();

  // Initialise checkout button as disabled (cart starts empty)
  if (checkoutBtn) checkoutBtn.disabled = true;

  // Apply default filter to set correct item count on load
  applyFilter('all');
}

// Run after DOM is ready (script has `defer` attribute in HTML)
document.addEventListener('DOMContentLoaded', init);
