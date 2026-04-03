const STORAGE_KEY = "splitmint_local_v1";
const SUPABASE_CONFIG_KEY = "splitmint_supabase";

let supabaseClient = null;
let selectedGroupId = null;
let state = loadLocalState();
let isLoading = false;
let isRefreshing = false;

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const logoutBtn = document.getElementById("logoutBtn");
const backendBtn = document.getElementById("backendBtn");
const backendBanner = document.getElementById("backendBanner");
const bannerSetupBtn = document.getElementById("bannerSetupBtn");
const backendPanel = document.getElementById("backendPanel");
const backendForm = document.getElementById("backendForm");

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const registerNote = document.getElementById("registerNote");
const loginNote = document.getElementById("loginNote");

const groupList = document.getElementById("groupList");
const newGroupBtn = document.getElementById("newGroupBtn");
const emptyNewGroupBtn = document.getElementById("emptyNewGroupBtn");
const userSummary = document.getElementById("userSummary");

const emptyState = document.getElementById("emptyState");
const groupView = document.getElementById("groupView");
const groupTitle = document.getElementById("groupTitle");
const groupMeta = document.getElementById("groupMeta");
const exportBtn = document.getElementById("exportBtn");
const editGroupBtn = document.getElementById("editGroupBtn");
const deleteGroupBtn = document.getElementById("deleteGroupBtn");
const summaryCards = document.getElementById("summaryCards");

const participantList = document.getElementById("participantList");
const addParticipantBtn = document.getElementById("addParticipantBtn");

const mintSenseInput = document.getElementById("mintSenseInput");
const mintSenseBtn = document.getElementById("mintSenseBtn");
const mintSenseNote = document.getElementById("mintSenseNote");

const addExpenseBtn = document.getElementById("addExpenseBtn");
const expenseList = document.getElementById("expenseList");
const balanceTable = document.getElementById("balanceTable");
const settlementList = document.getElementById("settlementList");

const searchInput = document.getElementById("searchInput");
const participantFilter = document.getElementById("participantFilter");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const amountMin = document.getElementById("amountMin");
const amountMax = document.getElementById("amountMax");
const clearFilters = document.getElementById("clearFilters");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

const loadingOverlay = document.getElementById("loadingOverlay");
const toast = document.getElementById("toast");
const backendCloseBtn = document.getElementById("backendCloseBtn");

registerForm.addEventListener("submit", handleRegister);
loginForm.addEventListener("submit", handleLogin);
logoutBtn.addEventListener("click", handleLogout);
newGroupBtn.addEventListener("click", () => openGroupModal());
emptyNewGroupBtn.addEventListener("click", () => openGroupModal());
exportBtn.addEventListener("click", exportGroupData);
editGroupBtn.addEventListener("click", () => openGroupModal(getSelectedGroup()));
deleteGroupBtn.addEventListener("click", deleteSelectedGroup);
addParticipantBtn.addEventListener("click", () => openParticipantModal());
addExpenseBtn.addEventListener("click", () => openExpenseModal());
modalClose.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeModal();
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    event.preventDefault();
    closeModal();
  }
});
if (backendBtn) {
  backendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openBackendPanel();
  });
}

if (bannerSetupBtn) {
  bannerSetupBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openBackendPanel();
  });
}

if (backendCloseBtn) {
  backendCloseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeBackendPanel();
  });
}

if (backendForm) {
  backendForm.addEventListener("submit", handleBackendSave);
}

mintSenseBtn.addEventListener("click", handleMintSense);

[searchInput, participantFilter, dateFrom, dateTo, amountMin, amountMax].forEach((input) => {
  input.addEventListener("input", () => renderGroupView());
});
clearFilters.addEventListener("click", () => {
  searchInput.value = "";
  participantFilter.value = "all";
  dateFrom.value = "";
  dateTo.value = "";
  amountMin.value = "";
  amountMax.value = "";
  renderGroupView();
});

init();

async function init() {
  // Ensure loading overlay is hidden on startup
  hideLoading();

  configureSupabase();
  if (supabaseClient) {
    // Set up auth state listener
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.email);
      if (event === 'SIGNED_IN') {
        await refreshFromBackend();
      } else if (event === 'SIGNED_OUT') {
        clearAppState();
        renderApp();
      }
    });
    // Initial load
    await refreshFromBackend();
  } else {
    renderApp();
  }
}

