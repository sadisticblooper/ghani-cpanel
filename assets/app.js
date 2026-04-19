(() => {
  const getPathDepth = () => {
    const path = window.location.pathname;
    if (path.includes("/admin/") || path.includes("/dashboard/") || path.includes("/login/") || path.includes("/packages/") || path.includes("/portal/")) return "../";
    return "./";
  };
  const PATH_PREFIX = getPathDepth();

  const API_BASE = "https://alsininvestment.com/api";

  const TOKEN_KEY = "cgi-token";

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);

  let _cachedState = null;
  const getCachedState = () => _cachedState ? normaliseState(_cachedState) : null;
  const setCachedState = (state) => { _cachedState = JSON.parse(JSON.stringify(state)); };
  const clearCachedState = () => { _cachedState = null; };

  const apiHeaders = () => ({
    "Content-Type": "application/json",
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  });

  const fetchStateFromAPI = async () => {
    if (!getToken()) return null;
    try {
      const res = await fetch(`${API_BASE}/user/state`, { headers: apiHeaders() });
      if (!res.ok) { clearToken(); return null; }
      const data = await res.json();
      const state = data.state ? normaliseState(data.state) : null;
      if (state && state.profile && state.profile.username) {
        state.profile.isLoggedIn = true;
      }
      return state;
    } catch { return null; }
  };

  const pushStateToAPI = async (state) => {
    if (!getToken()) return;
    try {
      await fetch(`${API_BASE}/user/state`, {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({ state }),
      });
    } catch {}
  };

  let pushTimer = null;
  const debouncedPush = (state) => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushStateToAPI(state), 5000);
  };

  const PACKAGE_AMOUNTS = [
    385, 995, 1985, 2995, 3885, 4795, 7785, 11695, 21685, 31695,
    43685, 63695, 83685, 136695, 189685, 289695, 387685, 485695, 1087965, 2085895
  ];
  const MONTHLY_RATIO = 0.04;
  const DAILY_RATIO = MONTHLY_RATIO / 30;
  const PER_SECOND_RATIO = DAILY_RATIO / 86400;
  const WITHDRAWAL_THRESHOLD = 200;
  const NUMBER_FORMATTER = new Intl.NumberFormat("en-PK");
  const MONEY_FORMATTER = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const PACKAGES = PACKAGE_AMOUNTS.map((amount, index) => {
    const number = index + 1;
    const code = String(number).padStart(2, "0");
    return {
      id: number,
      code: `Package ${code}`,
      slug: `package-${code}.html`,
      amount,
      monthlyProfit: amount * MONTHLY_RATIO,
      dailyProfit: amount * DAILY_RATIO
    };
  });

  const formatAmount = (value) => `PKR ${NUMBER_FORMATTER.format(Math.round(Number(value || 0)))}`;
  const formatMoney = (value) => `PKR ${MONEY_FORMATTER.format(Number(value || 0))}`;
  const pluralise = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  const stamp = (value = Date.now()) =>
    new Date(value).toLocaleString("en-PK", {
      dateStyle: "medium",
      timeStyle: "short"
    });

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const createId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const emptyProfile = () => ({
    username: "",
    phone: "",
    email: "",
    password: "",
    memberId: "",
    joinedAt: null,
    isLoggedIn: false
  });

  const holdingTemplate = () => ({
    units: 0,
    invested: 0,
    profit: 0,
    pendingWithdrawal: 0,
    paidOut: 0
  });

  const defaultState = () => ({
    profile: emptyProfile(),
    availableBalance: 0,
    holdings: {},
    investmentRequests: [],
    withdrawalRequests: [],
    activities: [
      {
        tone: "info",
        message: "CGI Pakistan investor registration is open and operations monitoring is active.",
        at: stamp(),
        createdAt: Date.now()
      }
    ]
  });

  const normaliseProfile = (raw) => {
    const safe = raw && typeof raw === "object" ? raw : {};
    const username = typeof safe.username === "string" ? safe.username.trim() : "";
    const email = typeof safe.email === "string" ? safe.email.trim() : "";
    const phone = typeof safe.phone === "string" ? safe.phone.trim() : "";
    return {
      username,
      phone,
      email,
      password: typeof safe.password === "string" ? safe.password : "",
      memberId: typeof safe.memberId === "string" ? safe.memberId : "",
      joinedAt: Number.isFinite(safe.joinedAt) ? safe.joinedAt : null,
      isLoggedIn: Boolean(safe.isLoggedIn && username)
    };
  };

  const normaliseHolding = (raw) => {
    const safe = raw && typeof raw === "object" ? raw : {};
    return {
      units: Number.isFinite(safe.units) ? safe.units : 0,
      invested: Number.isFinite(safe.invested) ? safe.invested : 0,
      profit: Number.isFinite(safe.profit) ? safe.profit : 0,
      pendingWithdrawal: Number.isFinite(safe.pendingWithdrawal) ? safe.pendingWithdrawal : 0,
      paidOut: Number.isFinite(safe.paidOut) ? safe.paidOut : 0,
      approvedAt: Number.isFinite(safe.approvedAt) ? safe.approvedAt : null
    };
  };

  const normaliseHoldingsMap = (rawHoldings) => {
    const result = {};
    if (!rawHoldings) return result;
    for (const key in rawHoldings) {
      const pkgId = Number(key);
      if (pkgId) {
        result[pkgId] = normaliseHolding(rawHoldings[key]);
      }
    }
    return result;
  };

  const normaliseInvestmentRequest = (raw) => {
    const safe = raw && typeof raw === "object" ? raw : {};
    return {
      id: typeof safe.id === "string" ? safe.id : createId("INV"),
      packageId: Number(safe.packageId) || 0,
      units: Number(safe.units) || 0,
      amount: Number(safe.amount) || 0,
      status: typeof safe.status === "string" ? safe.status : "pending",
      createdAt: Number.isFinite(safe.createdAt) ? safe.createdAt : Date.now(),
      reviewedAt: Number.isFinite(safe.reviewedAt) ? safe.reviewedAt : null
    };
  };

  const normaliseWithdrawalRequest = (raw) => {
    const safe = raw && typeof raw === "object" ? raw : {};
    return {
      id: typeof safe.id === "string" ? safe.id : createId("WDR"),
      packageId: Number(safe.packageId) || 0,
      amount: Number(safe.amount) || 0,
      status: typeof safe.status === "string" ? safe.status : "pending",
      createdAt: Number.isFinite(safe.createdAt) ? safe.createdAt : Date.now(),
      reviewedAt: Number.isFinite(safe.reviewedAt) ? safe.reviewedAt : null
    };
  };

  const normaliseActivity = (raw) => {
    const safe = raw && typeof raw === "object" ? raw : {};
    return {
      tone: typeof safe.tone === "string" ? safe.tone : "info",
      message: typeof safe.message === "string" ? safe.message : "",
      at: typeof safe.at === "string" ? safe.at : stamp(),
      createdAt: Number.isFinite(safe.createdAt) ? safe.createdAt : Date.now()
    };
  };

  const normaliseState = (raw) => {
    const safe = raw && typeof raw === "object" ? raw : {};
    const state = {
      profile: normaliseProfile(safe.profile),
      availableBalance: Number.isFinite(safe.availableBalance)
        ? safe.availableBalance
        : Number.isFinite(safe.walletBalance)
          ? safe.walletBalance
          : 0,
      holdings: {},
      investmentRequests: Array.isArray(safe.investmentRequests)
        ? safe.investmentRequests.map(normaliseInvestmentRequest)
        : [],
      withdrawalRequests: Array.isArray(safe.withdrawalRequests)
        ? safe.withdrawalRequests.map(normaliseWithdrawalRequest)
        : [],
      activities: Array.isArray(safe.activities)
        ? safe.activities.map(normaliseActivity)
        : Array.isArray(safe.transactions)
          ? safe.transactions.map((item) =>
              normaliseActivity({
                tone: item.tone,
                message: item.message,
                at: item.at,
                createdAt: Date.now()
              })
            )
          : []
    };

    const rawHoldingsMap = normaliseHoldingsMap(safe.holdings);
    for (const pkgId in rawHoldingsMap) {
      state.holdings[pkgId] = rawHoldingsMap[pkgId];
    }
    PACKAGES.forEach((pkg) => {
      if (!state.holdings[pkg.id]) {
        state.holdings[pkg.id] = holdingTemplate();
      }
    });

    if (!state.activities.length) {
      state.activities = defaultState().activities;
    }

    if (!state.withdrawalRequests.length) {
      PACKAGES.forEach((pkg) => {
        const holding = state.holdings[pkg.id];
        if (holding.pendingWithdrawal > 0) {
          state.withdrawalRequests.push({
            id: createId("WDR"),
            packageId: pkg.id,
            amount: holding.pendingWithdrawal,
            status: "pending",
            createdAt: Date.now(),
            reviewedAt: null
          });
        }
      });
    }

    return state;
  };

  const loadStoredState = () => {
    const cached = getCachedState();
    return cached || normaliseState(defaultState());
  };

  const saveState = (state) => {
    setCachedState(state);
    debouncedPush(state);
  };

  const getHolding = (state, packageId) => {
    if (!state.holdings[packageId]) {
      state.holdings[packageId] = holdingTemplate();
    }
    return state.holdings[packageId];
  };

  const getPackage = (packageId) => PACKAGES.find((item) => item.id === Number(packageId));
  const getPackageByAmount = (amount) => PACKAGES.find((item) => item.amount === Number(amount));
  const packageHref = (pkg) => `${PATH_PREFIX}packages/?id=${pkg.id}`;
  const isLoggedIn = (state) => Boolean(state.profile && state.profile.isLoggedIn && state.profile.username);
  const profileName = (state) => (isLoggedIn(state) ? state.profile.username : "Investor Access");
  const memberLabel = (state) => (state.profile.memberId ? state.profile.memberId : "Registration Pending");

  const resolvePackageFromQuery = () => {
    const params = new URLSearchParams(window.location.search);
    return getPackage(params.get("id")) || getPackageByAmount(params.get("amount")) || PACKAGES[0];
  };

  const addActivity = (state, message, tone = "info") => {
    state.activities.unshift({
      tone,
      message,
      at: stamp(),
      createdAt: Date.now()
    });
    state.activities = state.activities.slice(0, 36);
  };

  const pendingInvestmentAmount = (state) =>
    state.investmentRequests
      .filter((item) => item.status === "pending")
      .reduce((total, item) => total + item.amount, 0);

  const summary = (state) =>
    PACKAGES.reduce(
      (stats, pkg) => {
        const holding = getHolding(state, pkg.id);
        stats.invested += holding.invested;
        stats.profit += holding.profit;
        stats.pendingWithdrawalAmount += holding.pendingWithdrawal;
        stats.units += holding.units;
        stats.paidOut += holding.paidOut;
        if (holding.units > 0) {
          stats.activePackages += 1;
        }
        return stats;
      },
      {
        invested: 0,
        profit: 0,
        pendingWithdrawalAmount: 0,
        units: 0,
        paidOut: 0,
        activePackages: 0,
        pendingInvestmentAmount: pendingInvestmentAmount(state),
        pendingInvestmentCount: state.investmentRequests.filter((item) => item.status === "pending").length,
        pendingWithdrawalCount: state.withdrawalRequests.filter((item) => item.status === "pending").length
      }
    );

  const getLiveState = () => loadStoredState();

  const updateState = (mutator) => {
    const state = getLiveState();
    const result = mutator(state) || {};
    saveState(state);
    return { state, ...result };
  };

  const setFeedback = (node, message, tone = "info") => {
    if (!node) {
      return;
    }
    node.className = "feedback";
    if (tone === "success") {
      node.classList.add("is-success");
    } else if (tone === "warning") {
      node.classList.add("is-warning");
    } else if (tone === "danger") {
      node.classList.add("is-danger");
    }
    node.textContent = message;
  };

  const renderStats = (container, items) => {
    if (!container) {
      return;
    }
    container.innerHTML = items
      .map(
        (item) => `
          <article class="stat-card">
            <span class="stat-label">${escapeHtml(item.label)}</span>
            <strong class="stat-value">${escapeHtml(item.value)}</strong>
            <div class="stat-help">${escapeHtml(item.help)}</div>
          </article>
        `
      )
      .join("");
  };

  const renderSummaryList = (container, rows) => {
    if (!container) {
      return;
    }
    container.innerHTML = `
      <dl class="summary-list">
        ${rows
          .map(
            (row) => `
              <div class="summary-row">
                <dt>${escapeHtml(row.label)}</dt>
                <dd>${escapeHtml(row.value)}</dd>
              </div>
            `
          )
          .join("")}
      </dl>
    `;
  };

  const renderActivity = (state, container, limit) => {
    if (!container) {
      return;
    }
    const items = limit ? state.activities.slice(0, limit) : state.activities;
    container.innerHTML = `
      <div class="activity-list">
        ${items
          .map(
            (item) => `
              <article class="activity-item tone-${escapeHtml(item.tone)}">
                <span class="activity-time">${escapeHtml(item.at)}</span>
                <div class="activity-text">${escapeHtml(item.message)}</div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderActivityFlat = (container, state) => {
    if (!container) {
      return;
    }

    const items = state.activities || [];
    if (!items.length) {
      container.innerHTML = '<div style="color: var(--text-3);">No recent activity</div>';
      return;
    }

    const expanded = container.dataset.expanded === "true";
    const limit = 10;
    const displayed = expanded ? items : items.slice(0, limit);
    const hasMore = items.length > limit;

    container.innerHTML = displayed
      .map((item) => {
        const tone = item.tone || "neutral";
        return `
        <div class="dash-activity-item tone-${escapeHtml(tone)}">
          <span>${escapeHtml(item.at)}</span>
          <strong>${escapeHtml(item.message)}</strong>
        </div>
        `;
      })
      .join("") + (hasMore
        ? `<button class="dash-btn dash-btn-sm dash-activity-more" data-show-more="true" style="margin-top: 8px;">${expanded ? "Show less" : "Show all " + items.length}</button>`
        : "");
  };

  const statusLabel = (status) => {
    if (status === "approved") {
      return "Approved";
    }
    if (status === "declined") {
      return "Declined";
    }
    return "Pending Review";
  };

  const emptyStateCard = (title, text) => `
    <article class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;

  const renderRequestList = (container, requests, type, options = {}) => {
    if (!container) return;

    if (!requests.length) {
      container.innerHTML = emptyStateCard(
        options.emptyTitle || "No activity yet",
        options.emptyText || "New requests will appear here once they are submitted."
      );
      return;
    }

    const sorted = requests.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const DEFAULT_LIMIT = 2;
    const limit = options.showAll ? sorted.length : DEFAULT_LIMIT;
    const visible = sorted.slice(0, limit);
    const hasMore = sorted.length > DEFAULT_LIMIT;

    const renderCards = (items) => items.map((request) => {
            const pkg = getPackage(request.packageId);
            const amount = request.amount;
            const unitRow =
              type === "investment"
                ? `<div class="summary-row"><dt>Units</dt><dd>${escapeHtml(String(request.units))}</dd></div>`
                : "";
            const actionButtons =
              options.admin && request.status === "pending"
                ? `<div class="button-row request-actions">
                      <button class="button primary" type="button"
                        data-admin-action="${type === "investment" ? "approve-investment" : "approve-withdrawal"}"
                        data-request-id="${escapeHtml(request.id)}">Approve</button>
                      <button class="button ghost" type="button"
                        data-admin-action="${type === "investment" ? "decline-investment" : "decline-withdrawal"}"
                        data-request-id="${escapeHtml(request.id)}">Decline</button>
                    </div>`
                : "";

            return `
              <article class="request-card">
                <div class="request-head">
                  <div>
                    <span class="request-kicker">${escapeHtml(type === "investment" ? "Investment Request" : "Withdrawal Request")}</span>
                    <h3>${escapeHtml(pkg ? pkg.code : "Package")}</h3>
                  </div>
                  <span class="status-chip is-${escapeHtml(request.status)}">${escapeHtml(statusLabel(request.status))}</span>
                </div>
                <dl class="summary-list compact">
                  <div class="summary-row">
                    <dt>${escapeHtml(type === "investment" ? "Requested Capital" : "Requested Amount")}</dt>
                    <dd>${escapeHtml(formatMoney(amount))}</dd>
                  </div>
                  ${unitRow}
                  <div class="summary-row"><dt>Submitted</dt><dd>${escapeHtml(stamp(request.createdAt))}</dd></div>
                  <div class="summary-row"><dt>Reviewed</dt><dd>${escapeHtml(request.reviewedAt ? stamp(request.reviewedAt) : "Awaiting review")}</dd></div>
                </dl>
                ${actionButtons}
              </article>`;
          }).join("");

    container.innerHTML = `<div class="request-grid">${renderCards(visible)}</div>`;

    if (hasMore && !options.showAll) {
      const btn = document.createElement("button");
      btn.className = "button ghost button-block";
      btn.style.marginTop = "8px";
      btn.textContent = `Show all ${sorted.length} requests`;
      btn.addEventListener("click", () => {
        renderRequestList(container, requests, type, { ...options, showAll: true });
      });
      container.appendChild(btn);
    }
  };

  const activeHoldings = (state) =>
    PACKAGES.map((pkg) => ({ pkg, holding: getHolding(state, pkg.id) }))
      .filter(({ holding }) => holding.invested > 0 || holding.profit > 0 || holding.pendingWithdrawal > 0 || holding.paidOut > 0);

  const renderHoldings = (container, state) => {
    if (!container) {
      return;
    }

    const items = activeHoldings(state);
    if (!items.length) {
      container.innerHTML = emptyStateCard(
        "No active packages yet",
        "Approved package placements will appear here once operations confirms a submitted capital request."
      );
      return;
    }

    container.innerHTML = items
      .map(
        ({ pkg, holding }) => `
          <article class="info-card">
            <span class="info-label">${escapeHtml(pkg.code)}</span>
            <strong class="info-value">${escapeHtml(formatMoney(holding.invested))}</strong>
            <div class="info-help">
              Approved units: ${escapeHtml(String(holding.units))}<br>
              Available profit: ${escapeHtml(formatMoney(holding.profit))}<br>
              Pending withdrawal: ${escapeHtml(formatMoney(holding.pendingWithdrawal))}
            </div>
            <div class="button-row" style="margin-top: 16px;">
              <a class="button-link ghost" href="${escapeHtml(packageHref(pkg))}">Open package</a>
            </div>
          </article>
        `
      )
      .join("");

    const showAllBtn = document.createElement("button");
    showAllBtn.className = "button ghost button-block";
    showAllBtn.style.marginTop = "12px";
    showAllBtn.textContent = "Show All Packages";
    showAllBtn.onclick = () => showAllPackagesModal(state);
    container.appendChild(showAllBtn);
  };

const showAllPackagesModal = (state) => {
    const closeModal = () => document.getElementById("packages-modal-overlay")?.remove();
    const existing = document.getElementById("packages-modal-overlay");
    if (existing) { existing.remove(); return; }
    
    const overlay = document.createElement("div");
    overlay.id = "packages-modal-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);padding:20px;";
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
    
    overlay.innerHTML = `
      <div style="background:#13161d;border:1px solid #252a38;border-radius:12px;width:100%;max-width:550px;max-height:85vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #252a38;">
          <strong style="color:#e8eaf0;font-size:1.1rem;">All Packages</strong>
          <button style="background:none;border:none;color:#9299ae;font-size:1.8rem;cursor:pointer;line-height:1;" onclick="document.getElementById('packages-modal-overlay').remove()">×</button>
        </div>
        <div style="padding:16px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr><th style="color:#5a6178;font-size:0.7rem;text-transform:uppercase;padding:10px 8px;text-align:left;border-bottom:1px solid #252a38;">Package</th><th style="color:#5a6178;font-size:0.7rem;text-transform:uppercase;padding:10px 8px;text-align:left;border-bottom:1px solid #252a38;">Invested</th><th style="color:#5a6178;font-size:0.7rem;text-transform:uppercase;padding:10px 8px;text-align:left;border-bottom:1px solid #252a38;">Profit/Month</th><th style="color:#5a6178;font-size:0.7rem;text-transform:uppercase;padding:10px 8px;text-align:left;border-bottom:1px solid #252a38;">Status</th></tr></thead>
            <tbody>
              ${PACKAGES.map(pkg => {
                const holding = getHolding(state, pkg.id);
                const monthly = holding.invested > 0 ? holding.invested * 0.04 : pkg.monthlyProfit;
                const isActive = holding.invested > 0;
                return `<tr>
                  <td style="color:#e8eaf0;padding:12px 8px;border-bottom:1px solid #252a38;">${pkg.code}</td>
                  <td style="color:#e8eaf0;padding:12px 8px;border-bottom:1px solid #252a38;">${isActive ? formatMoney(holding.invested) : "—"}</td>
                  <td style="color:${isActive ? '#22c55e' : '#e8eaf0'};padding:12px 8px;border-bottom:1px solid #252a38;font-weight:600;">${formatMoney(monthly)}</td>
                  <td style="color:${isActive ? '#22c55e' : '#5a6178'};padding:12px 8px;border-bottom:1px solid #252a38;">${isActive ? "Active" : "—"}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  };

  const renderHoldingsFlat = (container, state) => {
    if (!container) {
      return;
    }

    const items = activeHoldings(state);
    if (!items.length) {
      container.innerHTML = '<tr><td colspan="5" style="color: var(--text-3);">No active packages</td></tr>';
    } else {
      container.innerHTML = `<thead><tr><th>Package</th><th>Capital</th><th>Units</th><th>Profit</th><th></th></tr></thead><tbody>` +
        items
          .map(({ pkg, holding }) => {
            const hasPendingWd = state.withdrawalRequests.some(
              (r) => r.packageId === pkg.id && r.status === "pending"
            );
            const canWithdraw = holding.profit >= WITHDRAWAL_THRESHOLD && !hasPendingWd;
            const btnLabel = hasPendingWd ? "Pending" : "Withdraw";
            const btnDisabledAttr = canWithdraw ? "" : "disabled";
            return `
              <tr>
                <td>${escapeHtml(pkg.code)}</td>
                <td>${escapeHtml(formatMoney(holding.invested))}</td>
                <td>${escapeHtml(String(holding.units))}</td>
                <td class="profit-cell">${escapeHtml(formatMoney(holding.profit))}</td>
                <td>
                  <button class="dash-btn dash-btn-sm" data-withdraw-pkg="${pkg.id}" ${btnDisabledAttr}
                    style="font-size:0.75rem;padding:5px 12px;${canWithdraw ? "" : "opacity:0.4;cursor:not-allowed;"}">
                    ${escapeHtml(btnLabel)}
                  </button>
                </td>
              </tr>`;
          })
          .join("") + "</tbody>";
    }

    const wrapper = container.closest("div");
    const existingBtn = wrapper?.querySelector(".show-all-btn");
    if (!existingBtn) {
      const btn = document.createElement("button");
      btn.className = "button ghost show-all-btn";
      btn.style.marginTop = "12px";
      btn.textContent = "Show All Packages";
      btn.onclick = () => showAllPackagesModal(state);
      if (wrapper) wrapper.appendChild(btn);
    }
  };

  const renderPackageGrid = (state, container, options = {}) => {
    if (!container) {
      return;
    }

    const DEFAULT_VISIBLE = 3;
    const allItems = options.limit ? PACKAGES.slice(0, options.limit) : PACKAGES;
    let expanded = container.dataset.expanded === "true";

    const renderCards = () => {
      const items = expanded ? allItems : allItems.slice(0, DEFAULT_VISIBLE);
      const cards = items
        .map((pkg) => {
          const holding = getHolding(state, pkg.id);
          const pendingCount = state.investmentRequests.filter(
            (item) => item.packageId === pkg.id && item.status === "pending"
          ).length;
          return `
          <article class="package-card">
            <div class="package-topline">
              <span class="package-index">${escapeHtml(pkg.code)}</span>
              <span class="micro-chip">${escapeHtml(pendingCount ? `${pendingCount} pending` : "Open")}</span>
            </div>
            <h3 class="package-price">${escapeHtml(formatAmount(pkg.amount))}</h3>
            <p>Structured package entry with a projected 4% monthly return and full admin approval routing.</p>
            <dl class="metric-list">
              <div class="metric-row">
                <dt>Est. monthly</dt>
                <dd>${escapeHtml(formatMoney(pkg.monthlyProfit))}</dd>
              </div>
              <div class="metric-row">
                <dt>Est. daily</dt>
                <dd>${escapeHtml(formatMoney(pkg.dailyProfit))}</dd>
              </div>
              <div class="metric-row">
                <dt>Approved units</dt>
                <dd>${escapeHtml(String(holding.units))}</dd>
              </div>
              <div class="metric-row">
                <dt>Live profit</dt>
                <dd>${escapeHtml(formatMoney(holding.profit))}</dd>
              </div>
            </dl>
            <div class="button-row" style="margin-top: 14px;">
              <a class="button-link primary" href="${escapeHtml(`${PATH_PREFIX}buy/?id=${pkg.id}`)}">Buy</a>
              <a class="button-link ghost" href="${escapeHtml(packageHref(pkg))}">Details</a>
            </div>
          </article>
        `;
        })
        .join("");

      const showMoreBtn = allItems.length > DEFAULT_VISIBLE
        ? `<div style="grid-column: 1 / -1; display: flex; justify-content: center; margin-top: 4px;">
            <button class="button ghost" id="pkg-toggle-btn" type="button">
              ${expanded ? `Show fewer` : `Show all ${allItems.length} packages`}
            </button>
          </div>`
        : "";

      container.innerHTML = cards + showMoreBtn;

      const toggleBtn = container.querySelector("#pkg-toggle-btn");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          expanded = !expanded;
          container.dataset.expanded = String(expanded);
          renderCards();
        });
      }
    };

    renderCards();
  };

  const renderRouteGrid = (container, state) => {
    if (!container) {
      return;
    }
    container.innerHTML = PACKAGES.map((pkg) => {
      const holding = getHolding(state, pkg.id);
      return `
        <a class="route-link" href="${escapeHtml(packageHref(pkg))}">
          <div class="route-label">${escapeHtml(pkg.code)}</div>
          <strong class="stat-value" style="font-size: 1.18rem; margin-top: 14px;">${escapeHtml(formatAmount(pkg.amount))}</strong>
          <div class="stat-help">
            Approved units: ${escapeHtml(String(holding.units))}<br>
            Profit: ${escapeHtml(formatMoney(holding.profit))}
          </div>
        </a>
      `;
    }).join("");
  };

  const updateTopbarState = (state) => {
    const activeMap = {
      home: "home",
      packages: "packages",
      "package-query": "packages",
      dashboard: "portal",
      login: "portal",
      admin: "portal",
      portal: "portal"
    };
    const activeKey = activeMap[document.body.dataset.page] || "";

    document.querySelectorAll("[data-nav-link]").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.navLink === activeKey);
    });

    document.querySelectorAll("[data-profile-pill]").forEach((node) => {
      node.textContent = profileName(state);
    });

    document.querySelectorAll("[data-auth-link]").forEach((node) => {
      node.textContent = isLoggedIn(state) ? "Dashboard" : "Sign Up";
      node.setAttribute("href", `${PATH_PREFIX}portal/`);
    });

    document.querySelectorAll("[data-member-name]").forEach((node) => {
      node.textContent = isLoggedIn(state) ? state.profile.username : "Open Registration";
    });

    document.querySelectorAll("[data-member-id]").forEach((node) => {
      node.textContent = memberLabel(state);
    });

    document.querySelectorAll("[data-auth-state]").forEach((node) => {
      node.textContent = isLoggedIn(state) ? "Active Investor" : "Registration Open";
    });
  };

  const validateEmail = (value) => /\S+@\S+\.\S+/.test(String(value || "").trim());
  const cleanPhone = (value) => String(value || "").replace(/[^\d+]/g, "");

  const saveProfile = async ({ username, phone, email, password }) => {
    const cleanUsername = String(username || "").trim();
    const cleanPhoneValue = cleanPhone(phone);
    const cleanEmail = String(email || "").trim();
    const cleanPassword = String(password || "").trim();

    if (!cleanUsername) {
      return { ok: false, tone: "danger", message: "Enter the investor username to continue." };
    }
    if (!cleanPhoneValue || cleanPhoneValue.replace(/\D/g, "").length < 7) {
      return { ok: false, tone: "danger", message: "Enter a valid phone number for investor registration." };
    }
    if (!validateEmail(cleanEmail)) {
      return { ok: false, tone: "danger", message: "Enter a valid email address for investor registration." };
    }
    if (!cleanPassword) {
      return { ok: false, tone: "danger", message: "Create a password to complete the investor account." };
    }

    try {
      let registerRes = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, email: cleanEmail, password: cleanPassword, phone: cleanPhoneValue }),
      });

      if (!registerRes.ok && registerRes.status !== 409) {
        const err = await registerRes.json().catch(() => ({}));
        return { ok: false, tone: "danger", message: err.error || "Registration failed. Please try again." };
      }

      const loginRes = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      });

      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}));
        return { ok: false, tone: "danger", message: err.error || "Login failed. Check your credentials." };
      }

      const loginData = await loginRes.json();
      setToken(loginData.token);

      const apiState = await fetchStateFromAPI();

      let finalState;
      if (apiState && apiState.profile && apiState.profile.username) {
        finalState = apiState;
        finalState.profile.isLoggedIn = true;
        finalState.profile.phone = cleanPhoneValue;
        saveState(finalState);
      } else {
        const { state } = updateState((draft) => {
          draft.profile = {
            username: loginData.user.username,
            phone: cleanPhoneValue,
            email: loginData.user.email,
            password: "",
            memberId: loginData.user.memberId || `CGI-PK-${Date.now().toString().slice(-6)}`,
            joinedAt: loginData.user.joinedAt || Date.now(),
            isLoggedIn: true
          };
          draft.availableBalance = parseFloat(loginData.user.credits) || 0;
          addActivity(draft, `${loginData.user.username} completed investor registration and entered the portal.`, "success");
        });
        finalState = state;
        await pushStateToAPI(finalState);
      }

      return {
        ok: true,
        tone: "success",
        message: `${cleanUsername} is now active in the CGI Pakistan investor portal.`,
        state: finalState
      };
    } catch (err) {
      return { ok: false, tone: "danger", message: "Network error. Please check your connection and try again." };
    }
  };

  const logoutProfile = () => {
    const current = getLiveState();
    if (!isLoggedIn(current)) {
      return { ok: false, tone: "warning", message: "No investor session is currently active." };
    }

    const investorName = current.profile.username;

    clearTimeout(pushTimer);
    pushStateToAPI(current);

    clearToken();
    clearCachedState();

    const fresh = normaliseState(defaultState());
    setCachedState(fresh);

    return {
      ok: true,
      tone: "success",
      message: `${investorName} has been signed out.`,
      state: fresh
    };
  };

  const submitInvestmentRequest = (packageId, units, senderAccountNumber, proofBase64 = null) => {
    const pkg = getPackage(packageId);
    const parsedUnits = Number(units);

    if (!pkg) {
      return { ok: false, tone: "danger", message: "This package could not be found." };
    }
    if (!Number.isFinite(parsedUnits) || parsedUnits < 1) {
      return { ok: false, tone: "danger", message: "Select at least one package unit before sending the request." };
    }

    const state = getLiveState();
    if (!isLoggedIn(state)) {
      return { ok: false, tone: "warning", message: "Complete investor registration or sign in before requesting a package." };
    }

    if (!senderAccountNumber || !senderAccountNumber.trim()) {
      return { ok: false, tone: "warning", message: "Please enter the account number you sent the payment from." };
    }

    const total = pkg.amount * parsedUnits;

    const result = updateState((draft) => {
      draft.investmentRequests.unshift({
        id: createId("INV"),
        packageId: pkg.id,
        units: parsedUnits,
        amount: total,
        status: "pending",
        senderAccountNumber: senderAccountNumber.trim(),
        proofOfPayment: proofBase64 || null,
        createdAt: Date.now(),
        reviewedAt: null
      });
      addActivity(
        draft,
        `${draft.profile.username} submitted a capital request for ${pkg.code} worth ${formatAmount(total)}.`,
        "info"
      );
    });

    pushStateToAPI(result.state);

    if (getToken()) {
      fetch(`${API_BASE}/investments`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          packageId: pkg.id,
          packageCode: pkg.code,
          units: parsedUnits,
          amount: total,
          senderAccountNumber: senderAccountNumber.trim(),
          proofOfPayment: proofBase64 || null
        })
      }).catch(() => {});
    }

    return {
      ok: true,
      tone: "success",
      message: `${pkg.code} request submitted for ${formatAmount(total)}. Operations will confirm your payment shortly.`,
      state: result.state
    };
  };

  const approveInvestmentRequest = (requestId) => {
    const { state, ok, message } = updateState((draft) => {
      const request = draft.investmentRequests.find((item) => item.id === requestId);
      if (!request || request.status !== "pending") {
        return { ok: false, message: "That investment request is no longer awaiting approval." };
      }

      const pkg = getPackage(request.packageId);
      const holding = getHolding(draft, request.packageId);
      holding.units += request.units;
      holding.invested += request.amount;
      request.status = "approved";
      request.reviewedAt = Date.now();
      addActivity(
        draft,
        `${pkg.code} was approved for ${formatAmount(request.amount)} across ${request.units} unit${request.units === 1 ? "" : "s"}.`,
        "success"
      );
      return { ok: true, message: `${pkg.code} has been approved.` };
    });

    return { ok, tone: ok ? "success" : "warning", message, state };
  };

  const declineInvestmentRequest = (requestId) => {
    const { state, ok, message } = updateState((draft) => {
      const request = draft.investmentRequests.find((item) => item.id === requestId);
      if (!request || request.status !== "pending") {
        return { ok: false, message: "That investment request is no longer awaiting review." };
      }
      const pkg = getPackage(request.packageId);
      request.status = "declined";
      request.reviewedAt = Date.now();
      addActivity(draft, `${pkg.code} investment request was declined by operations.`, "warning");
      return { ok: true, message: `${pkg.code} request has been declined.` };
    });

    return { ok, tone: ok ? "success" : "warning", message, state };
  };

  const requestWithdrawal = async (packageId, requestedAmount, bankName, accountTitle, accountNumber) => {
    const pkg = getPackage(packageId);
    if (!pkg) {
      return { ok: false, tone: "danger", message: "This package could not be found." };
    }

    const state = getLiveState();
    if (!isLoggedIn(state)) {
      return { ok: false, tone: "warning", message: "Sign in before requesting a withdrawal." };
    }

    if (!getToken()) {
      return { ok: false, tone: "warning", message: "Session expired. Please sign in again." };
    }

    const holding = getHolding(state, pkg.id);
    const amount = Number(requestedAmount);

    if (!Number.isFinite(amount) || amount < WITHDRAWAL_THRESHOLD) {
      return {
        ok: false,
        tone: "warning",
        message: `Minimum withdrawal amount is ${formatAmount(WITHDRAWAL_THRESHOLD)}.`
      };
    }

    if (amount > holding.profit) {
      return {
        ok: false,
        tone: "warning",
        message: `Cannot exceed available profit of ${formatMoney(holding.profit)}.`
      };
    }

    const alreadyPending = state.withdrawalRequests.some((item) => item.packageId === pkg.id && item.status === "pending");
    if (alreadyPending) {
      return { ok: false, tone: "warning", message: `${pkg.code} already has a withdrawal request awaiting review.` };
    }

    try {
      const res = await fetch(`${API_BASE}/withdrawals`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          packageId: pkg.id,
          packageCode: pkg.code,
          amount,
          bankName,
          accountTitle,
          accountNumber
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, tone: "danger", message: err.error || "Failed to submit withdrawal request." };
      }

      const data = await res.json();
      const withdrawalId = data.id;

      const result = updateState((draft) => {
        const currentHolding = getHolding(draft, pkg.id);
        currentHolding.profit = Math.max(0, currentHolding.profit - amount);
        currentHolding.pendingWithdrawal += amount;
        draft.withdrawalRequests.unshift({
          id: withdrawalId,
          packageId: pkg.id,
          amount,
          status: "pending",
          createdAt: Date.now(),
          reviewedAt: null
        });
        addActivity(draft, `${draft.profile.username} requested withdrawal of ${formatMoney(amount)} from ${pkg.code}.`, "warning");
      });

      pushStateToAPI(result.state);

      return {
        ok: true,
        tone: "success",
        message: `${pkg.code} withdrawal request of ${formatMoney(amount)} was sent to admin for approval.`,
        state: result.state
      };
    } catch {
      return { ok: false, tone: "danger", message: "Network error. Please try again." };
    }
  };

  const approveWithdrawalRequest = (requestId) => {
    const { state, ok, message } = updateState((draft) => {
      const request = draft.withdrawalRequests.find((item) => item.id === requestId);
      if (!request || request.status !== "pending") {
        return { ok: false, message: "That withdrawal request is no longer awaiting approval." };
      }
      const pkg = getPackage(request.packageId);
      const holding = getHolding(draft, request.packageId);
      holding.pendingWithdrawal = Math.max(0, holding.pendingWithdrawal - request.amount);
      holding.paidOut += request.amount;
      draft.availableBalance += request.amount;
      request.status = "approved";
      request.reviewedAt = Date.now();
      addActivity(draft, `${pkg.code} withdrawal for ${formatMoney(request.amount)} was approved and released to investor balance.`, "success");
      return { ok: true, message: `${pkg.code} withdrawal approved.` };
    });

    return { ok, tone: ok ? "success" : "warning", message, state };
  };

  const declineWithdrawalRequest = (requestId) => {
    const { state, ok, message } = updateState((draft) => {
      const request = draft.withdrawalRequests.find((item) => item.id === requestId);
      if (!request || request.status !== "pending") {
        return { ok: false, message: "That withdrawal request is no longer awaiting review." };
      }
      const pkg = getPackage(request.packageId);
      const holding = getHolding(draft, request.packageId);
      holding.pendingWithdrawal = Math.max(0, holding.pendingWithdrawal - request.amount);
      holding.profit += request.amount;
      request.status = "declined";
      request.reviewedAt = Date.now();
      addActivity(draft, `${pkg.code} withdrawal request was returned to available profit.`, "warning");
      return { ok: true, message: `${pkg.code} withdrawal request declined.` };
    });

    return { ok, tone: ok ? "success" : "warning", message, state };
  };

  const addApprovedCapital = (amount) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, tone: "danger", message: "Enter a valid capital amount before approving it." };
    }

    const { state } = updateState((draft) => {
      draft.availableBalance += value;
      addActivity(draft, `Operations approved ${formatAmount(value)} of capital for investor placement.`, "success");
    });

    return {
      ok: true,
      tone: "success",
      message: `${formatAmount(value)} was added to available investor capital.`,
      state
    };
  };

  const applyDailyProfit = () => {
    const { state, credited } = updateState((draft) => {
      let totalCredited = 0;
      PACKAGES.forEach((pkg) => {
        const holding = getHolding(draft, pkg.id);
        if (holding.invested > 0) {
          const profit = holding.invested * DAILY_RATIO;
          holding.profit += profit;
          totalCredited += profit;
        }
      });

      if (totalCredited > 0) {
        addActivity(draft, `Operations applied one day of earnings across active packages: ${formatMoney(totalCredited)}.`, "success");
      }
      return { credited: totalCredited };
    });

    if (!credited) {
      return { ok: false, tone: "warning", message: "No approved packages are active for daily earnings yet." };
    }

    return {
      ok: true,
      tone: "success",
      message: `${formatMoney(credited)} was credited across active packages.`,
      state
    };
  };

  const resetPortal = () => {
    clearToken();
    clearCachedState();
    const fresh = normaliseState(defaultState());
    setCachedState(fresh);
    return {
      ok: true,
      tone: "success",
      message: "Investor registration, approvals, capital, and activity records have been reset.",
      state: fresh
    };
  };

  const refreshHome = (feedbackMessage, tone) => {
    const state = getLiveState();
    const totals = summary(state);
    updateTopbarState(state);

    renderStats(document.getElementById("home-stats"), [
      {
        label: "Investor Status",
        value: isLoggedIn(state) ? "Registered" : "Registration Open",
        help: isLoggedIn(state) ? `${profileName(state)} is active in the portal.` : "Complete sign up to request capital placement."
      },
      {
        label: "Available Capital",
        value: formatMoney(state.availableBalance),
        help: "Capital currently available for package requests and approved withdrawals."
      },
      {
        label: "Active Packages",
        value: String(totals.activePackages),
        help: `${pluralise(totals.units, "approved unit")} across live package placements.`
      },
      {
        label: "Pending Reviews",
        value: String(totals.pendingInvestmentCount + totals.pendingWithdrawalCount),
        help: "Investment and withdrawal instructions moving through operations review."
      }
    ]);

    renderPackageGrid(state, document.getElementById("home-package-grid"), { limit: 8 });
    renderActivity(state, document.getElementById("home-activity-feed"));

    if (feedbackMessage) {
      setFeedback(document.getElementById("home-feedback"), feedbackMessage, tone);
    }
  };

  const togglePackageViews = (showDetail) => {
    const detailEls = ["detail-banner", "detail-actions", "detail-position", "detail-requests-grid", "detail-routes", "detail-activity"];
    const listEls = ["listing-banner", "listing-position", "listing-process", "listing-grid-section", "listing-activity"];

    detailEls.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = showDetail ? "" : "none";
    });
    listEls.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = showDetail ? "none" : "";
    });
  };

  const refreshPackagesPage = (feedbackMessage, tone) => {
    const state = getLiveState();
    const totals = summary(state);

    togglePackageViews(false);
    updateTopbarState(state);

    const statsContainer = document.getElementById("packages-stats");
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="pinned-stat">
          <div class="pinned-stat-row">Investor - ${profileName(state)}</div>
          <div class="pinned-stat-row">Credit - ${formatMoney(state.availableBalance)}</div>
        </div>
      `;
    }

    const gridContainer = document.getElementById("packages-grid");
    if (gridContainer) {
      renderPackageGrid(state, gridContainer);
    }

    renderActivity(state, document.getElementById("packages-activity-feed"), 5);

    if (feedbackMessage) {
      setFeedback(document.getElementById("packages-feedback"), feedbackMessage, tone);
    }
  };

  const refreshLogin = (feedbackMessage, tone) => {
    const state = getLiveState();
    updateTopbarState(state);

    const submitButton = document.getElementById("auth-submit-btn");
    if (submitButton) {
      submitButton.textContent = isLoggedIn(state) ? "Update Investor Account" : "Create Investor Account";
    }

    const logoutButton = document.getElementById("logout-btn");
    if (logoutButton) {
      logoutButton.disabled = !isLoggedIn(state);
    }

    renderSummaryList(document.getElementById("profile-summary"), [
      { label: "Investor Name", value: state.profile.username || "Not registered yet" },
      { label: "Phone Number", value: state.profile.phone || "Awaiting registration" },
      { label: "Email Address", value: state.profile.email || "Awaiting registration" },
      { label: "Member ID", value: memberLabel(state) },
      { label: "Account Status", value: isLoggedIn(state) ? "Active Investor" : "Registration Open" }
    ]);

    if (feedbackMessage) {
      setFeedback(document.getElementById("login-feedback"), feedbackMessage, tone);
    } else {
      setFeedback(
        document.getElementById("login-feedback"),
        "Complete investor registration with your username, phone number, email address, and password to access package placements.",
        "warning"
      );
    }
  };

  const refreshDashboard = (feedbackMessage, tone) => {
    const state = getLiveState();
    const totals = summary(state);
    updateTopbarState(state);

    renderStats(document.getElementById("dashboard-stats"), [
      {
        label: "Available Capital",
        value: formatMoney(state.availableBalance),
        help: "Approved capital that is ready for new package requests."
      },
      {
        label: "Approved Capital",
        value: formatMoney(totals.invested),
        help: `${pluralise(totals.units, "approved unit")} across active package placements.`
      },
      {
        label: "Live Profit",
        value: formatMoney(totals.profit),
        help: "Profit is accruing on approved holdings in real time."
      },
      {
        label: "Pending Investment Reviews",
        value: String(totals.pendingInvestmentCount),
        help: "Package requests submitted and waiting for operations approval."
      },
      {
        label: "Pending Withdrawal Reviews",
        value: String(totals.pendingWithdrawalCount),
        help: "Withdrawal requests currently under admin review."
      }
    ]);

    renderSummaryList(document.getElementById("dashboard-profile-summary"), [
      { label: "Investor Name", value: state.profile.username || "Registration Open" },
      { label: "Member ID", value: memberLabel(state) },
      { label: "Phone Number", value: state.profile.phone || "Add your mobile number in sign up" },
      { label: "Email Address", value: state.profile.email || "Add your email address in sign up" },
      { label: "Joined", value: state.profile.joinedAt ? stamp(state.profile.joinedAt) : "Awaiting registration" }
    ]);

    renderHoldings(document.getElementById("dashboard-holdings"), state);
    renderRequestList(
      document.getElementById("dashboard-investment-requests"),
      state.investmentRequests,
      "investment",
      {
        emptyTitle: "No package requests yet",
        emptyText: "Choose a package and submit a capital request to begin your investment journey."
      }
    );
    renderRequestList(
      document.getElementById("dashboard-withdrawal-requests"),
      state.withdrawalRequests,
      "withdrawal",
      {
        emptyTitle: "No withdrawal requests yet",
        emptyText: "Withdrawal instructions will appear here once available profit is requested."
      }
    );
    renderActivity(state, document.getElementById("dashboard-activity-feed"));

    if (feedbackMessage) {
      setFeedback(document.getElementById("dashboard-feedback"), feedbackMessage, tone);
    }
  };

  const refreshPackage = (packageId, feedbackMessage, tone) => {
    const state = getLiveState();
    const totals = summary(state);
    const pkg = getPackage(packageId) || PACKAGES[0];
    const holding = getHolding(state, pkg.id);
    const packageRequests = state.investmentRequests.filter((item) => item.packageId === pkg.id);
    const packageWithdrawals = state.withdrawalRequests.filter((item) => item.packageId === pkg.id);

    togglePackageViews(true);
    updateTopbarState(state);
    document.title = `CGI Pakistan | ${pkg.code}`;

    const title = document.getElementById("detail-title");
    if (title) {
      title.innerHTML = `${escapeHtml(pkg.code)} <span>capital placement</span>`;
    }

    const summaryNode = document.getElementById("detail-summary");
    if (summaryNode) {
      summaryNode.innerHTML = `
        <p>
          ${escapeHtml(pkg.code)} is structured at ${escapeHtml(formatAmount(pkg.amount))} per unit, with a projected
          4% monthly return, transparent withdrawal routing, and operations-led approval before placement goes live.
        </p>
      `;
    }

    const metrics = document.getElementById("detail-metrics");
    if (metrics) {
      metrics.innerHTML = `
        <div class="detail-metric">
          <span class="stat-label">Package Amount</span>
          <strong>${escapeHtml(formatAmount(pkg.amount))}</strong>
        </div>
        <div class="detail-metric">
          <span class="stat-label">Projected Monthly</span>
          <strong>${escapeHtml(formatMoney(pkg.monthlyProfit))}</strong>
        </div>
        <div class="detail-metric">
          <span class="stat-label">Projected Daily</span>
          <strong>${escapeHtml(formatMoney(pkg.dailyProfit))}</strong>
        </div>
        <div class="detail-metric">
          <span class="stat-label">Active Units</span>
          <strong>${escapeHtml(String(holding.units))}</strong>
        </div>
      `;
    }

    renderStats(document.getElementById("detail-stats"), [
      {
        label: "Available Capital",
        value: formatMoney(Math.max(0, state.availableBalance - totals.pendingInvestmentAmount)),
        help: "Capital remaining after current pending package instructions."
      },
      {
        label: "Approved In This Package",
        value: formatMoney(holding.invested),
        help: "Capital already approved and placed into this package."
      },
      {
        label: "Available Profit",
        value: formatMoney(holding.profit),
        help: "Profit currently available before a withdrawal request is submitted."
      },
      {
        label: "Pending Actions",
        value: String(packageRequests.filter((item) => item.status === "pending").length + packageWithdrawals.filter((item) => item.status === "pending").length),
        help: "Package instructions currently awaiting operations review."
      }
    ]);

    const position = document.getElementById("package-position");
    if (position) {
      position.innerHTML = `
        <div class="info-grid">
          <article class="info-card">
            <span class="info-label">Approved Units</span>
            <strong class="info-value">${escapeHtml(String(holding.units))}</strong>
            <div class="info-help">Operations-approved package units currently active in this package.</div>
          </article>
          <article class="info-card">
            <span class="info-label">Live Profit</span>
            <strong class="info-value">${escapeHtml(formatMoney(holding.profit))}</strong>
            <div class="info-help">Profit available before it is sent into a withdrawal instruction.</div>
          </article>
          <article class="info-card">
            <span class="info-label">Pending Withdrawal</span>
            <strong class="info-value">${escapeHtml(formatMoney(holding.pendingWithdrawal))}</strong>
            <div class="info-help">Withdrawal amounts waiting for operations release.</div>
          </article>
        </div>
      `;
    }

    renderRequestList(document.getElementById("detail-investment-requests"), packageRequests, "investment", {
      emptyTitle: "No package requests yet",
      emptyText: "Submit a capital request for this package and it will appear here for tracking."
    });
    renderRequestList(document.getElementById("detail-withdrawal-requests"), packageWithdrawals, "withdrawal", {
      emptyTitle: "No withdrawal requests yet",
      emptyText: "Once profit is available, submitted withdrawals for this package will appear here."
    });
    renderRouteGrid(document.getElementById("route-grid"), state);
    renderActivity(state, document.getElementById("activity-feed"));

    const estimate = document.getElementById("invest-estimate");
    const unitsInput = document.getElementById("invest-units");
    if (estimate && unitsInput) {
      const units = Math.max(1, Number(unitsInput.value) || 1);
      estimate.textContent = `${units} unit${units === 1 ? "" : "s"} requires ${formatAmount(pkg.amount * units)} in approved capital.`;
    }

    if (feedbackMessage) {
      setFeedback(document.getElementById("detail-feedback"), feedbackMessage, tone);
    }
  };

  const refreshAdmin = (feedbackMessage, tone) => {
    const state = getLiveState();
    const totals = summary(state);
    updateTopbarState(state);

    renderStats(document.getElementById("admin-stats"), [
      {
        label: "Registered Investor",
        value: state.profile.username || "Awaiting registration",
        help: state.profile.email || "Investor email address will appear after sign up."
      },
      {
        label: "Available Capital",
        value: formatMoney(state.availableBalance),
        help: "Capital ready for review, approval, and future package placement."
      },
      {
        label: "Approved Capital",
        value: formatMoney(totals.invested),
        help: "Capital already committed into live package allocations."
      },
      {
        label: "Pending Package Reviews",
        value: String(totals.pendingInvestmentCount),
        help: "Investment instructions waiting for admin review."
      },
      {
        label: "Pending Withdrawal Reviews",
        value: String(totals.pendingWithdrawalCount),
        help: "Withdrawal instructions waiting for admin release."
      }
    ]);

    renderSummaryList(document.getElementById("admin-profile-summary"), [
      { label: "Investor Name", value: state.profile.username || "Awaiting registration" },
      { label: "Member ID", value: memberLabel(state) },
      { label: "Phone Number", value: state.profile.phone || "Awaiting registration" },
      { label: "Email Address", value: state.profile.email || "Awaiting registration" },
      { label: "Released Withdrawals", value: formatMoney(totals.paidOut) }
    ]);

    renderRequestList(
      document.getElementById("admin-investment-requests"),
      state.investmentRequests.filter((item) => item.status === "pending"),
      "investment",
      {
        admin: true,
        emptyTitle: "Investment queue is clear",
        emptyText: "New package instructions will appear here when investors submit them."
      }
    );
    renderRequestList(
      document.getElementById("admin-withdrawal-requests"),
      state.withdrawalRequests.filter((item) => item.status === "pending"),
      "withdrawal",
      {
        admin: true,
        emptyTitle: "Withdrawal queue is clear",
        emptyText: "Withdrawal instructions will appear here after investors request them."
      }
    );
    renderHoldings(document.getElementById("admin-holdings"), state);
    renderActivity(state, document.getElementById("admin-activity-feed"));

    if (feedbackMessage) {
      setFeedback(document.getElementById("admin-feedback"), feedbackMessage, tone);
    } else {
      setFeedback(
        document.getElementById("admin-feedback"),
        "Use this console to approve capital, review package requests, monitor withdrawals, and track investor activity in one place.",
        "warning"
      );
    }
  };

  const bindAuthControls = () => {
    const form = document.getElementById("auth-form");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = document.getElementById("auth-submit-btn");
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Please wait..."; }
        const data = new FormData(form);
        const result = await saveProfile({
          username: data.get("username"),
          phone: data.get("phone"),
          email: data.get("email"),
          password: data.get("password")
        });
        if (submitBtn) { submitBtn.disabled = false; }
        if (!result.ok) {
          refreshLogin(result.message, result.tone);
          return;
        }
        window.location.href = `${PATH_PREFIX}dashboard/index.html`;
      });
    }

    const logoutButton = document.getElementById("logout-btn");
    if (logoutButton) {
      logoutButton.addEventListener("click", () => {
        const result = logoutProfile();
        refreshLogin(result.message, result.tone);
      });
    }
  };

  const bindPackageControls = (packageId) => {
    const form = document.getElementById("invest-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
      
        window.location.href = `${PATH_PREFIX}buy/?id=${packageId}`;
      });
    }

    const unitsInput = document.getElementById("invest-units");
    if (unitsInput) {
      unitsInput.addEventListener("input", () => refreshPackage(packageId));
    }

    const withdrawButton = document.getElementById("request-withdrawal-btn");
    if (withdrawButton) {
      withdrawButton.addEventListener("click", () => {
        const state = getLiveState();
        showWithdrawModal(packageId, state);
      });
    }
  };

  const bindAdminControls = () => {
    const capitalForm = document.getElementById("admin-capital-form");
    if (capitalForm) {
      capitalForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const amount = Number(new FormData(capitalForm).get("amount"));
        const result = addApprovedCapital(amount);
        refreshAdmin(result.message, result.tone);
        if (result.ok) {
          capitalForm.reset();
        }
      });
    }

    const applyProfitButton = document.getElementById("apply-profit-btn");
    if (applyProfitButton) {
      applyProfitButton.addEventListener("click", () => {
        const result = applyDailyProfit();
        refreshAdmin(result.message, result.tone);
      });
    }

    const resetButton = document.getElementById("reset-portal-btn");
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        const confirmed = window.confirm("Reset investor registration, capital approvals, package activity, and withdrawal history?");
        if (!confirmed) {
          return;
        }
        const result = resetPortal();
        refreshAdmin(result.message, result.tone);
      });
    }

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-admin-action]");
      if (!trigger) {
        return;
      }

      const action = trigger.dataset.adminAction;
      const requestId = trigger.dataset.requestId;
      let result = null;

      if (action === "approve-investment") {
        result = approveInvestmentRequest(requestId);
      } else if (action === "decline-investment") {
        result = declineInvestmentRequest(requestId);
      } else if (action === "approve-withdrawal") {
        result = approveWithdrawalRequest(requestId);
      } else if (action === "decline-withdrawal") {
        result = declineWithdrawalRequest(requestId);
      }

      if (result) {
        refreshAdmin(result.message, result.tone);
      }
    });
  };

  const startLiveRefresh = (refresh) => {
    window.setInterval(() => {
      const active = document.activeElement;
      const userIsTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
      if (!userIsTyping) refresh();
    }, 1000);
  };

  const refreshPortal = (feedbackMessage, tone) => {
    const state = getLiveState();
    const totals = summary(state);
    updateTopbarState(state);

    const authSection = document.getElementById("portal-auth");
    const mainSection = document.getElementById("portal-main");

    if (!authSection || !mainSection) return;

    const loggedIn = isLoggedIn(state);
    authSection.style.display = loggedIn ? "none" : "";
    mainSection.style.display = loggedIn ? "" : "none";

    if (!loggedIn) {
      renderSummaryList(document.getElementById("portal-profile-summary-auth"), [
        { label: "Investor Name", value: state.profile.username || "Not registered yet" },
        { label: "Phone Number", value: state.profile.phone || "Awaiting registration" },
        { label: "Email Address", value: state.profile.email || "Awaiting registration" },
        { label: "Member ID", value: memberLabel(state) },
        { label: "Status", value: "Registration Open" }
      ]);

      if (feedbackMessage) {
        setFeedback(document.getElementById("portal-auth-feedback"), feedbackMessage, tone);
      } else {
        setFeedback(
          document.getElementById("portal-auth-feedback"),
          "Complete investor registration to access package placements, profit tracking, and withdrawal management.",
          "warning"
        );
      }
      return;
    }

    const welcomeName = document.getElementById("portal-welcome-name");
    if (welcomeName) welcomeName.textContent = state.profile.username;

    const mTotalCapital = document.getElementById("metric-total-capital");
    const mTotalProfit = document.getElementById("metric-total-profit");
    const mAvailable = document.getElementById("metric-available");
    const mPending = document.getElementById("metric-pending");

    if (mTotalCapital) mTotalCapital.textContent = formatMoney(totals.invested);
    if (mTotalProfit) mTotalProfit.textContent = formatMoney(totals.profit);
    if (mAvailable) mAvailable.textContent = formatMoney(state.availableBalance);
    if (mPending) mPending.textContent = String(totals.pendingInvestmentCount + totals.pendingWithdrawalCount);

    renderStats(document.getElementById("portal-stats"), [
      {
        label: "Available Capital",
        value: formatMoney(state.availableBalance),
        help: "Capital ready for new package requests or approved withdrawals."
      },
      {
        label: "Approved Capital",
        value: formatMoney(totals.invested),
        help: `${pluralise(totals.units, "approved unit")} across active package placements.`
      },
      {
        label: "Live Profit",
        value: formatMoney(totals.profit),
        help: "Profit accruing on approved holdings in real time."
      },
      {
        label: "Pending Reviews",
        value: String(totals.pendingInvestmentCount + totals.pendingWithdrawalCount),
        help: "Investment and withdrawal instructions awaiting operations review."
      }
    ]);

    renderSummaryList(document.getElementById("portal-profile-summary"), [
      { label: "Investor Name", value: state.profile.username || "Registration Open" },
      { label: "Member ID", value: memberLabel(state) },
      { label: "Phone Number", value: state.profile.phone || "—" },
      { label: "Email Address", value: state.profile.email || "—" },
      { label: "Joined", value: state.profile.joinedAt ? stamp(state.profile.joinedAt) : "—" }
    ]);

    renderHoldingsFlat(document.getElementById("portal-holdings"), state);

    renderRequestList(
      document.getElementById("portal-investment-requests"),
      state.investmentRequests,
      "investment",
      {
        emptyTitle: "No package requests yet",
        emptyText: "Choose a package and submit a capital request to begin."
      }
    );
    renderRequestList(
      document.getElementById("portal-withdrawal-requests"),
      state.withdrawalRequests,
      "withdrawal",
      {
        emptyTitle: "No withdrawal requests yet",
        emptyText: "Withdrawal instructions appear here once available profit is requested."
      }
    );

    renderActivityFlat(document.getElementById("portal-activity-feed"), state, 10);

    if (feedbackMessage) {
      setFeedback(document.getElementById("portal-feedback"), feedbackMessage, tone);
    }
  };

  const showWithdrawModal = (packageId, state) => {
    const pkg = getPackage(packageId);
    if (!pkg) return;
    const holding = getHolding(state, pkg.id);
    const maxAmount = holding.profit;

    const existing = document.getElementById("withdraw-modal-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "withdraw-modal-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);padding:20px;";
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div style="display:block;background:var(--surface,#13161d);border:1px solid var(--border,#252a38);border-radius:12px;width:100%;max-width:420px;padding:28px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <strong style="font-size:1.05rem;color:var(--text,#e8eaf0);">Withdraw from ${escapeHtml(pkg.code)}</strong>
          <button id="withdraw-modal-close" style="background:none;border:none;color:var(--text-2,#9299ae);font-size:1.6rem;cursor:pointer;line-height:1;padding:0;">×</button>
        </div>

        <p style="display:block;color:var(--text-2,#9299ae);font-size:0.84rem;margin:0 0 4px 0;">Available profit</p>
        <p style="display:block;color:var(--text,#e8eaf0);font-size:1.3rem;font-weight:700;margin:0 0 20px 0;">${escapeHtml(formatMoney(maxAmount))}</p>

        <p style="display:block;font-size:0.78rem;color:var(--text-2,#9299ae);margin:0 0 6px 0;letter-spacing:0.05em;text-transform:uppercase;">Amount (PKR)</p>
        <input id="withdraw-amount-input" type="number" min="200" max="${maxAmount.toFixed(2)}" step="1" placeholder="Min PKR 200"
          style="display:block;width:100%;box-sizing:border-box;padding:10px 14px;background:var(--surface-2,#1a1e28);border:1px solid var(--border-2,#2e3447);border-radius:8px;color:var(--text,#e8eaf0);font-size:0.95rem;outline:none;margin-bottom:6px;">
        <p style="display:block;font-size:0.75rem;color:var(--text-3,#5a6178);margin:0 0 22px 0;">Min PKR 200 · Max ${escapeHtml(formatMoney(maxAmount))}</p>

        <hr style="border:none;border-top:1px solid var(--border,#252a38);margin:0 0 18px 0;">

        <p style="display:block;font-size:0.8rem;color:var(--text-2,#9299ae);margin:0 0 14px 0;font-weight:500;">Bank account to receive payment</p>

        <p style="display:block;font-size:0.75rem;color:var(--text-2,#9299ae);margin:0 0 5px 0;text-transform:uppercase;letter-spacing:0.05em;">Bank Name</p>
        <input id="withdraw-bank-name" type="text" placeholder="e.g. Meezan Bank, HBL, UBL"
          style="display:block;width:100%;box-sizing:border-box;padding:10px 14px;background:var(--surface-2,#1a1e28);border:1px solid var(--border-2,#2e3447);border-radius:8px;color:var(--text,#e8eaf0);font-size:0.88rem;outline:none;margin-bottom:12px;">

        <p style="display:block;font-size:0.75rem;color:var(--text-2,#9299ae);margin:0 0 5px 0;text-transform:uppercase;letter-spacing:0.05em;">Account Title</p>
        <input id="withdraw-account-title" type="text" placeholder="Full name on account"
          style="display:block;width:100%;box-sizing:border-box;padding:10px 14px;background:var(--surface-2,#1a1e28);border:1px solid var(--border-2,#2e3447);border-radius:8px;color:var(--text,#e8eaf0);font-size:0.88rem;outline:none;margin-bottom:12px;">

        <p style="display:block;font-size:0.75rem;color:var(--text-2,#9299ae);margin:0 0 5px 0;text-transform:uppercase;letter-spacing:0.05em;">Account Number / IBAN</p>
        <input id="withdraw-account-number" type="text" placeholder="Account number or IBAN"
          style="display:block;width:100%;box-sizing:border-box;padding:10px 14px;background:var(--surface-2,#1a1e28);border:1px solid var(--border-2,#2e3447);border-radius:8px;color:var(--text,#e8eaf0);font-size:0.88rem;outline:none;margin-bottom:20px;">

        <p id="withdraw-modal-feedback" style="display:block;font-size:0.8rem;min-height:16px;margin:0 0 12px 0;color:var(--red,#ef4444);"></p>
        <button id="withdraw-modal-submit" style="display:block;width:100%;padding:12px;background:var(--accent,#4f6ef7);color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">
          Submit Withdrawal Request
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("withdraw-modal-close").onclick = () => overlay.remove();

    document.getElementById("withdraw-modal-submit").onclick = async () => {
      const input = document.getElementById("withdraw-amount-input");
      const bankName = document.getElementById("withdraw-bank-name").value.trim();
      const accountTitle = document.getElementById("withdraw-account-title").value.trim();
      const accountNumber = document.getElementById("withdraw-account-number").value.trim();
      const amount = parseFloat(input.value);
      const fb = document.getElementById("withdraw-modal-feedback");
      const btn = document.getElementById("withdraw-modal-submit");

      fb.textContent = "";

      if (!Number.isFinite(amount) || amount < 200) {
        fb.textContent = "Minimum withdrawal amount is PKR 200.";
        return;
      }
      if (amount > maxAmount) {
        fb.textContent = `Cannot exceed available profit of ${formatMoney(maxAmount)}.`;
        return;
      }
      if (!bankName) {
        fb.textContent = "Please enter your bank name.";
        return;
      }
      if (!accountTitle) {
        fb.textContent = "Please enter the account title.";
        return;
      }
      if (!accountNumber) {
        fb.textContent = "Please enter your account number or IBAN.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Submitting...";
      btn.style.opacity = "0.6";

      const result = await requestWithdrawal(packageId, amount, bankName, accountTitle, accountNumber);

      if (result.ok) {
        overlay.remove();
        refreshPortal(result.message, result.tone);
      } else {
        btn.disabled = false;
        btn.textContent = "Submit Withdrawal Request";
        btn.style.opacity = "1";
        fb.textContent = result.message;
      }
    };
  };

  
    const authForm = document.getElementById("auth-form");
    if (authForm) {
      authForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = authForm.querySelector("button[type=submit]");
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Please wait..."; }
        const data = new FormData(authForm);
        const result = await saveProfile({
          username: data.get("username"),
          phone: data.get("phone"),
          email: data.get("email"),
          password: data.get("password")
        });
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Investor Account"; }
        refreshPortal(result.message, result.tone);
      });
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        const result = logoutProfile();
        refreshPortal(result.message, result.tone);
      });
    }

  const bindPortalControls = () => {
    const authForm = document.getElementById("auth-form");
    if (authForm) {
      authForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = authForm.querySelector("button[type=submit]");
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Please wait..."; }
        const data = new FormData(authForm);
        const result = await saveProfile({
          username: data.get("username"),
          phone: data.get("phone"),
          email: data.get("email"),
          password: data.get("password")
        });
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Investor Account"; }
        refreshPortal(result.message, result.tone);
      });
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        const result = logoutProfile();
        refreshPortal(result.message, result.tone);
      });
    }

    document.addEventListener("click", (event) => {
      const withdrawBtn = event.target.closest("[data-withdraw-pkg]");
      if (withdrawBtn && !withdrawBtn.disabled) {
        const pkgId = Number(withdrawBtn.dataset.withdrawPkg);
        const state = getLiveState();
        showWithdrawModal(pkgId, state);
        return;
      }

      const trigger = event.target.closest("[data-show-more]");
      if (!trigger) return;
      const activityContainer = document.getElementById("portal-activity-feed");
      if (activityContainer) {
        activityContainer.dataset.expanded = activityContainer.dataset.expanded === "true" ? "false" : "true";
        refreshPortal();
      }
    });
  };

  const BANK_DETAILS = {
    bankName: "Meezan Bank",
    accountTitle: "CGI Pakistan Investments",
    accountNumber: "0123456789",
    iban: "PK36MEZN0001230123456789"
  };

  const refreshBuy = (pkg) => {
    const state = getLiveState();
    const authWall = document.getElementById("buy-auth-wall");
    const buyMain = document.getElementById("buy-main");
    if (!authWall || !buyMain) return;

    if (!isLoggedIn(state)) {
      authWall.style.display = "";
      buyMain.style.display = "none";
      return;
    }

    authWall.style.display = "none";
    buyMain.style.display = "";

    const titleEl = document.getElementById("buy-title");
    if (titleEl) titleEl.innerHTML = `${escapeHtml(pkg.code)} <span>Purchase</span>`;

    const metricsEl = document.getElementById("buy-metrics");
    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="detail-metric"><span class="stat-label">Package Amount</span><strong>${escapeHtml(formatAmount(pkg.amount))}</strong></div>
        <div class="detail-metric"><span class="stat-label">Monthly Return (4%)</span><strong>${escapeHtml(formatMoney(pkg.monthlyProfit))}</strong></div>
        <div class="detail-metric"><span class="stat-label">Daily Return</span><strong>${escapeHtml(formatMoney(pkg.dailyProfit))}</strong></div>
      `;
    }
  };

  const bindBuyControls = (pkg) => {
    let currentUnits = 1;
    let proofBase64 = null;

    const showStep = (stepId) => {
      ["buy-step-units", "buy-step-payment", "buy-step-proof", "buy-step-success"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === stepId ? "" : "none";
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const updateUnitsSummary = () => {
      const total = pkg.amount * currentUnits;
      const summaryEl = document.getElementById("buy-units-summary");
      if (summaryEl) {
        summaryEl.innerHTML = `
          <strong>${currentUnits} unit${currentUnits === 1 ? "" : "s"} of ${escapeHtml(pkg.code)}</strong>
          <p>Total to transfer: <strong>${escapeHtml(formatAmount(total))}</strong> &nbsp;|&nbsp; Est. monthly return: ${escapeHtml(formatMoney(pkg.monthlyProfit * currentUnits))}</p>
        `;
      }
    };

    const unitsInput = document.getElementById("buy-units");
    if (unitsInput) {
      unitsInput.addEventListener("input", () => {
        currentUnits = Math.max(1, parseInt(unitsInput.value, 10) || 1);
        updateUnitsSummary();
      });
      updateUnitsSummary();
    }

    // form Step 1 to stp 2
    const nextToPayment = document.getElementById("buy-next-to-payment");
    if (nextToPayment) {
      nextToPayment.addEventListener("click", () => {
        currentUnits = Math.max(1, parseInt(unitsInput?.value, 10) || 1);
        const total = pkg.amount * currentUnits;

        const reminderEl = document.getElementById("buy-amount-reminder");
        if (reminderEl) {
          reminderEl.innerHTML = `<strong>Amount to transfer: ${escapeHtml(formatAmount(total))}</strong><p>Send exactly this amount so operations can match your receipt to this order.</p>`;
        }

        const bankEl = document.getElementById("buy-bank-details");
        if (bankEl) {
          bankEl.innerHTML = `
            <article class="info-card"><span class="info-label">Bank</span><strong class="info-value">${escapeHtml(BANK_DETAILS.bankName)}</strong></article>
            <article class="info-card"><span class="info-label">Account Title</span><strong class="info-value">${escapeHtml(BANK_DETAILS.accountTitle)}</strong></article>
            <article class="info-card"><span class="info-label">Account Number</span><strong class="info-value">${escapeHtml(BANK_DETAILS.accountNumber)}</strong></article>
            <article class="info-card"><span class="info-label">IBAN</span><strong class="info-value">${escapeHtml(BANK_DETAILS.iban)}</strong></article>
          `;
        }

        showStep("buy-step-payment");
      });
    }

  
    const backToUnits = document.getElementById("buy-back-to-units");
    if (backToUnits) backToUnits.addEventListener("click", () => showStep("buy-step-units"));

    
    const nextToProof = document.getElementById("buy-next-to-proof");
    if (nextToProof) nextToProof.addEventListener("click", () => showStep("buy-step-proof"));


    const backToPayment = document.getElementById("buy-back-to-payment");
    if (backToPayment) backToPayment.addEventListener("click", () => showStep("buy-step-payment"));

    // ugh just here as placeholder cuz no info was shared about where to store them 
    const proofInput = document.getElementById("buy-proof-input");
    if (proofInput) {
      proofInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) { proofBase64 = null; return; }
        const reader = new FileReader();
        reader.onload = (ev) => { proofBase64 = ev.target.result; };
        reader.readAsDataURL(file);
      });
    }

    
    const submitBtn = document.getElementById("buy-submit-btn");
    const feedbackEl = document.getElementById("buy-feedback");
    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        const accountInput = document.getElementById("buy-sender-account");
        const senderAccountNumber = accountInput ? accountInput.value.trim() : "";

        if (!senderAccountNumber) {
          if (feedbackEl) { feedbackEl.textContent = "Please enter the account number you sent the payment from."; feedbackEl.className = "feedback warning"; }
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";

        const result = submitInvestmentRequest(pkg.id, currentUnits, senderAccountNumber, proofBase64);

        if (result.ok) {
          try { await pushStateToAPI(result.state); } catch {}
          showStep("buy-step-success");
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Purchase Request";
          if (feedbackEl) { feedbackEl.textContent = result.message; feedbackEl.className = `feedback ${result.tone}`; }
        }
      });
    }
  };

  window.addEventListener("DOMContentLoaded", async () => {
    
    window.addEventListener("beforeunload", () => {
      if (pushTimer) {
        clearTimeout(pushTimer);
        const state = getLiveState();
        
        const token = getToken();
        if (token) {
          navigator.sendBeacon(
            `${API_BASE}/user/state`,
            new Blob([JSON.stringify({ state })], { type: "application/json" })
          );
        }
      }
    });

    const pageType = document.body.dataset.page;

    if (pageType === "package") {
      const packageId = Number(document.body.dataset.packageId);
      if (packageId) {
        window.location.href = `${PATH_PREFIX}packages/?id=${packageId}`;
      }
      return;
    }

    const apiState = await fetchStateFromAPI();
    if (apiState) {
      setCachedState(apiState);
    }

    if (pageType === "home") {
      refreshHome();
      startLiveRefresh(() => refreshHome());
    }

    if (pageType === "packages") {
      const params = new URLSearchParams(window.location.search);
      const packageId = params.get("id");
      if (packageId) {
        const pkgId = parseInt(packageId, 10);
        refreshPackage(pkgId);
        bindPackageControls(pkgId);
        startLiveRefresh(() => refreshPackage(pkgId));

        if (params.get("buy") === "1") {
          setTimeout(() => {
            const investSection = document.getElementById("listing-actions");
            if (investSection) {
              investSection.scrollIntoView({ behavior: "smooth", block: "start" });
              investSection.style.transition = "box-shadow 0.3s ease";
              investSection.style.boxShadow = "0 0 0 3px var(--accent, #4f8ef7)";
              setTimeout(() => { investSection.style.boxShadow = ""; }, 1800);
            }
          }, 200);
        }
      } else {
        refreshPackagesPage();
        startLiveRefresh(() => refreshPackagesPage());
      }
    }

    if (pageType === "portal") {
      fetchStateFromAPI().then(apiState => {
        if (apiState) setCachedState(apiState);
        refreshPortal();
      }).catch(() => refreshPortal());
      bindPortalControls();

      setInterval(async () => {
        const fresh = await fetchStateFromAPI();
        if (fresh) {
          setCachedState(fresh);
          refreshPortal();
        }
      }, 30000);
    }

    if (pageType === "buy") {
      const params = new URLSearchParams(window.location.search);
      const pkg = getPackage(params.get("id")) || PACKAGES[0];
      refreshBuy(pkg);
      bindBuyControls(pkg);
    }

    if (pageType === "login") {
      window.location.href = `${PATH_PREFIX}portal/`;
    }

    if (pageType === "dashboard") {
      window.location.href = `${PATH_PREFIX}portal/`;
    }

    if (pageType === "admin") {
      window.location.href = `${PATH_PREFIX}portal/`;
    }
  });
})();
