(() => {
  const getPathDepth = () => {
    const path = window.location.pathname;
    if (path.includes("/package/")) return "../../";
    if (path.includes("/admin/") || path.includes("/dashboard/") || path.includes("/login/") || path.includes("/packages/")) return "../";
    return "./";
  };
  const PATH_PREFIX = getPathDepth();

  const PACKAGE_AMOUNTS = [
    385, 995, 1985, 2995, 3885, 4795, 7785, 11695, 21685, 31695,
    43685, 63695, 83685, 136695, 189685, 289695, 387685, 485695, 1087965, 2085895
  ];
  const STORAGE_KEY = "cgi-pakistan-investor-portal";
  const MONTHLY_RATIO = 0.04;
  const DAILY_RATIO = MONTHLY_RATIO / 30;
  const PER_SECOND_RATIO = DAILY_RATIO / 86400;
  const WITHDRAWAL_THRESHOLD = 100;
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
    ],
    lastAccrualAt: Date.now()
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
      paidOut: Number.isFinite(safe.paidOut) ? safe.paidOut : 0
    };
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
          : [],
      lastAccrualAt: Number.isFinite(safe.lastAccrualAt) ? safe.lastAccrualAt : Date.now()
    };

    PACKAGES.forEach((pkg) => {
      const current = safe.holdings && safe.holdings[pkg.id] ? safe.holdings[pkg.id] : {};
      state.holdings[pkg.id] = normaliseHolding(current);
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
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? normaliseState(JSON.parse(raw)) : normaliseState(defaultState());
    } catch (error) {
      return normaliseState(defaultState());
    }
  };

  const saveState = (state) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const getHolding = (state, packageId) => {
    if (!state.holdings[packageId]) {
      state.holdings[packageId] = holdingTemplate();
    }
    return state.holdings[packageId];
  };

  const getPackage = (packageId) => PACKAGES.find((item) => item.id === Number(packageId));
  const getPackageByAmount = (amount) => PACKAGES.find((item) => item.amount === Number(amount));
  const packageHref = (pkg) => `${PATH_PREFIX}package/?id=${pkg.id}`;
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

  const syncElapsedProfit = (state) => {
    const now = Date.now();
    const last = Number.isFinite(state.lastAccrualAt) ? state.lastAccrualAt : now;
    const elapsedSeconds = Math.max(0, (now - last) / 1000);

    if (!elapsedSeconds) {
      state.lastAccrualAt = now;
      return false;
    }

    let changed = false;
    PACKAGES.forEach((pkg) => {
      const holding = getHolding(state, pkg.id);
      if (holding.invested > 0) {
        holding.profit += holding.invested * PER_SECOND_RATIO * elapsedSeconds;
        changed = true;
      }
    });

    state.lastAccrualAt = now;
    return changed;
  };

  const getLiveState = () => {
    const state = loadStoredState();
    if (syncElapsedProfit(state)) {
      saveState(state);
    }
    return state;
  };

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

  const renderActivity = (state, container) => {
    if (!container) {
      return;
    }
    container.innerHTML = `
      <div class="activity-list">
        ${state.activities
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
    if (!container) {
      return;
    }

    if (!requests.length) {
      container.innerHTML = emptyStateCard(
        options.emptyTitle || "No activity yet",
        options.emptyText || "New requests will appear here once they are submitted."
      );
      return;
    }

    const sorted = requests.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    container.innerHTML = `
      <div class="request-grid">
        ${sorted
          .map((request) => {
            const pkg = getPackage(request.packageId);
            const amount = type === "investment" ? request.amount : request.amount;
            const unitRow =
              type === "investment"
                ? `
                    <div class="summary-row">
                      <dt>Units</dt>
                      <dd>${escapeHtml(String(request.units))}</dd>
                    </div>
                  `
                : "";
            const actionButtons =
              options.admin && request.status === "pending"
                ? `
                    <div class="button-row request-actions">
                      <button
                        class="button primary"
                        type="button"
                        data-admin-action="${type === "investment" ? "approve-investment" : "approve-withdrawal"}"
                        data-request-id="${escapeHtml(request.id)}"
                      >
                        Approve
                      </button>
                      <button
                        class="button ghost"
                        type="button"
                        data-admin-action="${type === "investment" ? "decline-investment" : "decline-withdrawal"}"
                        data-request-id="${escapeHtml(request.id)}"
                      >
                        Decline
                      </button>
                    </div>
                  `
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
                  <div class="summary-row">
                    <dt>Submitted</dt>
                    <dd>${escapeHtml(stamp(request.createdAt))}</dd>
                  </div>
                  <div class="summary-row">
                    <dt>Reviewed</dt>
                    <dd>${escapeHtml(request.reviewedAt ? stamp(request.reviewedAt) : "Awaiting review")}</dd>
                  </div>
                </dl>
                ${actionButtons}
              </article>
            `;
          })
          .join("")}
      </div>
    `;
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
  };

  const renderPackageGrid = (state, container, options = {}) => {
    if (!container) {
      return;
    }

    const items = options.limit ? PACKAGES.slice(0, options.limit) : PACKAGES;
    container.innerHTML = items
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
            <div class="button-row" style="margin-top: 18px;">
              <a class="button-link primary" href="${escapeHtml(packageHref(pkg))}">Review Package</a>
            </div>
          </article>
        `;
      })
      .join("");
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
      dashboard: "dashboard",
      login: "login",
      admin: "admin"
    };
    const activeKey = activeMap[document.body.dataset.page] || "";

    document.querySelectorAll("[data-nav-link]").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.navLink === activeKey);
    });

    document.querySelectorAll("[data-profile-pill]").forEach((node) => {
      node.textContent = profileName(state);
    });

    document.querySelectorAll("[data-auth-link]").forEach((node) => {
      node.textContent = isLoggedIn(state) ? "Investor Portal" : "Sign Up";
      node.setAttribute("href", isLoggedIn(state) ? `${PATH_PREFIX}dashboard/index.html` : `${PATH_PREFIX}login/index.html`);
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

  const saveProfile = ({ username, phone, email, password }) => {
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

    const { state } = updateState((draft) => {
      const currentId = draft.profile.memberId || `CGI-PK-${Date.now().toString().slice(-6)}`;
      const joinedAt = draft.profile.joinedAt || Date.now();
      draft.profile = {
        username: cleanUsername,
        phone: cleanPhoneValue,
        email: cleanEmail,
        password: cleanPassword,
        memberId: currentId,
        joinedAt,
        isLoggedIn: true
      };
      addActivity(draft, `${cleanUsername} completed investor registration and entered the portal.`, "success");
    });

    return {
      ok: true,
      tone: "success",
      message: `${cleanUsername} is now active in the CGI Pakistan investor portal.`,
      state
    };
  };

  const logoutProfile = () => {
    const current = getLiveState();
    if (!isLoggedIn(current)) {
      return { ok: false, tone: "warning", message: "No investor session is currently active." };
    }

    const investorName = current.profile.username;
    const { state } = updateState((draft) => {
      draft.profile.isLoggedIn = false;
      addActivity(draft, `${investorName} signed out of the investor portal.`, "warning");
    });

    return {
      ok: true,
      tone: "success",
      message: `${investorName} has been signed out.`,
      state
    };
  };

  const submitInvestmentRequest = (packageId, units) => {
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

    const total = pkg.amount * parsedUnits;

    const result = updateState((draft) => {
      draft.investmentRequests.unshift({
        id: createId("INV"),
        packageId: pkg.id,
        units: parsedUnits,
        amount: total,
        status: "pending",
        createdAt: Date.now(),
        reviewedAt: null
      });
      addActivity(
        draft,
        `${draft.profile.username} submitted a capital request for ${pkg.code} worth ${formatAmount(total)}.`,
        "info"
      );
    });

    return {
      ok: true,
      tone: "success",
      message: `${pkg.code} request submitted for ${formatAmount(total)} and sent to operations for approval.`,
      state: result.state
    };
  };

  const approveInvestmentRequest = (requestId) => {
    const { state, ok, message } = updateState((draft) => {
      const request = draft.investmentRequests.find((item) => item.id === requestId);
      if (!request || request.status !== "pending") {
        return { ok: false, message: "That investment request is no longer awaiting approval." };
      }
      if (draft.availableBalance < request.amount) {
        return { ok: false, message: "Available capital is too low to approve this package request." };
      }

      const pkg = getPackage(request.packageId);
      const holding = getHolding(draft, request.packageId);
      draft.availableBalance -= request.amount;
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

  const requestWithdrawal = (packageId) => {
    const pkg = getPackage(packageId);
    if (!pkg) {
      return { ok: false, tone: "danger", message: "This package could not be found." };
    }

    const state = getLiveState();
    if (!isLoggedIn(state)) {
      return { ok: false, tone: "warning", message: "Sign in before requesting a withdrawal." };
    }

    const holding = getHolding(state, pkg.id);
    if (holding.profit < WITHDRAWAL_THRESHOLD) {
      return {
        ok: false,
        tone: "warning",
        message: `Profit must reach at least ${formatAmount(WITHDRAWAL_THRESHOLD)} before a withdrawal request can be submitted.`
      };
    }

    const alreadyPending = state.withdrawalRequests.some((item) => item.packageId === pkg.id && item.status === "pending");
    if (alreadyPending) {
      return { ok: false, tone: "warning", message: `${pkg.code} already has a withdrawal request awaiting review.` };
    }

    const result = updateState((draft) => {
      const currentHolding = getHolding(draft, pkg.id);
      const amount = currentHolding.profit;
      currentHolding.profit = 0;
      currentHolding.pendingWithdrawal += amount;
      draft.withdrawalRequests.unshift({
        id: createId("WDR"),
        packageId: pkg.id,
        amount,
        status: "pending",
        createdAt: Date.now(),
        reviewedAt: null
      });
      addActivity(draft, `${draft.profile.username} requested withdrawal from ${pkg.code} for ${formatMoney(amount)}.`, "warning");
    });

    return {
      ok: true,
      tone: "success",
      message: `${pkg.code} withdrawal request was sent to operations for approval.`,
      state: result.state
    };
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
    const fresh = normaliseState(defaultState());
    saveState(fresh);
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

  const refreshPackagesPage = (feedbackMessage, tone) => {
    const state = getLiveState();
    const totals = summary(state);
    updateTopbarState(state);

    renderStats(document.getElementById("packages-stats"), [
      {
        label: "Investor",
        value: profileName(state),
        help: isLoggedIn(state) ? "Investor access is active." : "Sign up to request package allocations."
      },
      {
        label: "Available Capital",
        value: formatMoney(state.availableBalance),
        help: "Approved capital waiting for package placement."
      },
      {
        label: "Pending Capital",
        value: formatMoney(totals.pendingInvestmentAmount),
        help: "Capital already submitted and awaiting approval."
      },
      {
        label: "Approved Capital",
        value: formatMoney(totals.invested),
        help: "Capital already placed into approved packages."
      }
    ]);

    renderPackageGrid(state, document.getElementById("packages-grid"));
    renderActivity(state, document.getElementById("packages-activity-feed"));

    if (feedbackMessage) {
      setFeedback(document.getElementById("packages-feedback"), feedbackMessage, tone);
    }
  };

  const refreshLogin = (feedbackMessage, tone) => {
    const state = getLiveState();
    updateTopbarState(state);

    const username = document.getElementById("username");
    const phone = document.getElementById("phone");
    const email = document.getElementById("email");
    const password = document.getElementById("password");
    if (username) {
      username.value = state.profile.username;
    }
    if (phone) {
      phone.value = state.profile.phone;
    }
    if (email) {
      email.value = state.profile.email;
    }
    if (password) {
      password.value = state.profile.password;
    }

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
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const result = saveProfile({
          username: data.get("username"),
          phone: data.get("phone"),
          email: data.get("email"),
          password: data.get("password")
        });
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
        const units = Number(new FormData(form).get("units"));
        const result = submitInvestmentRequest(packageId, units);
        refreshPackage(packageId, result.message, result.tone);
      });
    }

    const unitsInput = document.getElementById("invest-units");
    if (unitsInput) {
      unitsInput.addEventListener("input", () => {
        refreshPackage(packageId);
      });
    }

    const withdrawButton = document.getElementById("request-withdrawal-btn");
    if (withdrawButton) {
      withdrawButton.addEventListener("click", () => {
        const result = requestWithdrawal(packageId);
        refreshPackage(packageId, result.message, result.tone);
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
      refresh();
    }, 1000);
  };

  window.addEventListener("DOMContentLoaded", () => {
    const pageType = document.body.dataset.page;

    if (pageType === "package") {
      const packageId = Number(document.body.dataset.packageId);
      if (packageId) {
        window.location.href = `${PATH_PREFIX}package/?id=${packageId}`;
      }
      return;
    }

    if (pageType === "home") {
      refreshHome();
      startLiveRefresh(() => refreshHome());
    }

    if (pageType === "packages") {
      refreshPackagesPage();
      startLiveRefresh(() => refreshPackagesPage());
    }

    if (pageType === "login") {
      refreshLogin();
      bindAuthControls();
    }

    if (pageType === "dashboard") {
      refreshDashboard();
      startLiveRefresh(() => refreshDashboard());
    }

    if (pageType === "package-query") {
      const pkg = resolvePackageFromQuery();
      refreshPackage(pkg.id);
      bindPackageControls(pkg.id);
      startLiveRefresh(() => refreshPackage(pkg.id));
    }

    if (pageType === "admin") {
      refreshAdmin();
      bindAdminControls();
      startLiveRefresh(() => refreshAdmin());
    }
  });
})();