function configureSupabase() {
  const config = loadSupabaseConfig();
  const hasConfig = Boolean(config?.url && config?.key);

  // Show/hide banner
  if (backendBanner) {
    backendBanner.hidden = hasConfig;
  }

  // Populate form
  if (backendForm) {
    backendForm.url.value = config?.url || "";
    backendForm.key.value = config?.key || "";
  }

  // Create client if config exists
  if (!config?.url || !config?.key) {
    supabaseClient = null;
    return;
  }

  if (!window.supabase) {
    console.error("Supabase library not loaded");
    showToast("Supabase library not loaded. Please refresh the page.", 'error');
    supabaseClient = null;
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(config.url, config.key);
    console.log("Supabase client configured successfully");
  } catch (error) {
    console.error("Error creating Supabase client:", error);
    showToast("Invalid Supabase credentials", 'error');
    supabaseClient = null;
  }
}

function loadSupabaseConfig() {
  const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSupabaseConfig(config) {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
}

function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { users: [], currentUserId: null, groups: [] };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { users: [], currentUserId: null, groups: [] };
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function refreshFromBackend() {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    const session = supabaseClient ? await supabaseClient.auth.getSession() : null;
    const user = session?.data?.session?.user ?? null;

    if (!user) {
      clearAppState();
      renderApp();
      return;
    }

    const groups = await fetchGroups(user.id);
    selectedGroupId = groups[0]?.id ?? null;
    state = {
      users: [{ id: user.id, name: getDisplayName(user), email: user.email }],
      currentUserId: user.id,
      groups
    };
    saveLocalState();
    renderApp();
  } catch (error) {
    console.error("Error refreshing from backend:", error);
    clearAppState();
    renderApp();
  } finally {
    isRefreshing = false;
  }
}

function clearAppState() {
  state.currentUserId = null;
  state.users = [];
  state.groups = [];
  selectedGroupId = null;
  saveLocalState();
}

