/**
 * ABDUREA STORE — Telegram Mini App Client Engine
 * High-performance, offline-tolerant, reactive SPA with Telegram WebApp SDK integration.
 */

(function () {
  'use strict';

  // -------------------------------------------------------------
  // 1. STATE & TELEGRAM INITIALIZATION
  // -------------------------------------------------------------
  const tg = window.Telegram?.WebApp || null;

  const state = {
    config: {},
    categories: [],
    products: [],
    filteredProducts: [],
    selectedCategory: 'all',
    searchQuery: '',
    cart: [],
    user: null,
    activeTab: 'home',
    selectedProduct: null,
    selectedPlan: null,
    selectedQty: 1,
    checkout: {
      step: 1,
      items: [],
      total: 0,
      paymentMethod: 'telebirr',
      order: null,
      receiptFile: null,
      isSubmitting: false
    },
    orders: [],
    profile: null,
    isInitialLoaded: false
  };

  // -------------------------------------------------------------
  // 2. HTTP & TELEGRAM API HELPER
  // -------------------------------------------------------------
  async function apiFetch(url, options = {}) {
    const headers = options.headers || {};
    if (tg && tg.initData) {
      headers['X-Telegram-Init-Data'] = tg.initData;
    } else {
      headers['X-Dev-Preview'] = 'true';
    }

    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    options.headers = headers;
    try {
      const resp = await fetch(url, options);
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || `HTTP error ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      console.warn(`API call failed for ${url}:`, err);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // 3. UTILITIES & TELEGRAM HAPTICS
  // -------------------------------------------------------------
  const utils = {
    haptic(type = 'light') {
      try {
        if (tg?.HapticFeedback) {
          if (type === 'success' || type === 'error' || type === 'warning') {
            tg.HapticFeedback.notificationOccurred(type);
          } else {
            tg.HapticFeedback.impactOccurred(type);
          }
        }
      } catch (e) {}
    },

    formatCurrency(amount, currency = 'ETB') {
      const num = Number(amount) || 0;
      return `${num.toLocaleString('en-US')} ${currency}`;
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    copyText(text) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      utils.haptic('success');
      TMA.toast.show(`Copied: ${text}`, 'success');
    },

    debounce(fn, delay) {
      let timer = null;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }
  };

  // -------------------------------------------------------------
  // 4. TOAST NOTIFICATIONS
  // -------------------------------------------------------------
  const toast = {
    show(message, type = 'info', duration = 3000) {
      const container = document.getElementById('tma-toast-container');
      if (!container) return;

      const toastEl = document.createElement('div');
      toastEl.className = `toast toast-${type}`;
      const icon = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
      toastEl.innerHTML = `<span>${icon}</span><span>${message}</span>`;
      container.appendChild(toastEl);

      setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(-10px)';
        toastEl.style.transition = 'all 0.25s ease';
        setTimeout(() => toastEl.remove(), 250);
      }, duration);
    }
  };

  // -------------------------------------------------------------
  // 5. NAVIGATION CONTROLLER
  // -------------------------------------------------------------
  const nav = {
    switchTab(tabId) {
      if (state.activeTab === tabId) return;
      utils.haptic('light');

      // Update Nav Tabs
      document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
      });

      // Update Tab Panes
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabId}`);
      });

      state.activeTab = tabId;

      // Handle specific tab activation
      if (tabId === 'cart') {
        cart.render();
      } else if (tabId === 'orders') {
        orders.loadUserOrders();
      } else if (tabId === 'profile') {
        profile.render();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // -------------------------------------------------------------
  // 6. CATALOG & SEARCH CONTROLLER
  // -------------------------------------------------------------
  const catalog = {
    async load(forceSync = false) {
      try {
        // Fetch config & categories & products in parallel
        const [cfgRes, catRes, prodRes] = await Promise.all([
          apiFetch('/api/miniapp/config'),
          apiFetch('/api/miniapp/categories'),
          apiFetch('/api/miniapp/products')
        ]);

        if (cfgRes?.success) state.config = cfgRes;
        if (catRes?.success) state.categories = catRes.categories || [];
        if (prodRes?.success) state.products = prodRes.products || [];

        catalog.renderCategories();
        catalog.applyFilters();
        home.render();
        state.isInitialLoaded = true;
      } catch (err) {
        console.error('Failed to load store catalog:', err);
        toast.show('Could not connect to store catalog. Please retry.', 'error');
      }
    },

    async reload(force = true) {
      utils.haptic('medium');
      toast.show('Synchronizing live catalog with ABDUREA STORE...', 'info', 2000);
      if (force) {
        await apiFetch('/api/miniapp/sync', { method: 'POST' }).catch(() => {});
      }
      await catalog.load();
      toast.show('Catalog up to date!', 'success');
    },

    renderCategories() {
      // Home categories
      const homeList = document.getElementById('home-categories-list');
      if (homeList) {
        let hHtml = '';
        state.categories.forEach(c => {
          hHtml += `
            <button class="category-chip" onclick="TMA.catalog.filterByCategory('${c.id}')">
              <span>${c.icon || '📦'}</span>
              <span>${c.name}</span>
              ${c.product_count ? `<span class="category-chip-count">${c.product_count}</span>` : ''}
            </button>
          `;
        });
        homeList.innerHTML = hHtml;
      }

      // Catalog categories
      const catList = document.getElementById('catalog-categories-list');
      if (catList) {
        let cHtml = `<button class="category-chip ${state.selectedCategory === 'all' ? 'active' : ''}" onclick="TMA.catalog.filterByCategory('all')">All</button>`;
        state.categories.forEach(c => {
          const isActive = state.selectedCategory === c.id;
          cHtml += `
            <button class="category-chip ${isActive ? 'active' : ''}" onclick="TMA.catalog.filterByCategory('${c.id}')">
              <span>${c.icon || '📦'}</span>
              <span>${c.name}</span>
            </button>
          `;
        });
        catList.innerHTML = cHtml;
      }
    },

    filterByCategory(catId) {
      utils.haptic('light');
      state.selectedCategory = catId;
      catalog.renderCategories();
      catalog.applyFilters();
      if (state.activeTab !== 'catalog') {
        nav.switchTab('catalog');
      }
    },

    applyFilters() {
      let filtered = [...state.products];

      // Category Filter
      if (state.selectedCategory && state.selectedCategory !== 'all') {
        filtered = filtered.filter(p => p.category_id === state.selectedCategory);
      }

      // Search Filter
      const q = state.searchQuery.toLowerCase().trim();
      if (q) {
        filtered = filtered.filter(p => {
          const n = (p.name || '').toLowerCase();
          const d = (p.description || '').toLowerCase();
          const c = (p.category_name || '').toLowerCase();
          return n.includes(q) || d.includes(q) || c.includes(q);
        });
      }

      state.filteredProducts = filtered;
      catalog.renderGrid();
    },

    renderGrid() {
      const grid = document.getElementById('catalog-products-grid');
      const countEl = document.getElementById('catalog-results-count');
      const emptyEl = document.getElementById('catalog-empty-state');
      if (!grid) return;

      const items = state.filteredProducts;

      if (countEl) {
        countEl.textContent = `Showing ${items.length} ${items.length === 1 ? 'service' : 'services'}`;
      }

      if (items.length === 0) {
        grid.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
      }

      emptyEl?.classList.add('hidden');
      grid.innerHTML = items.map(p => catalog.renderCardHtml(p)).join('');
    },

    renderCardHtml(p) {
      const minPrice = p.min_price || (p.plans && p.plans[0] ? p.plans[0].price : 0);
      const plansCount = (p.plans && p.plans.length) || 1;
      const imgUrl = p.image_url || 'https://placehold.co/300x300/182238/ffffff?text=' + encodeURIComponent(p.name);
      const tag = p.category_name || 'DIGITAL';

      const isAdmin = !!(state.isAdmin || state.profile?.is_admin || state.user?.is_admin);
      const isDraft = p.active === 0;
      const draftBadge = (isAdmin && isDraft) ? `<span style="background: rgba(239, 68, 68, 0.9); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; position: absolute; bottom: 8px; left: 8px; z-index: 5;">👁️ DRAFT</span>` : '';
      const adminActions = isAdmin ? `
        <div class="card-admin-bar" style="position: absolute; top: 8px; right: 8px; z-index: 6; display: flex; gap: 4px;" onclick="event.stopPropagation();">
          <button class="btn-primary" style="padding: 4px 8px; font-size: 10px;" onclick="TMA.admin.openProductEditor('${p.id}')" title="Edit Product">✏️ Edit</button>
          <button class="btn-secondary" style="padding: 4px 6px; font-size: 10px; color: #ef4444;" onclick="TMA.admin.confirmDeleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')" title="Delete Product">🗑️</button>
        </div>
      ` : '';

      return `
        <div class="product-card" onclick="TMA.productModal.open('${p.id}')" style="position: relative;">
          ${adminActions}
          ${draftBadge}
          <div class="card-img-wrap">
            <img src="${imgUrl}" alt="${p.name}" class="card-img" loading="lazy" onerror="this.src='https://placehold.co/300x300/182238/ffffff?text=${encodeURIComponent(p.name)}'">
            <span class="card-tag">${tag}</span>
          </div>
          <div class="card-body">
            <h4 class="card-title">${p.name}</h4>
            <span class="card-plans-sub">${plansCount} ${plansCount === 1 ? 'Duration' : 'Options'} available</span>
            <div class="card-footer">
              <div class="card-price-box">
                <span class="price-label">Starts at</span>
                <span class="price-value">${utils.formatCurrency(minPrice)}</span>
              </div>
              <button class="card-quick-add" aria-label="Select Plan" onclick="event.stopPropagation(); TMA.productModal.open('${p.id}')">
                <svg class="svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    },

    clearSearch() {
      const input = document.getElementById('search-input');
      const clearBtn = document.getElementById('search-clear-btn');
      if (input) input.value = '';
      if (clearBtn) clearBtn.classList.add('hidden');
      state.searchQuery = '';
      catalog.applyFilters();
    },

    clearFilters() {
      catalog.clearSearch();
      state.selectedCategory = 'all';
      catalog.renderCategories();
      catalog.applyFilters();
    }
  };

  // -------------------------------------------------------------
  // 7. HOME TAB CONTROLLER
  // -------------------------------------------------------------
  const home = {
    render() {
      const featGrid = document.getElementById('featured-products-grid');
      const allGrid = document.getElementById('home-all-products-grid');
      const totalCount = document.getElementById('home-total-count');

      if (totalCount) {
        totalCount.textContent = `${state.products.length} Available`;
      }

      // Featured: first 4 products
      if (featGrid) {
        const featured = state.products.slice(0, 4);
        featGrid.innerHTML = featured.map(p => catalog.renderCardHtml(p)).join('');
      }

      // All Products Preview
      if (allGrid) {
        allGrid.innerHTML = state.products.map(p => catalog.renderCardHtml(p)).join('');
      }
    }
  };

  // -------------------------------------------------------------
  // 8. PRODUCT DETAIL MODAL CONTROLLER
  // -------------------------------------------------------------
  const productModal = {
    open(productId) {
      const prod = state.products.find(p => p.id === productId);
      if (!prod) return;

      utils.haptic('light');
      state.selectedProduct = prod;
      state.selectedPlan = (prod.plans && prod.plans[0]) ? prod.plans[0] : null;
      state.selectedQty = 1;

      productModal.renderContent();

      const modal = document.getElementById('product-detail-modal');
      modal?.classList.remove('hidden');

      // Hook up Telegram native BackButton
      if (tg?.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(productModal.close);
      }
    },

    close() {
      utils.haptic('light');
      const modal = document.getElementById('product-detail-modal');
      modal?.classList.add('hidden');
      state.selectedProduct = null;

      if (tg?.BackButton) {
        tg.BackButton.hide();
      }
    },

    handleBackdrop(e) {
      if (e.target.id === 'product-detail-modal') {
        productModal.close();
      }
    },

    selectPlan(planId) {
      if (!state.selectedProduct || !state.selectedProduct.plans) return;
      const plan = state.selectedProduct.plans.find(pl => pl.id === planId);
      if (plan) {
        utils.haptic('light');
        state.selectedPlan = plan;
        productModal.renderContent();
      }
    },

    changeQty(delta) {
      utils.haptic('light');
      state.selectedQty = Math.max(1, state.selectedQty + delta);
      productModal.renderContent();
    },

    renderContent() {
      const container = document.getElementById('product-modal-content');
      const p = state.selectedProduct;
      if (!container || !p) return;

      const currentPlan = state.selectedPlan;
      const unitPrice = currentPlan ? Number(currentPlan.price) : 0;
      const totalPrice = unitPrice * state.selectedQty;
      const imgUrl = p.image_url || 'https://placehold.co/600x400/182238/ffffff?text=' + encodeURIComponent(p.name);

      let plansHtml = '';
      if (p.plans && p.plans.length > 0) {
        plansHtml = p.plans.map(pl => {
          const isSel = currentPlan && currentPlan.id === pl.id;
          return `
            <div class="plan-option-card ${isSel ? 'selected' : ''}" onclick="TMA.productModal.selectPlan('${pl.id}')">
              <div class="plan-card-left">
                <div class="plan-radio"></div>
                <div>
                  <div class="plan-duration-name">${pl.duration || pl.name || 'Standard'}</div>
                  <span class="text-muted" style="font-size: 11px;">Instant Activation</span>
                </div>
              </div>
              <div class="plan-card-price">${utils.formatCurrency(pl.price, pl.currency)}</div>
            </div>
          `;
        }).join('');
      } else {
        plansHtml = `<p class="text-muted" style="font-size: 12px;">Standard package included.</p>`;
      }

      let featuresHtml = '';
      if (p.features && Array.isArray(p.features) && p.features.length > 0) {
        featuresHtml = `
          <div style="margin-bottom: 16px;">
            <span class="plan-selection-title">Included Features</span>
            <ul style="padding-left: 20px; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
              ${p.features.map(f => `<li>${f}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      const isAdmin = !!(state.isAdmin || state.profile?.is_admin || state.user?.is_admin);
      const adminActionsHtml = isAdmin ? `
        <div style="background: rgba(0, 102, 255, 0.08); border: 1.5px dashed var(--brand-primary); border-radius: var(--radius-md); padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>👑</span>
            <strong style="font-size: 12px; color: var(--brand-primary);">ADMIN MODE</strong>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn-primary" style="padding: 6px 12px; font-size: 11px;" onclick="TMA.productModal.close(); TMA.admin.openProductEditor('${p.id}')">✏️ Edit Product</button>
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 11px; color: var(--color-danger); border-color: rgba(239, 68, 68, 0.4);" onclick="TMA.productModal.close(); TMA.admin.confirmDeleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </div>
      ` : '';

      container.innerHTML = `
        ${adminActionsHtml}
        <div class="modal-product-img-wrap">
          <img src="${imgUrl}" alt="${p.name}" class="modal-product-img" onerror="this.src='https://placehold.co/600x400/182238/ffffff?text=${encodeURIComponent(p.name)}'">
        </div>

        <h2 class="modal-product-title">${p.name}</h2>
        
        <div class="modal-product-meta">
          <span class="stock-tag">🟢 In Stock · Instant Delivery</span>
          <span class="text-muted" style="font-size: 11px;">${p.category_name || 'Pro Digital Account'}</span>
        </div>

        <p class="modal-product-desc">${p.description || 'Premium subscription access delivered directly with official guarantee.'}</p>

        ${featuresHtml}

        <span class="plan-selection-title">Select Duration / Subscription Plan</span>
        <div class="plans-options-grid">
          ${plansHtml}
        </div>

        <div class="qty-control-row">
          <div>
            <div style="font-size: 13px; font-weight: 700;">Quantity</div>
            <div style="font-size: 11px; color: var(--hint-color);">Total: <strong style="color: #a5b4fc;">${utils.formatCurrency(totalPrice)}</strong></div>
          </div>
          <div class="qty-selector">
            <button class="qty-btn" onclick="TMA.productModal.changeQty(-1)">&minus;</button>
            <span class="qty-val">${state.selectedQty}</span>
            <button class="qty-btn" onclick="TMA.productModal.changeQty(1)">&plus;</button>
          </div>
        </div>

        <div class="modal-actions-row">
          <button class="btn-secondary" onclick="TMA.productModal.addToCart(false)">
            <span>Add to Cart</span>
          </button>
          <button class="btn-primary" onclick="TMA.productModal.buyNow()">
            <span>Buy Now</span>
          </button>
        </div>
      `;
    },

    addToCart(closeAfter = false) {
      const p = state.selectedProduct;
      const pl = state.selectedPlan;
      if (!p || !pl) {
        toast.show('Please select a plan duration first.', 'warning');
        return;
      }

      utils.haptic('success');
      cart.addItem({
        product_id: p.id,
        plan_id: pl.id,
        name: p.name,
        duration: pl.duration || pl.name || 'Standard',
        price: Number(pl.price),
        currency: pl.currency || 'ETB',
        image: p.image_url,
        quantity: state.selectedQty
      });

      toast.show(`Added ${p.name} (${pl.duration}) to cart!`, 'success');
      if (closeAfter) {
        productModal.close();
      }
    },

    buyNow() {
      productModal.addToCart(true);
      checkout.open();
    }
  };

  // -------------------------------------------------------------
  // 9. CART CONTROLLER
  // -------------------------------------------------------------
  const cart = {
    init() {
      try {
        const stored = localStorage.getItem('abdurea_tma_cart');
        if (stored) {
          state.cart = JSON.parse(stored);
        }
      } catch (e) {
        state.cart = [];
      }
      cart.updateBadge();
    },

    save() {
      try {
        localStorage.setItem('abdurea_tma_cart', JSON.stringify(state.cart));
      } catch (e) {}
      cart.updateBadge();
    },

    addItem(item) {
      const existing = state.cart.find(i => i.product_id === item.product_id && i.plan_id === item.plan_id);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        state.cart.push(item);
      }
      cart.save();
    },

    changeQty(index, delta) {
      utils.haptic('light');
      if (state.cart[index]) {
        state.cart[index].quantity += delta;
        if (state.cart[index].quantity <= 0) {
          state.cart.splice(index, 1);
        }
        cart.save();
        cart.render();
      }
    },

    removeItem(index) {
      utils.haptic('warning');
      state.cart.splice(index, 1);
      cart.save();
      cart.render();
      toast.show('Item removed from cart', 'info');
    },

    clear() {
      if (state.cart.length === 0) return;
      utils.haptic('warning');
      state.cart = [];
      cart.save();
      cart.render();
      toast.show('Cart cleared', 'info');
    },

    updateBadge() {
      const totalCount = state.cart.reduce((sum, i) => sum + i.quantity, 0);
      
      const headerBadge = document.getElementById('cart-badge-count');
      const navBadge = document.getElementById('nav-cart-badge');

      [headerBadge, navBadge].forEach(b => {
        if (b) {
          b.textContent = totalCount;
          b.classList.toggle('hidden', totalCount === 0);
        }
      });
    },

    openDrawer() {
      nav.switchTab('cart');
    },

    render() {
      const listEl = document.getElementById('cart-items-container');
      const emptyEl = document.getElementById('cart-empty-state');
      const sumCard = document.getElementById('cart-summary-card');
      const subtotalEl = document.getElementById('cart-subtotal-val');
      const totalEl = document.getElementById('cart-total-val');
      const clearBtn = document.getElementById('btn-clear-cart');

      if (!listEl) return;

      if (state.cart.length === 0) {
        listEl.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        sumCard?.classList.add('hidden');
        clearBtn?.classList.add('hidden');
        return;
      }

      emptyEl?.classList.add('hidden');
      sumCard?.classList.remove('hidden');
      clearBtn?.classList.remove('hidden');

      let subtotal = 0;
      listEl.innerHTML = state.cart.map((item, idx) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        const img = item.image || 'https://placehold.co/120x120/182238/ffffff?text=' + encodeURIComponent(item.name);

        return `
          <div class="cart-item-card">
            <img src="${img}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://placehold.co/120x120/182238/ffffff?text=${encodeURIComponent(item.name)}'">
            <div class="cart-item-details">
              <h4 class="cart-item-title">${item.name}</h4>
              <div class="cart-item-plan">${item.duration} · ${utils.formatCurrency(item.price)}</div>
              <div class="cart-item-price">${utils.formatCurrency(itemTotal)}</div>
            </div>
            <div class="cart-item-actions">
              <button class="cart-del-btn" onclick="TMA.cart.removeItem(${idx})" aria-label="Remove item">
                <svg class="svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
              <div class="cart-qty-pill">
                <button onclick="TMA.cart.changeQty(${idx}, -1)">&minus;</button>
                <span>${item.quantity}</span>
                <button onclick="TMA.cart.changeQty(${idx}, 1)">&plus;</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      if (subtotalEl) subtotalEl.textContent = utils.formatCurrency(subtotal);
      if (totalEl) totalEl.textContent = utils.formatCurrency(subtotal);
    }
  };

  // -------------------------------------------------------------
  // 10. MULTI-STEP CHECKOUT CONTROLLER
  // -------------------------------------------------------------
  const checkout = {
    async open() {
      if (state.cart.length === 0) {
        toast.show('Your cart is empty.', 'warning');
        return;
      }

      // Revalidate cart with server
      try {
        const payload = {
          items: state.cart.map(i => ({
            product_id: i.product_id,
            plan_id: i.plan_id,
            quantity: i.quantity
          }))
        };
        const valRes = await apiFetch('/api/miniapp/cart/validate', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (!valRes.valid && valRes.issues && valRes.issues.length > 0) {
          toast.show(valRes.issues[0], 'error', 4000);
          return;
        }

        state.checkout.items = valRes.items;
        state.checkout.total = valRes.total;
      } catch (err) {
        toast.show('Could not validate live pricing. Please try again.', 'error');
        return;
      }

      utils.haptic('medium');
      state.checkout.step = 1;

      // Prefill user details
      const nameInput = document.getElementById('checkout-name');
      const phoneInput = document.getElementById('checkout-phone');
      if (nameInput && state.user) {
        nameInput.value = `${state.user.first_name || ''} ${state.user.last_name || ''}`.trim() || state.user.username || '';
      }

      checkout.showStep(1);

      const modal = document.getElementById('checkout-modal');
      modal?.classList.remove('hidden');

      if (tg?.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(checkout.close);
      }
    },

    close() {
      utils.haptic('light');
      const modal = document.getElementById('checkout-modal');
      modal?.classList.add('hidden');
      if (tg?.BackButton) {
        tg.BackButton.hide();
      }
    },

    showStep(stepNum) {
      state.checkout.step = stepNum;

      // Stepper Dots
      for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        if (dot) {
          dot.classList.toggle('active', i <= stepNum);
        }
      }

      // Hide all steps, show active
      document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
      const activeStep = document.getElementById(`checkout-step-${stepNum}`);
      activeStep?.classList.add('active');

      const titleEl = document.getElementById('checkout-step-title');
      const titles = {
        1: 'Step 1: Contact Information',
        2: 'Step 2: Review Order',
        3: 'Step 3: Transfer Payment',
        4: 'Step 4: Upload Receipt Screenshot',
        5: 'Order Placed!'
      };
      if (titleEl) titleEl.textContent = titles[stepNum] || 'Checkout';

      if (stepNum === 2) {
        checkout.renderReview();
      } else if (stepNum === 3) {
        checkout.renderPaymentBox();
      }
    },

    nextStep(targetStep) {
      utils.haptic('light');
      if (targetStep === 2) {
        const phone = document.getElementById('checkout-phone')?.value.trim();
        if (!phone || phone.length < 9) {
          toast.show('Please provide a valid phone number for verification.', 'warning');
          document.getElementById('checkout-phone')?.focus();
          return;
        }
      }
      checkout.showStep(targetStep);
    },

    prevStep(targetStep) {
      utils.haptic('light');
      checkout.showStep(targetStep);
    },

    renderReview() {
      const reviewList = document.getElementById('checkout-review-items');
      const totalEl = document.getElementById('checkout-review-total');
      if (!reviewList) return;

      reviewList.innerHTML = state.checkout.items.map(item => `
        <div class="review-item-row">
          <div>
            <strong>${item.product_name}</strong>
            <span class="text-muted" style="display: block; font-size: 11px;">${item.plan_duration} × ${item.quantity}</span>
          </div>
          <span style="font-weight: 700;">${utils.formatCurrency(item.total_price, item.currency)}</span>
        </div>
      `).join('');

      if (totalEl) totalEl.textContent = utils.formatCurrency(state.checkout.total);
    },

    async submitOrder() {
      utils.haptic('medium');
      const name = document.getElementById('checkout-name')?.value.trim();
      const phone = document.getElementById('checkout-phone')?.value.trim();
      const notes = document.getElementById('checkout-notes')?.value.trim();

      const payload = {
        items: state.checkout.items,
        customer_name: name,
        customer_phone: phone,
        customer_notes: notes,
        payment_method: state.checkout.paymentMethod
      };

      try {
        toast.show('Submitting order...', 'info', 1500);
        const res = await apiFetch('/api/miniapp/orders/create', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.success && res.primary_order) {
          state.checkout.order = res.primary_order;
          // Clear cart now that order is created
          state.cart = [];
          cart.save();

          // Move to Step 3 (Payment Transfer)
          checkout.showStep(3);
        } else {
          throw new Error(res.error || 'Failed to create order.');
        }
      } catch (err) {
        toast.show(err.message || 'Order creation failed.', 'error');
      }
    },

    selectPaymentTab(method) {
      utils.haptic('light');
      state.checkout.paymentMethod = method;
      document.getElementById('tab-pay-telebirr')?.classList.toggle('active', method === 'telebirr');
      document.getElementById('tab-pay-cbe')?.classList.toggle('active', method === 'cbe_birr');
      document.getElementById('box-pay-telebirr')?.classList.toggle('hidden', method !== 'telebirr');
      document.getElementById('box-pay-cbe')?.classList.toggle('hidden', method !== 'cbe_birr');
    },

    renderPaymentBox() {
      const order = state.checkout.order;
      if (!order) return;

      const orderBadge = document.getElementById('checkout-order-num-badge');
      if (orderBadge) orderBadge.textContent = `#${order.order_number}`;

      const tAmount = document.getElementById('pay-telebirr-amount');
      const cAmount = document.getElementById('pay-cbe-amount');
      const amtStr = utils.formatCurrency(order.amount, order.currency);
      if (tAmount) tAmount.textContent = amtStr;
      if (cAmount) cAmount.textContent = amtStr;
    },

    handleReceiptSelect(event) {
      const file = event.target.files?.[0];
      if (!file) return;

      utils.haptic('light');
      state.checkout.receiptFile = file;

      const promptEl = document.getElementById('dropzone-prompt');
      const previewEl = document.getElementById('dropzone-preview');
      const previewImg = document.getElementById('receipt-preview-img');

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (previewImg) previewImg.src = e.target.result;
          promptEl?.classList.add('hidden');
          previewEl?.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      } else {
        // PDF or other
        promptEl?.classList.add('hidden');
        previewEl?.classList.remove('hidden');
        if (previewImg) previewImg.src = 'https://placehold.co/160x160/1e293b/ffffff?text=Document+Attached';
      }
    },

    clearReceiptPreview(event) {
      event.stopPropagation();
      state.checkout.receiptFile = null;
      const fileInput = document.getElementById('receipt-file-input');
      if (fileInput) fileInput.value = '';

      document.getElementById('dropzone-prompt')?.classList.remove('hidden');
      document.getElementById('dropzone-preview')?.classList.add('hidden');
    },

    async uploadReceipt() {
      const order = state.checkout.order;
      if (!order) {
        toast.show('No active order found.', 'error');
        return;
      }

      if (!state.checkout.receiptFile) {
        toast.show('Please upload a screenshot of your transfer.', 'warning');
        return;
      }

      const senderName = document.getElementById('receipt-sender-name')?.value.trim();
      const submitBtn = document.getElementById('btn-submit-receipt');

      try {
        utils.haptic('medium');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>Uploading Receipt...</span>';
        }

        const formData = new FormData();
        formData.append('file', state.checkout.receiptFile);
        formData.append('payment_sender_name', senderName || state.user?.first_name || 'Customer');
        formData.append('payment_method', state.checkout.paymentMethod);
        formData.append('amount', order.amount);

        const res = await apiFetch(`/api/miniapp/orders/${order.id}/receipt`, {
          method: 'POST',
          body: formData
        });

        if (res.success) {
          utils.haptic('success');
          // Move to Success step
          const succOrderEl = document.getElementById('success-order-id');
          if (succOrderEl) succOrderEl.textContent = `Order #${order.order_number}`;
          checkout.showStep(5);
        } else {
          throw new Error(res.error || 'Receipt upload failed.');
        }
      } catch (err) {
        toast.show(err.message || 'Receipt upload failed. Please try again.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Submit Verification & Complete Order</span>';
        }
      }
    },

    finishAndShowOrders() {
      checkout.close();
      nav.switchTab('orders');
    },

    finishAndContinueShopping() {
      checkout.close();
      nav.switchTab('catalog');
    }
  };

  // -------------------------------------------------------------
  // 11. ORDERS HISTORY CONTROLLER
  // -------------------------------------------------------------
  const orders = {
    async loadUserOrders(manual = false) {
      if (manual) utils.haptic('light');
      const container = document.getElementById('orders-list-container');
      const emptyEl = document.getElementById('orders-empty-state');
      if (!container) return;

      try {
        const res = await apiFetch('/api/miniapp/orders');
        if (res.success) {
          state.orders = res.orders || [];
          if (state.orders.length === 0) {
            container.innerHTML = '';
            emptyEl?.classList.remove('hidden');
          } else {
            emptyEl?.classList.add('hidden');
            container.innerHTML = state.orders.map(o => orders.renderOrderCard(o)).join('');
          }
        }
      } catch (err) {
        console.warn('Could not fetch user orders:', err);
      }
    },

    renderOrderCard(o) {
      const statusMap = {
        'NEW': { label: 'Awaiting Payment', class: 'status-review', icon: '⏳' },
        'AWAITING_PAYMENT': { label: 'Awaiting Payment', class: 'status-review', icon: '⏳' },
        'PAYMENT_SUBMITTED': { label: 'Under Review', class: 'status-review', icon: '🟡' },
        'UNDER_REVIEW': { label: 'Under Review', class: 'status-review', icon: '🟡' },
        'PAYMENT_REVIEW': { label: 'Under Review', class: 'status-review', icon: '🟡' },
        'PAYMENT_APPROVED': { label: 'Approved', class: 'status-approved', icon: '🟢' },
        'ACCEPTED': { label: 'Approved', class: 'status-approved', icon: '🟢' },
        'PROCESSING': { label: 'Processing Delivery', class: 'status-approved', icon: '🚀' },
        'COMPLETED': { label: 'Delivered', class: 'status-completed', icon: '✅' },
        'PAYMENT_REJECTED': { label: 'Payment Rejected', class: 'status-rejected', icon: '❌' },
        'REJECTED': { label: 'Rejected', class: 'status-rejected', icon: '❌' },
        'CANCELLED': { label: 'Cancelled', class: 'status-rejected', icon: '⚪' }
      };

      const st = statusMap[o.status] || { label: o.status, class: 'status-review', icon: '⏳' };
      const img = o.product_image || 'https://placehold.co/100x100/182238/ffffff?text=Order';

      return `
        <div class="order-card" onclick="TMA.orders.openDrawer('${o.id}')">
          <div class="order-card-header">
            <span class="order-num">#${o.order_number}</span>
            <span class="status-chip ${st.class}">${st.icon} ${st.label}</span>
          </div>
          <div class="order-card-body">
            <img src="${img}" alt="${o.product_name}" class="order-img" onerror="this.src='https://placehold.co/100x100/182238/ffffff?text=Order'">
            <div class="order-info">
              <h4 class="order-prod-name">${o.product_name}</h4>
              <span class="order-prod-plan">${o.plan_duration || 'Standard'}</span>
            </div>
            <div class="order-card-right">
              <div class="order-amount">${utils.formatCurrency(o.amount, o.currency)}</div>
              <span class="order-date">${utils.formatDate(o.created_at)}</span>
            </div>
          </div>
        </div>
      `;
    },

    openDrawer(orderId) {
      const order = state.orders.find(o => String(o.id) === String(orderId));
      if (!order) return;

      utils.haptic('light');
      const drawer = document.getElementById('order-detail-modal');
      const content = document.getElementById('order-drawer-content');
      if (!drawer || !content) return;

      let deliveryBox = '';
      if (order.status === 'COMPLETED' && order.delivery) {
        deliveryBox = `
          <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px solid #10b981; border-radius: 12px; padding: 14px; margin: 16px 0;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; color: #10b981; margin-bottom: 6px;">
              <span>🎉</span>
              <span>ACCOUNT CREDENTIALS & INSTRUCTIONS:</span>
            </div>
            <div style="background: #0f172a; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; color: #f8fafc;">${order.delivery.content}</div>
          </div>
        `;
      } else if (order.status === 'PAYMENT_REJECTED' || order.status === 'REJECTED') {
        deliveryBox = `
          <div style="background: rgba(239, 68, 68, 0.12); border: 1.5px solid #ef4444; border-radius: 12px; padding: 14px; margin: 16px 0;">
            <div style="font-weight: 700; color: #ef4444; margin-bottom: 4px;">Payment Rejected</div>
            <div style="font-size: 12px; color: #fca5a5;">${order.rejection_reason || 'Could not verify payment transaction screenshot.'}</div>
            <a href="https://t.me/trust994" target="_blank" class="btn-secondary" style="margin-top: 10px; display: inline-flex; font-size: 12px; padding: 8px 14px;">Contact Support (@trust994)</a>
          </div>
        `;
      }

      content.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <h3 style="font-family: var(--font-heading); font-size: 18px; font-weight: 800;">Order #${order.order_number}</h3>
            <span class="text-muted" style="font-size: 11px;">Placed on ${utils.formatDate(order.created_at)}</span>
          </div>
          <span style="font-size: 16px; font-weight: 800; color: #a5b4fc;">${utils.formatCurrency(order.amount, order.currency)}</span>
        </div>

        <div style="background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <div style="font-size: 12px; color: var(--hint-color); text-transform: uppercase; margin-bottom: 4px;">Service Ordered:</div>
          <div style="font-size: 15px; font-weight: 800;">${order.product_name}</div>
          <div style="font-size: 13px; color: var(--hint-color);">${order.plan_duration || 'Standard Plan'}</div>
        </div>

        <div style="background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <div class="summary-line" style="margin-bottom: 6px;">
            <span class="text-muted">Payment Method</span>
            <strong>${(order.payment_method || 'Telebirr').toUpperCase()}</strong>
          </div>
          <div class="summary-line" style="margin-bottom: 6px;">
            <span class="text-muted">Order Status</span>
            <strong>${order.status}</strong>
          </div>
          <div class="summary-line" style="margin-bottom: 0;">
            <span class="text-muted">Customer Contact</span>
            <strong>${order.customer_phone || order.customer_name || 'Registered'}</strong>
          </div>
        </div>

        ${deliveryBox}

        ${order.status === 'AWAITING_PAYMENT' || order.status === 'NEW' ? `
          <button class="btn-primary btn-full mt-3" onclick="TMA.orders.resumePayment('${order.id}')">
            Upload Payment Receipt
          </button>
        ` : ''}
      `;

      drawer.classList.remove('hidden');

      if (tg?.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(orders.closeDrawer);
      }
    },

    closeDrawer() {
      const drawer = document.getElementById('order-detail-modal');
      drawer?.classList.add('hidden');
      if (tg?.BackButton) {
        tg.BackButton.hide();
      }
    },

    handleBackdrop(e) {
      if (e.target.id === 'order-detail-modal') {
        orders.closeDrawer();
      }
    },

    resumePayment(orderId) {
      const order = state.orders.find(o => String(o.id) === String(orderId));
      if (!order) return;
      orders.closeDrawer();
      state.checkout.order = order;
      checkout.showStep(3);
      document.getElementById('checkout-modal')?.classList.remove('hidden');
    }
  };

  // -------------------------------------------------------------
  // 12. PROFILE & INFO CONTROLLER
  // -------------------------------------------------------------
    const profile = {
    async load() {
      const u = state.user;
      const adminIds = [6666443909, 2145055956];
      const adminUsernames = ['trust994', 'hamzu3'];
      const isAuthorizedAdmin = !!(u && (
        adminIds.includes(Number(u.telegram_id)) ||
        adminUsernames.includes((u.username || '').toLowerCase().replace('@', ''))
      ));

      state.isAdmin = isAuthorizedAdmin;

      try {
        const res = await apiFetch('/api/miniapp/profile');
        if (res.success && res.profile) {
          state.profile = res.profile;
          if (res.profile.is_admin || isAuthorizedAdmin) {
            state.isAdmin = true;
          } else {
            state.isAdmin = false;
          }
        }
      } catch (e) {
        console.warn('Profile load warning:', e);
      }

      profile.render();
    },

    render() {
      const nameEl = document.getElementById('profile-name');
      const userEl = document.getElementById('profile-username');
      const idEl = document.getElementById('profile-id');
      const avatarEl = document.getElementById('profile-avatar');

      const u = state.user;
      if (u) {
        if (nameEl) nameEl.textContent = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Valued Customer';
        if (userEl) userEl.textContent = u.username ? `@${u.username}` : '';
        if (idEl) idEl.textContent = u.telegram_id || '';
        if (avatarEl) {
          const initials = (u.first_name ? u.first_name[0] : 'C').toUpperCase();
          avatarEl.textContent = initials;
        }
      }

      const p = state.profile;
      if (p) {
        const totalSpentEl = document.getElementById('profile-total-spent');
        const totalOrdersEl = document.getElementById('profile-total-orders');
        const completedOrdersEl = document.getElementById('profile-completed-orders');

        if (totalSpentEl) totalSpentEl.textContent = utils.formatCurrency(p.total_spent || 0);
        if (totalOrdersEl) totalOrdersEl.textContent = p.total_orders || 0;
        if (completedOrdersEl) completedOrdersEl.textContent = p.completed_orders || 0;
      }

      const isStoreAdmin = !!(state.isAdmin || state.profile?.is_admin || state.user?.is_admin);
      if (isStoreAdmin) {
        state.isAdmin = true;
        profile.renderAdminCard();
      } else {
        state.isAdmin = false;
        const container = document.getElementById('profile-admin-container');
        if (container) container.innerHTML = '';
      }
    },

    renderAdminCard() {
      const container = document.getElementById('profile-admin-container');
      if (!container) return;
      const isMaint = !!state.config?.maintenance_mode;
      const totalProds = (state.products && state.products.length) || 0;

      container.innerHTML = `
        <div class="card admin-control-card" style="background: linear-gradient(135deg, rgba(0, 102, 255, 0.08), rgba(0, 102, 255, 0.02)); border: 1.5px solid var(--brand-primary); margin: 16px 0; border-radius: var(--radius-lg); padding: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">👑</span>
              <div>
                <strong style="font-size: 14px; color: var(--brand-primary); display: block;">Store Owner Administration</strong>
                <span style="font-size: 11px; color: var(--hint-color);">Authorized Admin Account Verified</span>
              </div>
            </div>
            <span style="background: var(--brand-primary); color: #fff; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 12px; letter-spacing: 0.5px;">ADMIN</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <button class="btn-primary" style="padding: 10px 8px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="TMA.admin.openProductEditor(null)">
              <span>➕</span>
              <span>Add Product</span>
            </button>
            <button class="btn-secondary" style="padding: 10px 8px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="TMA.admin.triggerSync(this)">
              <span>🔄</span>
              <span>Sync Catalog</span>
            </button>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <button class="btn-secondary" style="padding: 10px 8px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="TMA.admin.promptBanner()">
              <span>📢</span>
              <span>Edit Banner</span>
            </button>
            <button class="btn-secondary" style="padding: 10px 8px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="TMA.admin.toggleMaintenance(this)">
              <span>🛠️</span>
              <span id="admin-maint-btn-txt">${isMaint ? 'Disable Maint' : 'Maintenance'}</span>
            </button>
          </div>

          <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
            <a href="https://t.me/abdurea1_bot" target="_blank" class="btn-secondary" style="padding: 10px 8px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none;">
              <span>🤖</span>
              <span>Open Admin Bot (@abdurea1_bot)</span>
            </a>
          </div>
        </div>
      `;
    }
  };

  const info = {
    showPaymentAccounts() {
      utils.haptic('light');
      const drawer = document.getElementById('order-detail-modal');
      const content = document.getElementById('order-drawer-content');
      if (!drawer || !content) return;

      const tb = state.config?.payment_methods?.find(m => m.id === 'telebirr') || { account_number: '0992558519', account_name: '𝙁𝘼𝙍𝙃𝘼𝙉' };
      const cbe = state.config?.payment_methods?.find(m => m.id === 'cbe_birr') || { account_number: '1000572238575', account_name: '𝙁𝘼𝙍𝙃𝘼𝙉' };

      content.innerHTML = `
        <h3 style="font-family: var(--font-heading); font-size: 18px; font-weight: 800; margin-bottom: 12px;">Official Payment Accounts</h3>
        <p class="text-muted" style="font-size: 12px; margin-bottom: 16px;">ABDUREA STORE accepts Ethiopian domestic payments with fast verification.</p>

        <div class="payment-box">
          <div class="pay-detail-row">
            <span class="pay-label">Telebirr Account Number:</span>
            <div class="pay-copy-box">
              <span class="pay-code">${tb.account_number}</span>
              <button class="copy-btn" onclick="TMA.utils.copyText('${tb.account_number}')">Copy</button>
            </div>
          </div>
          <div class="pay-detail-row">
            <span class="pay-label">Account Holder Name:</span>
            <span class="pay-val">${tb.account_name}</span>
          </div>
        </div>

        <div class="payment-box">
          <div class="pay-detail-row">
            <span class="pay-label">CBE Account Number:</span>
            <div class="pay-copy-box">
              <span class="pay-code">${cbe.account_number}</span>
              <button class="copy-btn" onclick="TMA.utils.copyText('${cbe.account_number}')">Copy</button>
            </div>
          </div>
          <div class="pay-detail-row">
            <span class="pay-label">Account Holder Name:</span>
            <span class="pay-val">${cbe.account_name}</span>
          </div>
        </div>
      `;

      drawer.classList.remove('hidden');
      if (tg?.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(() => drawer.classList.add('hidden'));
      }
    },

    showAbout() {
      utils.haptic('light');
      const drawer = document.getElementById('order-detail-modal');
      const content = document.getElementById('order-drawer-content');
      if (!drawer || !content) return;

      content.innerHTML = `
        <h3 style="font-family: var(--font-heading); font-size: 18px; font-weight: 800; margin-bottom: 12px;">About ABDUREA STORE</h3>
        <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin-bottom: 14px;">
          ABDUREA STORE is your premier destination for digital subscriptions, Pro AI accounts (Gemini Pro, ChatGPT Plus), streaming entertainment (Netflix, Spotify, Apple TV, Prime Video), and high-speed internet tools in Ethiopia.
        </p>

        <div style="background: var(--surface-card); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <h4 style="font-weight: 700; margin-bottom: 6px;">🛡️ Full Warranty Guarantee</h4>
          <p style="font-size: 12px; color: var(--hint-color); line-height: 1.5;">All account subscriptions come with dedicated replacement warranty and administrator support throughout the validity period.</p>
        </div>

        <div style="background: var(--surface-card); border-radius: 12px; padding: 14px;">
          <h4 style="font-weight: 700; margin-bottom: 6px;">🌐 Official Website</h4>
          <a href="https://abdureastore.base44.app/" target="_blank" style="color: #6366f1; font-weight: 600; font-size: 13px;">abdureastore.base44.app</a>
        </div>
      `;

      drawer.classList.remove('hidden');
      if (tg?.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(() => drawer.classList.add('hidden'));
      }
    }
  };

  // -------------------------------------------------------------
  // 13. BOOTSTRAP INITIALIZATION
  // -------------------------------------------------------------
    async function init() {
    // A. Telegram WebApp Setup
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (typeof tg.enableClosingConfirmation === 'function') {
          tg.enableClosingConfirmation();
        }
      } catch (e) {}

      // Identify user from Telegram WebApp
      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser && tgUser.id) {
        state.user = {
          telegram_id: tgUser.id,
          first_name: tgUser.first_name || '',
          last_name: tgUser.last_name || '',
          username: tgUser.username || '',
          is_premium: !!tgUser.is_premium
        };
        const adminIds = [6666443909, 2145055956];
        const adminUsernames = ['trust994', 'hamzu3'];
        if (adminIds.includes(Number(tgUser.id)) || adminUsernames.includes((tgUser.username || '').toLowerCase().replace('@', ''))) {
          state.isAdmin = true;
        } else {
          state.isAdmin = false;
        }
      }
    }

    // If outside Telegram or user not available (e.g. browser preview)
    if (!state.user) {
      const urlParams = new URLSearchParams(window.location.search);
      const isTestAdmin = urlParams.get('admin') === '1' || urlParams.get('tg_id') === '6666443909' || urlParams.get('user') === 'trust994';
      state.user = {
        telegram_id: isTestAdmin ? 6666443909 : 9988776655,
        first_name: isTestAdmin ? 'Admin' : 'Customer',
        last_name: '',
        username: isTestAdmin ? 'trust994' : 'customer'
      };
      state.isAdmin = isTestAdmin;
    }

    // Set greeting in header
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl && state.user.first_name) {
      greetingEl.textContent = `Hello, ${state.user.first_name} 👋`;
    }

    // B. Initialize Cart
    cart.init();

    // C. Search Input Debounce
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', utils.debounce((e) => {
        state.searchQuery = e.target.value;
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) {
          clearBtn.classList.toggle('hidden', !state.searchQuery);
        }
        catalog.applyFilters();
      }, 150));
    }

    // D. Fetch Profile & Catalog Data
    await profile.load();

    if (state.isAdmin || state.profile?.is_admin || state.user?.is_admin) {
      state.isAdmin = true;
      document.getElementById('catalog-admin-bar')?.classList.remove('hidden');
      document.getElementById('home-admin-bar')?.classList.remove('hidden');
      document.getElementById('admin-badge-header')?.classList.remove('hidden');
    } else {
      state.isAdmin = false;
      document.getElementById('catalog-admin-bar')?.classList.add('hidden');
      document.getElementById('home-admin-bar')?.classList.add('hidden');
      document.getElementById('admin-badge-header')?.classList.add('hidden');
    }

    await catalog.load();
  }

  // Expose global TMA controller for inline handlers
      // D. Fetch Profile & Catalog Data
    await profile.load();
    await catalog.load();

    // Reveal admin bars if channel admin
    if (state.profile?.is_admin || state.user?.is_admin) {
      document.getElementById('catalog-admin-bar')?.classList.remove('hidden');
      document.getElementById('home-admin-bar')?.classList.remove('hidden');
    }
  }

  const admin = {
    // PRESET CATALOG TEMPLATES FOR INSTANT PRODUCT CREATION
    presets: {
      'Telegram Premium': {
        name: 'Telegram Premium Subscription',
        desc: 'Official Telegram Premium subscription. Instant activation on your phone or username with badge, 4GB uploads, faster downloads, voice-to-text, and unique reactions.',
        image: 'https://media.base44.com/images/public/6aa86368309f7b3191d675d2/8cc83190c_logo.png',
        plans: [
          { name: '3 Months', duration: '3 Months', price: 1200 },
          { name: '6 Months', duration: '6 Months', price: 2100 },
          { name: '12 Months', duration: '12 Months', price: 3800 }
        ]
      },
      'ChatGPT': {
        name: 'ChatGPT Plus (GPT-4o)',
        desc: 'Official OpenAI ChatGPT Plus subscription. Access to GPT-4o, DALL-E 3 image generation, Advanced Voice Mode, and custom GPTs.',
        image: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg',
        plans: [
          { name: '1 Month', duration: '1 Month', price: 1300 },
          { name: '3 Months', duration: '3 Months', price: 3500 }
        ]
      },
      'Netflix': {
        name: 'Netflix Premium UHD 4K',
        desc: 'Private profile with PIN protection. Stream movies and TV shows in Ultra HD 4K with spatial audio and offline downloads on any device.',
        image: 'https://assets.nflxext.com/ffe/siteui/common/icons/monochrome-app-icon-144.png',
        plans: [
          { name: '1 Month', duration: '1 Month', price: 450 },
          { name: '3 Months', duration: '3 Months', price: 1250 },
          { name: '6 Months', duration: '6 Months', price: 2300 }
        ]
      },
      'Spotify': {
        name: 'Spotify Premium Individual',
        desc: 'Ad-free music listening, unlimited skips, offline download songs, and high-fidelity 320kbps audio playback.',
        image: 'https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Logo_RGB_Green.png',
        plans: [
          { name: '1 Month', duration: '1 Month', price: 350 },
          { name: '3 Months', duration: '3 Months', price: 950 },
          { name: '1 Year', duration: '1 Year', price: 2800 }
        ]
      },
      'YouTube': {
        name: 'YouTube Premium Individual',
        desc: 'Watch YouTube without ads, background play on mobile while using other apps, offline video downloads, and full access to YouTube Music Premium.',
        image: 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png',
        plans: [
          { name: '1 Month', duration: '1 Month', price: 380 },
          { name: '3 Months', duration: '3 Months', price: 1050 },
          { name: '1 Year', duration: '1 Year', price: 3200 }
        ]
      },
      'Canva': {
        name: 'Canva Pro Full Access',
        desc: 'Unlimited access to 100M+ premium stock photos, graphics, videos, 1000+ brand kits, background remover, and magic resize tools.',
        image: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Canva_icon_2021.svg',
        plans: [
          { name: '1 Month', duration: '1 Month', price: 300 },
          { name: '1 Year', duration: '1 Year', price: 1500 }
        ]
      },
      'VPN': {
        name: 'Fast Secure VPN Unlimited',
        desc: 'High-speed dedicated servers worldwide with military-grade encryption, zero logs, bypass geo-restrictions, and works on all devices.',
        image: 'https://placehold.co/300x300/0066FF/ffffff?text=VPN+PRO',
        plans: [
          { name: '1 Month', duration: '1 Month', price: 250 },
          { name: '6 Months', duration: '6 Months', price: 1200 },
          { name: '1 Year', duration: '1 Year', price: 2100 }
        ]
      }
    },

    openProductEditor(productId = null) {
      utils.haptic('light');
      const modal = document.getElementById('admin-product-modal');
      const titleEl = document.getElementById('admin-product-modal-title');
      const idInput = document.getElementById('admin-prod-id');
      const nameInput = document.getElementById('admin-prod-name');
      const catSelect = document.getElementById('admin-prod-category');
      const imgInput = document.getElementById('admin-prod-image');
      const descInput = document.getElementById('admin-prod-desc');
      const activeInput = document.getElementById('admin-prod-active');
      const saveText = document.getElementById('admin-prod-save-text');
      const deleteBtn = document.getElementById('admin-prod-delete-btn');
      const plansContainer = document.getElementById('admin-plans-container');

      if (!modal) return;

      // Populate categories dropdown
      if (catSelect) {
        catSelect.innerHTML = state.categories.map(c => `
          <option value="${c.id}">${c.icon || '📦'} ${c.name}</option>
        `).join('');
      }

      if (plansContainer) plansContainer.innerHTML = '';

      if (productId) {
        // Mode: EDIT PRODUCT
        const p = state.products.find(item => item.id === productId);
        if (!p) return;

        titleEl.textContent = `✏️ Edit Product: ${p.name}`;
        idInput.value = p.id;
        nameInput.value = p.name || '';
        if (catSelect) catSelect.value = p.category_id || (state.categories[0] ? state.categories[0].id : '');
        imgInput.value = p.image_url || '';
        descInput.value = p.description || '';
        activeInput.checked = p.active !== 0;
        saveText.textContent = 'Save Changes';
        if (deleteBtn) deleteBtn.style.display = 'flex';

        admin.previewImage(p.image_url || '');

        // Populate plans
        const plans = (p.plans && p.plans.length > 0) ? p.plans : [{ name: 'Standard', duration: '1 Month', price: p.min_price || 0 }];
        plans.forEach(pl => admin.addPlanRow(pl));
      } else {
        // Mode: ADD PRODUCT
        titleEl.textContent = '✨ Add New Product';
        idInput.value = '';
        nameInput.value = '';
        if (catSelect && state.categories.length > 0) catSelect.value = state.categories[0].id;
        imgInput.value = '';
        descInput.value = '';
        activeInput.checked = true;
        saveText.textContent = 'Create Product';
        if (deleteBtn) deleteBtn.style.display = 'none';

        admin.previewImage('');

        // Default plans
        admin.addPlanRow({ name: '1 Month', duration: '1 Month', price: 450 });
        admin.addPlanRow({ name: '3 Months', duration: '3 Months', price: 1200 });
      }

      modal.classList.remove('hidden');

      if (tg?.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(admin.closeProductModal);
      }
    },

    closeProductModal() {
      utils.haptic('light');
      const modal = document.getElementById('admin-product-modal');
      modal?.classList.add('hidden');
      if (tg?.BackButton) {
        tg.BackButton.hide();
      }
    },

    handleModalBackdrop(e) {
      if (e.target.id === 'admin-product-modal') {
        admin.closeProductModal();
      }
    },

    previewImage(url) {
      const img = document.getElementById('admin-img-preview');
      const placeholder = document.getElementById('admin-img-placeholder');
      if (!img || !placeholder) return;
      if (url && url.trim().startsWith('http')) {
        img.src = url.trim();
        img.style.display = 'block';
        placeholder.style.display = 'none';
        img.onerror = () => {
          img.style.display = 'none';
          placeholder.style.display = 'block';
        };
      } else {
        img.style.display = 'none';
        placeholder.style.display = 'block';
      }
    },

    applyPreset(type) {
      const preset = admin.presets[type];
      if (!preset) return;
      utils.haptic('light');
      const nameInput = document.getElementById('admin-prod-name');
      const descInput = document.getElementById('admin-prod-desc');
      const imgInput = document.getElementById('admin-prod-image');
      const plansContainer = document.getElementById('admin-plans-container');

      if (nameInput) {
        nameInput.value = preset.name;
        if (descInput) descInput.value = preset.desc;
        if (imgInput) {
          imgInput.value = preset.image;
          admin.previewImage(preset.image);
        }
        if (plansContainer) {
          plansContainer.innerHTML = '';
          preset.plans.forEach(pl => admin.addPlanRow(pl));
        }
        toast.show(`Preset loaded: ${type}`, 'info', 2000);
      }
    },

    addPlanRow(pl = { name: 'Standard', duration: '1 Month', price: 0 }) {
      const plansContainer = document.getElementById('admin-plans-container');
      if (!plansContainer) return;
      utils.haptic('light');

      const row = document.createElement('div');
      row.className = 'plan-editor-row';
      row.innerHTML = `
        <input type="text" class="plan-row-dur" placeholder="Duration (e.g. 1 Month)" value="${pl.duration || pl.name || '1 Month'}" style="flex: 2;" required>
        <div style="display: flex; align-items: center; gap: 4px; flex: 1.5;">
          <input type="number" class="plan-row-price" placeholder="Price" value="${Number(pl.price) || 0}" min="0" step="1" style="width: 100%;" required>
          <span style="font-size: 11px; font-weight: 700; color: var(--hint-color);">ETB</span>
        </div>
        <button type="button" onclick="TMA.admin.removePlanRow(this)" style="background: none; border: none; color: var(--color-danger); font-size: 16px; cursor: pointer; padding: 4px;" title="Remove this plan option">&times;</button>
      `;
      plansContainer.appendChild(row);
    },

    removePlanRow(btn) {
      utils.haptic('light');
      const container = document.getElementById('admin-plans-container');
      if (!container) return;
      if (container.children.length <= 1) {
        toast.show('A product must have at least one pricing plan.', 'warning');
        return;
      }
      btn.closest('.plan-editor-row')?.remove();
    },

    async saveProduct() {
      utils.haptic('medium');
      const prodId = document.getElementById('admin-prod-id')?.value.trim();
      const name = document.getElementById('admin-prod-name')?.value.trim();
      const catId = document.getElementById('admin-prod-category')?.value;
      const imgUrl = document.getElementById('admin-prod-image')?.value.trim();
      const desc = document.getElementById('admin-prod-desc')?.value.trim();
      const active = document.getElementById('admin-prod-active')?.checked ? 1 : 0;
      const saveBtn = document.getElementById('admin-prod-save-btn');
      const saveText = document.getElementById('admin-prod-save-text');

      if (!name) {
        toast.show('Please enter a product name', 'warning');
        return;
      }

      // Collect plans
      const rows = document.querySelectorAll('#admin-plans-container .plan-editor-row');
      const plans = [];
      rows.forEach(r => {
        const dur = r.querySelector('.plan-row-dur')?.value.trim();
        const price = parseFloat(r.querySelector('.plan-row-price')?.value) || 0;
        if (dur) {
          plans.push({
            name: dur,
            duration: dur,
            price: price,
            currency: 'ETB',
            active: 1
          });
        }
      });

      if (plans.length === 0) {
        toast.show('Please add at least one plan with price', 'warning');
        return;
      }

      const payload = {
        name,
        category_id: catId,
        image_url: imgUrl,
        description: desc,
        active,
        plans
      };

      if (saveBtn) saveBtn.disabled = true;
      if (saveText) saveText.textContent = 'Saving...';

      try {
        let res;
        if (prodId) {
          res = await apiFetch(`/api/miniapp/admin/products/${prodId}/update`, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        } else {
          res = await apiFetch('/api/miniapp/admin/products/create', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        }

        if (res.success) {
          admin.closeProductModal();
          toast.show(prodId ? `✅ Product "${name}" updated!` : `✅ Product "${name}" created!`, 'success', 3000);
          await catalog.load(true);
        } else {
          toast.show(`Error: ${res.error || 'Could not save'}`, 'error');
        }
      } catch (err) {
        toast.show(`Save error: ${err.message || err}`, 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (saveText) saveText.textContent = prodId ? 'Save Changes' : 'Create Product';
      }
    },

    async confirmDeleteProduct(prodId, prodName) {
      utils.haptic('warning');
      const msg = `Are you sure you want to permanently delete "${prodName}" from the store?`;
      const confirmed = window.confirm(msg);
      if (!confirmed) return;

      toast.show(`Deleting ${prodName}...`, 'info', 2000);
      try {
        const res = await apiFetch(`/api/miniapp/admin/products/${prodId}/delete`, {
          method: 'POST'
        });
        if (res.success) {
          toast.show(`🗑️ Product "${prodName}" deleted.`, 'success', 3000);
          await catalog.load(true);
        } else {
          toast.show(`Delete error: ${res.error || 'Failed'}`, 'error');
        }
      } catch (err) {
        toast.show(`Delete error: ${err.message || err}`, 'error');
      }
    },

    async confirmDeleteFromModal() {
      const prodId = document.getElementById('admin-prod-id')?.value.trim();
      const name = document.getElementById('admin-prod-name')?.value.trim();
      if (!prodId) return;

      const confirmed = window.confirm(`Permanently remove "${name}" from store?`);
      if (!confirmed) return;

      try {
        const res = await apiFetch(`/api/miniapp/admin/products/${prodId}/delete`, {
          method: 'POST'
        });
        if (res.success) {
          admin.closeProductModal();
          toast.show(`🗑️ Product "${name}" deleted.`, 'success', 3000);
          await catalog.load(true);
        }
      } catch (err) {
        toast.show(`Delete error: ${err.message || err}`, 'error');
      }
    },

    async toggleProduct(prodId) {
      utils.haptic('light');
      try {
        const res = await apiFetch(`/api/miniapp/admin/products/${prodId}/toggle`, {
          method: 'POST'
        });
        if (res.success) {
          toast.show(res.active ? '✅ Product is now Active in Store' : '👁️ Product Hidden (Draft)', res.active ? 'success' : 'info');
          await catalog.load(true);
        }
      } catch (err) {
        toast.show(`Toggle error: ${err.message || err}`, 'error');
      }
    },

    async triggerSync(btn) {
      utils.haptic('medium');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Syncing...</span>';
      }
      try {
        const res = await apiFetch('/api/miniapp/admin/sync', { method: 'POST' });
        if (res.success && res.result) {
          const r = res.result;
          toast.show(`✅ Synced ${r.categories || 0} categories, ${r.products || 0} products, ${r.plans || 0} plans!`, 'success', 4000);
          await catalog.load(true);
        } else {
          toast.show('Notice: Live sync completed.', 'info');
        }
      } catch (err) {
        toast.show(`Sync error: ${err.message || err}`, 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🔄</span><span>Sync Base44</span>';
        }
      }
    },

    async promptBanner() {
      utils.haptic('light');
      const current = state.config?.banner_text || '';
      const text = prompt('Enter Announcement Banner text to display on Mini App (or type OFF to remove):', current);
      if (text === null) return;
      const isOff = text.trim().toLowerCase() === 'off' || !text.trim();
      try {
        const res = await apiFetch('/api/miniapp/admin/banner', {
          method: 'POST',
          body: JSON.stringify({ banner_text: isOff ? '' : text.trim(), active: !isOff })
        });
        if (res.success) {
          state.config.banner_text = res.banner_text;
          state.config.banner_active = res.active;
          home.renderBanner();
          toast.show(isOff ? 'Announcement banner removed.' : 'Announcement banner published live!', 'success');
        }
      } catch (err) {
        toast.show(`Banner update error: ${err.message || err}`, 'error');
      }
    },

    async toggleMaintenance(btn) {
      utils.haptic('medium');
      const cur = !!state.config?.maintenance_mode;
      const nextState = !cur;
      try {
        const res = await apiFetch('/api/miniapp/admin/maintenance', {
          method: 'POST',
          body: JSON.stringify({ maintenance: nextState })
        });
        if (res.success) {
          state.config.maintenance_mode = res.maintenance_mode;
          home.checkMaintenance();
          const txtEl = document.getElementById('admin-maint-btn-txt');
          if (txtEl) txtEl.textContent = res.maintenance_mode ? 'Disable Maintenance' : 'Enable Maintenance';
          toast.show(res.maintenance_mode ? '⚠️ Maintenance Mode ENABLED' : '✅ Store is now LIVE', res.maintenance_mode ? 'warning' : 'success');
        }
      } catch (err) {
        toast.show(`Maintenance update error: ${err.message || err}`, 'error');
      }
    },

    async disableMaintenance() {
      try {
        const res = await apiFetch('/api/miniapp/admin/maintenance', {
          method: 'POST',
          body: JSON.stringify({ maintenance: false })
        });
        if (res.success) {
          state.config.maintenance_mode = false;
          home.checkMaintenance();
          toast.show('✅ Store is now LIVE to all customers', 'success');
        }
      } catch (err) {}
    }
  };

  window.TMA = {
    admin,

    state,
    utils,
    toast,
    nav,
    catalog,
    home,
    productModal,
    cart,
    checkout,
    orders,
    profile,
    info
  };

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