async function handleRegister(event) {
  event.preventDefault();
  registerNote.textContent = "";
  const formData = new FormData(registerForm);
  const name = formData.get("name").trim();
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password");

  if (!supabaseClient) {
    registerNote.textContent = "Set up Supabase to enable registration.";
    showToast("Please configure backend first", 'error');
    return;
  }

  if (!name || !email || !password) {
    registerNote.textContent = "Please fill in all fields";
    return;
  }

  if (password.length < 6) {
    registerNote.textContent = "Password must be at least 6 characters";
    return;
  }

  try {
    showLoading("Creating account...");
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    hideLoading();

    if (error) {
      console.error("Registration error:", error);
      const userMessage = error.message.includes("rate limit")
        ? "Too many attempts. Please wait a few minutes and try again."
        : error.message;
      registerNote.textContent = userMessage;
      showToast(userMessage, 'error');
      return;
    }

    console.log("Registration successful:", data);
    registerForm.reset();
    loginForm.reset();
    registerNote.textContent = "Check your email for confirmation.";
    showToast("Registration successful! Check your email.", 'success');
  } catch (error) {
    console.error("Registration exception:", error);
    hideLoading();
    const message = error.message || "Registration failed. Please try again.";
    registerNote.textContent = message;
    showToast(message, 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginNote.textContent = "";
  const formData = new FormData(loginForm);
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password");

  if (!supabaseClient) {
    loginNote.textContent = "Set up Supabase to enable login.";
    showToast("Please configure backend first", 'error');
    return;
  }

  if (!email || !password) {
    loginNote.textContent = "Please enter email and password";
    return;
  }

  try {
    showLoading("Signing in...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      hideLoading();
      const userMessage = error.message.includes("Invalid login credentials")
        ? "Invalid email or password"
        : error.message.includes("Email not confirmed")
        ? "Please verify your email first"
        : error.message;
      loginNote.textContent = userMessage;
      showToast(userMessage, 'error');
      return;
    }

    console.log("Login successful:", data);
    loginForm.reset();
    window.scrollTo(0, 0);

    // Auth state change will trigger refresh automatically
    showToast("Welcome back!", 'success');

    // Small delay to ensure auth state propagates
    setTimeout(() => hideLoading(), 500);
  } catch (error) {
    console.error("Login error:", error);
    hideLoading();
    const message = error.message || "Login failed. Please try again.";
    loginNote.textContent = message;
    showToast(message, 'error');
  }
}

async function handleLogout() {
  // Clear state immediately for instant logout
  clearAppState();

  // Sign out from Supabase in background
  if (supabaseClient) {
    supabaseClient.auth.signOut().catch(err => console.error("Logout error:", err));
  }

  // Scroll to top instantly
  window.scrollTo(0, 0);

  // Render app
  renderApp();

  // Show toast
  showToast("Logged out successfully", 'success');
}

function renderApp() {
  const isLoggedIn = Boolean(state.currentUserId);
  authView.hidden = isLoggedIn;
  appView.hidden = !isLoggedIn;
  authView.style.display = isLoggedIn ? "none" : "block";
  appView.style.display = isLoggedIn ? "grid" : "none";
  logoutBtn.hidden = !isLoggedIn;

  if (!isLoggedIn) {
    // Clear forms when logged out
    if (registerForm) registerForm.reset();
    if (loginForm) loginForm.reset();
    registerNote.textContent = "";
    loginNote.textContent = "";
    // Clear any stale app UI
    groupList.innerHTML = "";
    participantList.innerHTML = "";
    expenseList.innerHTML = "";
    balanceTable.innerHTML = "";
    settlementList.innerHTML = "";
    summaryCards.innerHTML = "";
    groupTitle.textContent = "";
    groupMeta.textContent = "";
    emptyState.hidden = false;
    groupView.hidden = true;
    window.scrollTo(0, 0);
    return;
  }

  renderGroupList();
  renderGroupView();
  renderUserSummary();
  window.scrollTo(0, 0);
}

function renderUserSummary() {
  const user = getCurrentUser();
  userSummary.textContent = `Signed in as ${user.name} (${user.email})`;
}

function renderGroupList() {
  const groups = getUserGroups();
  groupList.innerHTML = "";

  if (!groups.length) {
    groupList.innerHTML = "<div class=\"muted\">No groups yet.</div>";
    return;
  }

  groups.forEach((group) => {
    const item = document.createElement("div");
    item.className = `group-item ${group.id === selectedGroupId ? "active" : ""}`;
    item.innerHTML = `
      <div>${group.name}</div>
      <div class="muted">${group.participants.length} participants</div>
    `;
    item.addEventListener("click", () => {
      selectedGroupId = group.id;
      renderGroupList();
      renderGroupView();
    });
    groupList.appendChild(item);
  });
}

function renderGroupView() {
  const group = getSelectedGroup();
  if (!group) {
    emptyState.hidden = false;
    groupView.hidden = true;
    return;
  }
  emptyState.hidden = true;
  groupView.hidden = false;

  groupTitle.textContent = group.name;
  groupMeta.textContent = `${group.participants.length} participants · ${group.expenses.length} expenses`;

  renderSummaryCards(group);
  renderParticipants(group);
  renderParticipantFilter(group);
  renderExpenseList(group);
  renderBalances(group);
  renderSettlement(group);
}

function renderSummaryCards(group) {
  const totals = computeGroupTotals(group);
  summaryCards.innerHTML = "";
  const cards = [
    { label: "Total spent", value: formatCurrency(totals.totalSpent) },
    { label: "You are owed", value: formatCurrency(totals.owedToUser) },
    { label: "You owe", value: formatCurrency(totals.owedByUser) },
  ];
  cards.forEach((card) => {
    const el = document.createElement("div");
    el.className = "card metric";
    el.innerHTML = `<h4>${card.label}</h4><p>${card.value}</p>`;
    summaryCards.appendChild(el);
  });
}

function renderParticipants(group) {
  participantList.innerHTML = "";
  group.participants.forEach((participant) => {
    const item = document.createElement("div");
    item.className = "participant-item";
    item.innerHTML = `
      <div class="participant-tag">
        <span class="color-dot" style="background:${participant.color}"></span>
        <span>${participant.name}</span>
      </div>
      <div class="tags">
        <button class="ghost" data-action="edit" data-id="${participant.id}">Edit</button>
        <button class="ghost" data-action="remove" data-id="${participant.id}">Remove</button>
      </div>
    `;
    participantList.appendChild(item);
  });

  participantList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      const id = event.currentTarget.dataset.id;
      const action = event.currentTarget.dataset.action;
      const participant = group.participants.find((entry) => entry.id === id);
      if (action === "edit") {
        openParticipantModal(participant);
      } else if (action === "remove") {
        await removeParticipant(group, participant);
      }
    });
  });
}

function renderParticipantFilter(group) {
  const current = participantFilter.value || "all";
  participantFilter.innerHTML = `<option value="all">All participants</option>`;
  group.participants.forEach((participant) => {
    const option = document.createElement("option");
    option.value = participant.id;
    option.textContent = participant.name;
    participantFilter.appendChild(option);
  });
  participantFilter.value = current;
}

function renderExpenseList(group) {
  const filters = collectFilters();
  const expenses = group.expenses.filter((expense) => matchesFilters(expense, group, filters));
  expenseList.innerHTML = "";

  if (!expenses.length) {
    expenseList.innerHTML = "<div class=\"muted\">No expenses match your filters.</div>";
    return;
  }

  expenses
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((expense) => {
      const payer = group.participants.find((p) => p.id === expense.payerId);
      const item = document.createElement("div");
      item.className = "expense-item";
      item.innerHTML = `
        <div>
          <div><strong>${expense.description}</strong> · ${formatCurrency(expense.amount)}</div>
          <div class="expense-meta">Paid by ${payer?.name ?? "Unknown"} on ${expense.date}</div>
          <div class="expense-meta">Split: ${expense.splitMode}</div>
        </div>
        <div class="tags">
          <button class="ghost" data-action="edit" data-id="${expense.id}">Edit</button>
          <button class="ghost" data-action="delete" data-id="${expense.id}">Delete</button>
        </div>
      `;
      expenseList.appendChild(item);
    });

  expenseList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      const id = event.currentTarget.dataset.id;
      const action = event.currentTarget.dataset.action;
      const expense = group.expenses.find((entry) => entry.id === id);
      if (action === "edit") {
        openExpenseModal(expense);
      } else if (action === "delete") {
        await deleteExpense(expense);
      }
    });
  });
}

function renderBalances(group) {
  const balances = computeBalances(group);
  balanceTable.innerHTML = "";
  balances.forEach((balance) => {
    const row = document.createElement("div");
    row.className = "balance-row";
    row.innerHTML = `
      <div>${balance.name}</div>
      <div>${balance.amount >= 0 ? "Receives" : "Owes"} ${formatCurrency(Math.abs(balance.amount))}</div>
    `;
    balanceTable.appendChild(row);
  });
}

function renderSettlement(group) {
  const settlements = computeSettlements(group);
  settlementList.innerHTML = "";
  if (!settlements.length) {
    settlementList.innerHTML = "<div class=\"muted\">All settled up.</div>";
    return;
  }
  settlements.forEach((item) => {
    const row = document.createElement("div");
    row.className = "settlement-item";
    row.innerHTML = `${item.from} → ${item.to} <strong>${formatCurrency(item.amount)}</strong>`;
    settlementList.appendChild(row);
  });
}

function openBackendPanel() {
  console.log("openBackendPanel called");
  if (!backendPanel) {
    console.error("backendPanel element not found");
    return;
  }
  backendPanel.style.display = "grid";
  backendPanel.removeAttribute("hidden");
  if (backendBanner) {
    backendBanner.style.display = "none";
    backendBanner.setAttribute("hidden", "");
  }
  setTimeout(() => {
    backendPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 50);
}

function closeBackendPanel() {
  console.log("closeBackendPanel called");
  if (!backendPanel) {
    console.error("backendPanel element not found");
    return;
  }
  backendPanel.style.display = "none";
  backendPanel.setAttribute("hidden", "");
  const config = loadSupabaseConfig();
  if (backendBanner && (!config?.url || !config?.key)) {
    backendBanner.style.display = "block";
    backendBanner.removeAttribute("hidden");
  }
}

async function handleBackendSave(event) {
  event.preventDefault();
  const formData = new FormData(backendForm);
  const url = formData.get("url").trim();
  const key = formData.get("key").trim();

  if (!url || !key) {
    showToast("Please fill in both URL and key", 'error');
    return;
  }

  try {
    showLoading("Configuring backend...");

    // Save and configure
    saveSupabaseConfig({ url, key });
    configureSupabase();

    // Hide the panel and banner
    backendPanel.style.display = 'none';
    backendPanel.setAttribute('hidden', '');
    if (backendBanner) {
      backendBanner.style.display = 'none';
      backendBanner.setAttribute('hidden', '');
    }

    hideLoading();
    showToast("Backend configured successfully!", 'success');

    // Set up auth listener if client was created
    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth state changed:", event, session?.user?.email);
        if (event === 'SIGNED_IN') {
          await refreshFromBackend();
        } else if (event === 'SIGNED_OUT') {
          clearAppState();
          renderApp();
        }
      });
      await refreshFromBackend();
    }
  } catch (error) {
    handleError(error, "Backend configuration failed");
  }
}

function openGroupModal(group = null) {
  modalTitle.textContent = group ? "Edit group" : "New group";
  modalBody.innerHTML = `
    <form id="groupForm" class="modal-body">
      <label>
        Group name
        <input type="text" name="name" required value="${group ? group.name : ""}" />
      </label>
      <button type="submit">${group ? "Save" : "Create"}</button>
      <p class="form-note" id="groupNote"></p>
    </form>
  `;
  const groupForm = document.getElementById("groupForm");
  const groupNote = document.getElementById("groupNote");
  groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(groupForm);
    const name = formData.get("name").trim();
    if (!name) {
      groupNote.textContent = "Group name is required.";
      return;
    }
    if (group) {
      await updateGroup(group, name);
    } else {
      await createGroup(name);
    }
    closeModal();
    await refreshFromBackend();
  });
  openModal();
}

function openParticipantModal(participant = null) {
  const group = getSelectedGroup();
  if (!group) return;
  modalTitle.textContent = participant ? "Edit participant" : "Add participant";
  modalBody.innerHTML = `
    <form id="participantForm" class="modal-body">
      <label>
        Name
        <input type="text" name="name" required value="${participant ? participant.name : ""}" />
      </label>
      <label>
        Color
        <input type="color" name="color" value="${participant ? participant.color : randomColor()}" />
      </label>
      <button type="submit">${participant ? "Save" : "Add"}</button>
      <p class="form-note" id="participantNote"></p>
    </form>
  `;
  const participantForm = document.getElementById("participantForm");
  const participantNote = document.getElementById("participantNote");

  participantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(participantForm);
    const name = formData.get("name").trim();
    const color = formData.get("color");
    if (!name) {
      participantNote.textContent = "Name is required.";
      return;
    }
    if (!participant && group.participants.length >= 4) {
      participantNote.textContent = "Max 3 participants + primary user allowed.";
      return;
    }
    if (participant) {
      await updateParticipant(participant, name, color);
    } else {
      await createParticipant(group, name, color);
    }
    closeModal();
    await refreshFromBackend();
  });
  openModal();
}

function openExpenseModal(expense = null) {
  const group = getSelectedGroup();
  if (!group) return;
  const isDraft = expense && !expense.id;
  const participants = group.participants;
  const participantOptions = participants
    .map((p) => `<option value="${p.id}" ${expense?.payerId === p.id ? "selected" : ""}>${p.name}</option>`)
    .join("");
  const selectedParticipants = expense ? expense.participantIds : participants.map((p) => p.id);
  const splitMode = expense?.splitMode || "equal";

  modalTitle.textContent = expense && !isDraft ? "Edit expense" : "Add expense";
  modalBody.innerHTML = `
    <form id="expenseForm" class="modal-body">
      <label>
        Amount
        <input type="number" name="amount" min="0" step="0.01" required value="${expense ? expense.amount : ""}" />
      </label>
      <label>
        Description
        <input type="text" name="description" required value="${expense ? expense.description : ""}" />
      </label>
      <label>
        Date
        <input type="date" name="date" required value="${expense ? expense.date : new Date().toISOString().slice(0, 10)}" />
      </label>
      <label>
        Payer
        <select name="payerId" required>${participantOptions}</select>
      </label>
      <fieldset class="tags">
        <legend>Participants</legend>
        ${participants
          .map(
            (p) => `
          <label class="tag">
            <input type="checkbox" name="participantIds" value="${p.id}" ${
              selectedParticipants.includes(p.id) ? "checked" : ""
            } />
            ${p.name}
          </label>
        `
          )
          .join("")}
      </fieldset>
      <label>
        Split mode
        <select name="splitMode" id="splitModeSelect">
          <option value="equal" ${splitMode === "equal" ? "selected" : ""}>Equal</option>
          <option value="custom" ${splitMode === "custom" ? "selected" : ""}>Custom amount</option>
          <option value="percentage" ${splitMode === "percentage" ? "selected" : ""}>Percentage</option>
        </select>
      </label>
      <div id="splitInputs"></div>
      <button type="submit">${expense && !isDraft ? "Save" : "Add"}</button>
      <p class="form-note" id="expenseNote"></p>
    </form>
  `;

  const expenseForm = document.getElementById("expenseForm");
  const splitInputs = document.getElementById("splitInputs");
  const splitModeSelect = document.getElementById("splitModeSelect");
  const expenseNote = document.getElementById("expenseNote");

  function renderSplitInputs() {
    const currentMode = splitModeSelect.value;
    if (currentMode === "equal") {
      splitInputs.innerHTML = `<p class="muted">Equal split across selected participants.</p>`;
      return;
    }
    const selectedIds = Array.from(expenseForm.querySelectorAll("input[name='participantIds']:checked")).map(
      (input) => input.value
    );
    splitInputs.innerHTML = selectedIds
      .map((id) => {
        const participant = participants.find((p) => p.id === id);
        const existing = expense?.splits?.[id] ?? "";
        return `
          <label>
            ${participant?.name ?? "Participant"}
            <input type="number" name="splitValue" data-id="${id}" min="0" step="0.01" value="${existing}" required />
          </label>
        `;
      })
      .join("");
  }

  splitModeSelect.addEventListener("change", renderSplitInputs);
  expenseForm.addEventListener("change", (event) => {
    if (event.target.name === "participantIds" && splitModeSelect.value !== "equal") {
      renderSplitInputs();
    }
  });
  renderSplitInputs();

  expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(expenseForm);
    const amount = Number(formData.get("amount"));
    const description = formData.get("description").trim();
    const date = formData.get("date");
    const payerId = formData.get("payerId");
    const participantIds = formData.getAll("participantIds");
    const mode = formData.get("splitMode");

    if (!participantIds.length) {
      expenseNote.textContent = "Select at least one participant.";
      return;
    }
    if (!description) {
      expenseNote.textContent = "Description is required.";
      return;
    }

    const splits = buildSplits({ amount, participantIds, mode, form: expenseForm, note: expenseNote });
    if (!splits) return;

    if (expense && !isDraft) {
      await updateExpense(expense, { amount, description, date, payerId, participantIds, mode, splits });
    } else {
      await createExpense(group, { amount, description, date, payerId, participantIds, mode, splits });
    }

    closeModal();
    await refreshFromBackend();
  });

  openModal();
}

function buildSplits({ amount, participantIds, mode, form, note }) {
  const splits = {};
  if (!participantIds.length) return splits;
  if (mode === "equal") {
    const share = roundCurrency(amount / participantIds.length);
    participantIds.forEach((id) => {
      splits[id] = share;
    });
    const diff = roundCurrency(amount - share * participantIds.length);
    if (diff !== 0) {
      splits[participantIds[0]] = roundCurrency(splits[participantIds[0]] + diff);
    }
    return splits;
  }

  if (!form) return splits;
  const inputs = Array.from(form.querySelectorAll("input[name='splitValue']"));
  if (!inputs.length) {
    note.textContent = "Provide split values.";
    return null;
  }

  let total = 0;
  inputs.forEach((input) => {
    const value = Number(input.value);
    if (Number.isNaN(value)) return;
    splits[input.dataset.id] = value;
    total += value;
  });

  if (mode === "custom") {
    if (roundCurrency(total) !== roundCurrency(amount)) {
      note.textContent = "Custom amounts must add up to total.";
      return null;
    }
    return splits;
  }

  if (mode === "percentage") {
    if (roundCurrency(total) !== 100) {
      note.textContent = "Percentages must sum to 100.";
      return null;
    }
    participantIds.forEach((id) => {
      splits[id] = roundCurrency((amount * splits[id]) / 100);
    });
    const diff = roundCurrency(amount - Object.values(splits).reduce((sum, value) => sum + value, 0));
    if (diff !== 0) {
      const first = participantIds[0];
      splits[first] = roundCurrency(splits[first] + diff);
    }
    return splits;
  }
  return null;
}

async function deleteSelectedGroup() {
  const group = getSelectedGroup();
  if (!group) return;
  if (!confirm("Delete this group and all linked expenses?")) return;
  await supabaseClient.from("groups").delete().eq("id", group.id);
  selectedGroupId = null;
  await refreshFromBackend();
}

async function removeParticipant(group, participant) {
  if (participant.ownerId === group.ownerId) {
    alert("Primary user cannot be removed.");
    return;
  }
  const { data: expenses } = await supabaseClient
    .from("expenses")
    .select("id,payer_id")
    .eq("group_id", group.id)
    .eq("payer_id", participant.id);
  if (expenses?.length) {
    alert("Participant is set as payer for an expense. Edit those expenses first.");
    return;
  }
  await supabaseClient.from("participants").delete().eq("id", participant.id);
  await refreshFromBackend();
}

async function deleteExpense(expense) {
  if (!confirm("Delete this expense?")) return;
  await supabaseClient.from("expenses").delete().eq("id", expense.id);
  await refreshFromBackend();
}

function computeGroupTotals(group) {
  const balances = computeBalances(group);
  const userParticipant = getUserParticipant(group);
  let owedToUser = 0;
  let owedByUser = 0;

  balances.forEach((balance) => {
    if (balance.id === userParticipant?.id) {
      if (balance.amount > 0) owedToUser = balance.amount;
      if (balance.amount < 0) owedByUser = Math.abs(balance.amount);
    }
  });

  return {
    totalSpent: group.expenses.reduce((sum, exp) => sum + exp.amount, 0),
    owedToUser,
    owedByUser,
  };
}

function computeBalances(group) {
  const totals = {};
  group.participants.forEach((p) => {
    totals[p.id] = 0;
  });

  group.expenses.forEach((expense) => {
    totals[expense.payerId] += expense.amount;
    expense.participantIds.forEach((id) => {
      totals[id] -= expense.splits[id] ?? 0;
    });
  });

  return group.participants.map((p) => ({
    id: p.id,
    name: p.name,
    amount: roundCurrency(totals[p.id]),
  }));
}

function computeSettlements(group) {
  const balances = computeBalances(group);
  const creditors = balances.filter((b) => b.amount > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.amount < 0).map((b) => ({ ...b, amount: -b.amount }));
  const settlements = [];

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) {
      settlements.push({ from: debtor.name, to: creditor.name, amount: roundCurrency(amount) });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount <= 0.01) i += 1;
    if (creditor.amount <= 0.01) j += 1;
  }
  return settlements;
}

function collectFilters() {
  return {
    search: searchInput.value.trim().toLowerCase(),
    participantId: participantFilter.value || "all",
    dateFrom: dateFrom.value,
    dateTo: dateTo.value,
    amountMin: amountMin.value ? Number(amountMin.value) : null,
    amountMax: amountMax.value ? Number(amountMax.value) : null,
  };
}

function matchesFilters(expense, group, filters) {
  if (filters.search && !expense.description.toLowerCase().includes(filters.search)) {
    return false;
  }
  if (filters.participantId !== "all" && !expense.participantIds.includes(filters.participantId)) {
    return false;
  }
  if (filters.dateFrom && expense.date < filters.dateFrom) return false;
  if (filters.dateTo && expense.date > filters.dateTo) return false;
  if (filters.amountMin != null && expense.amount < filters.amountMin) return false;
  if (filters.amountMax != null && expense.amount > filters.amountMax) return false;
  return true;
}

function handleMintSense() {
  const text = mintSenseInput.value.trim();
  mintSenseNote.textContent = "";
  if (!text) {
    mintSenseNote.textContent = "Add a statement to parse.";
    return;
  }
  const parsed = parseMintSense(text);
  if (!parsed) {
    mintSenseNote.textContent = "Could not parse. Try: Paid 1200 for dinner with Alex and Priya on 2026-04-02.";
    return;
  }
  openExpenseModal(parsed);
}

function parseMintSense(text) {
  const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1]);
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

  const descriptionMatch = text.match(/for ([a-zA-Z0-9\s]+)/i);
  const description = descriptionMatch ? descriptionMatch[1].trim() : "Shared expense";

  const group = getSelectedGroup();
  if (!group) return null;

  const names = text.match(/with ([a-zA-Z\s,]+)/i);
  const participants = group.participants.map((p) => p.id);
  if (names) {
    const requested = names[1]
      .split(/,|and/)
      .map((name) => name.trim())
      .filter(Boolean);
    const matchedIds = group.participants
      .filter((p) => requested.some((name) => p.name.toLowerCase().includes(name.toLowerCase())))
      .map((p) => p.id);
    if (matchedIds.length) {
      return {
        amount,
        description,
        date,
        payerId: participants[0],
        participantIds: matchedIds,
        splitMode: "equal",
        splits: {},
      };
    }
  }
  return {
    amount,
    description,
    date,
    payerId: participants[0],
    participantIds: participants,
    splitMode: "equal",
    splits: {},
  };
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId);
}

function getUserGroups() {
  return state.groups.filter((group) => group.ownerId === state.currentUserId);
}

function getSelectedGroup() {
  return state.groups.find((group) => group.id === selectedGroupId);
}

function getUserParticipant(group) {
  const user = getCurrentUser();
  return group.participants.find((p) => p.ownerId === user.id) ?? null;
}

function openModal() {
  if (modal) modal.style.display = 'grid';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (modal) modal.style.display = 'none';
  if (modalBody) modalBody.innerHTML = "";
  document.body.style.overflow = '';
}

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function randomColor() {
  const palette = ["#1e8e6e", "#f08b4b", "#2a7bb8", "#ca4a3a", "#9c6ade"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getDisplayName(user) {
  return user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
}

async function fetchGroups(userId) {
  const { data: groups } = await supabaseClient
    .from("groups")
    .select("id,name,owner_id,created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (!groups) return [];

  const results = [];
  for (const group of groups) {
    const participants = await fetchParticipants(group.id);
    const expenses = await fetchExpenses(group.id);
    results.push({
      id: group.id,
      name: group.name,
      ownerId: group.owner_id,
      participants,
      expenses,
    });
  }
  return results;
}

async function fetchParticipants(groupId) {
  const { data } = await supabaseClient
    .from("participants")
    .select("id,name,color,owner_id")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    ownerId: p.owner_id,
  }));
}

async function fetchExpenses(groupId) {
  const { data } = await supabaseClient
    .from("expenses")
    .select("id,amount,description,date,payer_id,split_mode,expense_participants(participant_id,amount)")
    .eq("group_id", groupId)
    .order("date", { ascending: false });

  if (!data) return [];

  return data.map((expense) => {
    const splits = {};
    const participantIds = [];
    (expense.expense_participants || []).forEach((row) => {
      splits[row.participant_id] = row.amount;
      participantIds.push(row.participant_id);
    });
    return {
      id: expense.id,
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      payerId: expense.payer_id,
      participantIds,
      splitMode: expense.split_mode,
      splits,
    };
  });
}

async function createGroup(name) {
  const user = getCurrentUser();
  const { data, error } = await supabaseClient
    .from("groups")
    .insert({ name, owner_id: user.id })
    .select()
    .single();
  if (error) return;
  await supabaseClient.from("participants").insert({
    group_id: data.id,
    name: user.name,
    color: randomColor(),
    owner_id: user.id,
  });
}

async function updateGroup(group, name) {
  await supabaseClient.from("groups").update({ name }).eq("id", group.id);
}

async function createParticipant(group, name, color) {
  await supabaseClient.from("participants").insert({
    group_id: group.id,
    name,
    color,
  });
}

async function updateParticipant(participant, name, color) {
  await supabaseClient.from("participants").update({ name, color }).eq("id", participant.id);
}

async function createExpense(group, payload) {
  const { data, error } = await supabaseClient
    .from("expenses")
    .insert({
      group_id: group.id,
      amount: payload.amount,
      description: payload.description,
      date: payload.date,
      payer_id: payload.payerId,
      split_mode: payload.mode,
    })
    .select()
    .single();
  if (error) return;
  const rows = payload.participantIds.map((id) => ({
    expense_id: data.id,
    participant_id: id,
    amount: payload.splits[id],
  }));
  await supabaseClient.from("expense_participants").insert(rows);
}

async function updateExpense(expense, payload) {
  await supabaseClient
    .from("expenses")
    .update({
      amount: payload.amount,
      description: payload.description,
      date: payload.date,
      payer_id: payload.payerId,
      split_mode: payload.mode,
    })
    .eq("id", expense.id);
  await supabaseClient.from("expense_participants").delete().eq("expense_id", expense.id);
  const rows = payload.participantIds.map((id) => ({
    expense_id: expense.id,
    participant_id: id,
    amount: payload.splits[id],
  }));
  await supabaseClient.from("expense_participants").insert(rows);
}

// Export functionality
function exportGroupData() {
  const group = getSelectedGroup();
  if (!group) return;

  try {
    // Create CSV content
    let csv = "Date,Description,Amount,Payer,Split Mode,Participants\n";

    group.expenses.forEach(expense => {
      const payer = group.participants.find(p => p.id === expense.payerId);
      const participants = expense.participantIds
        .map(id => group.participants.find(p => p.id === id)?.name)
        .filter(Boolean)
        .join("; ");

      csv += `${expense.date},"${expense.description}",${expense.amount},${payer?.name || "Unknown"},${expense.splitMode},"${participants}"\n`;
    });

    // Add balances section
    csv += "\n\nBalances\n";
    csv += "Participant,Balance\n";
    const balances = computeBalances(group);
    balances.forEach(balance => {
      csv += `${balance.name},${balance.amount}\n`;
    });

    // Add settlements section
    csv += "\n\nSettlement Suggestions\n";
    csv += "From,To,Amount\n";
    const settlements = computeSettlements(group);
    settlements.forEach(settlement => {
      csv += `${settlement.from},${settlement.to},${settlement.amount}\n`;
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${group.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast("Data exported successfully!", 'success');
  } catch (error) {
    handleError(error, "Export failed");
  }
}

// Utility functions for better UX
function showLoading(message = "Loading...") {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    const textEl = overlay.querySelector('p');
    if (textEl) textEl.textContent = message;
    overlay.style.display = 'grid';
  }
  isLoading = true;
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    overlay.style.display = 'none';
  }
  isLoading = false;
}

function showToast(message, type = 'success') {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function handleError(error, userMessage = "An error occurred") {
  console.error(error);
  showToast(userMessage, 'error');
  hideLoading();
}
