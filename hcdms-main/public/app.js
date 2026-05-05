const appState = {
  token: localStorage.getItem("cms.token") || "",
  user: JSON.parse(localStorage.getItem("cms.user") || "null"),
};
const apiBaseUrl = (window.CMS_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");

const loginView = document.querySelector("#loginView");
const signupView = document.querySelector("#signupView");
const authPage = document.querySelector("#authPage");
const dashboardView = document.querySelector("#dashboardView");
const loginForm = document.querySelector("#loginForm");
const signupForm = document.querySelector("#signupForm");
const showSignupButton = document.querySelector("#showSignupButton");
const showLoginButton = document.querySelector("#showLoginButton");
const logoutButton = document.querySelector("#logoutButton");
const profileButton = document.querySelector("#profileButton");
const uploadButton = document.querySelector("#uploadButton");
const csvInput = document.querySelector("#csvInput");
const toast = document.querySelector("#toast");
const statCards = document.querySelectorAll(".stat-card");
const codeList = document.querySelector(".code-list");
const payerList = document.querySelector(".payer-list");
const barChart = document.querySelector(".bar-chart");
const hospitalBadge = document.querySelector("#hospitalBadge");

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;

  if (appState.token) {
    headers.Authorization = `Bearer ${appState.token}`;
  }

  if (options.body && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
      body: isFormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach API at ${apiBaseUrl || "same origin"}`);
  }
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {
        message: text.trim().startsWith("<")
          ? `API returned HTML instead of JSON. HTTP ${response.status}`
          : text,
      };
    }
  }

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with HTTP ${response.status}`);
  }

  return payload;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2400);
}

function showLogin() {
  window.location.hash = "login";
  loginView.classList.remove("hidden");
  signupView.classList.add("hidden");
}

function showSignup() {
  window.location.hash = "signup";
  signupView.classList.remove("hidden");
  loginView.classList.add("hidden");
}

function showDashboard() {
  window.location.hash = "dashboard";
  authPage.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  refreshDashboard();
}

function showAuth() {
  dashboardView.classList.add("hidden");
  authPage.classList.remove("hidden");
  showLogin();
}

function saveUser(user) {
  appState.user = user;
  localStorage.setItem("cms.user", JSON.stringify(user));
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function seedSignupDefaults() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  const domain = `test-hospital-${stamp}.test`;
  const fields = signupForm.elements;

  fields.namedItem("name").value = "Test Admin";
  fields.namedItem("email").value = `admin@${domain}`;
  fields.namedItem("password").value = "TestPass123!";
  fields.namedItem("hospitalName").value = `Test Hospital ${stamp}`;
  fields.namedItem("hospitalDomain").value = domain;
}

function saveSession({ token, user, hospital }) {
  appState.token = token;
  appState.user = {
    ...(user || {}),
    hospital: hospital?.name || user?.hospitalDomain || "Hospital",
  };
  localStorage.setItem("cms.token", token);
  localStorage.setItem("cms.user", JSON.stringify(appState.user));
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function renderSummary(summary, metrics = {}) {
  const [openDenials, recoveredRevenue, pendingClaims, filesToday] = statCards;

  openDenials.querySelector("strong").textContent = Number(metrics.openDenials || summary.denied || 0).toLocaleString();
  openDenials.querySelector("small").textContent = `${summary.denialRate || 0}% denial rate`;
  recoveredRevenue.querySelector("strong").textContent = formatMoney(metrics.recoveredRevenue);
  recoveredRevenue.querySelector("small").textContent = "Approved claims";
  pendingClaims.querySelector("strong").textContent = Number(metrics.pendingClaims || summary.pending || 0).toLocaleString();
  pendingClaims.querySelector("small").textContent = "Awaiting adjudication";
  filesToday.querySelector("strong").textContent = Number(metrics.filesUploadedToday || 0).toLocaleString();
  filesToday.querySelector("small").textContent = "Uploaded today";
}

function renderDenials(denials) {
  codeList.replaceChildren();

  if (!denials.length) {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");

    label.textContent = "No denials yet";
    value.textContent = "0";
    row.append(label, value);
    codeList.append(row);
    return;
  }

  denials.forEach((item) => {
    const row = document.createElement("div");
    const code = document.createElement("span");
    const count = document.createElement("strong");

    const category = item.denialCategory ? ` - ${item.denialCategory}` : "";

    code.textContent = `${item.reasonCode || "Unspecified"}${category}`;
    count.textContent = `${item.count} / ${formatMoney(item.amount)}`;
    row.append(code, count);
    codeList.append(row);
  });
}

function renderDenialsByPayer(denials) {
  payerList.replaceChildren();

  if (!denials.length) {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");

    label.textContent = "No payer denials yet";
    value.textContent = "0";
    row.append(label, value);
    payerList.append(row);
    return;
  }

  denials.forEach((item) => {
    const row = document.createElement("div");
    const payer = document.createElement("span");
    const value = document.createElement("strong");

    payer.textContent = item.payerName || "Unknown payer";
    value.textContent = `${item.count} / ${formatMoney(item.amount)}`;
    row.append(payer, value);
    payerList.append(row);
  });
}

function renderDenialVolume(weeks) {
  barChart.replaceChildren();

  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 18, bottom: 34, left: 28 };
  const values = weeks.map((week) => Number(week.count || 0));
  const maxCount = Math.max(...values, 1);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const points = weeks.map((week, index) => {
    const x = padding.left + (weeks.length === 1 ? 0 : (index / (weeks.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - (Number(week.count || 0) / maxCount) * innerHeight;

    return {
      ...week,
      count: Number(week.count || 0),
      x,
      y,
    };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  barChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Denial volume line chart">
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}"></line>
      <polyline class="chart-line" points="${polyline}"></polyline>
      ${points
        .map(
          (point) => `
            <g>
              <circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"></circle>
              <text class="chart-value" x="${point.x}" y="${point.y - 10}">${point.count}</text>
              <text class="chart-label" x="${point.x}" y="${height - 8}">${point.label}</text>
            </g>
          `,
        )
        .join("")}
    </svg>
  `;
}

function renderDashboard(data) {
  hospitalBadge.textContent = data.hospital?.name || appState.user?.hospital || "Hospital";
  renderSummary(data.summary || {}, data.metrics || {});
  renderDenials(data.denialsByReason || []);
  renderDenialsByPayer(data.denialsByPayer || []);
  renderDenialVolume(data.denialVolumeLast8Weeks || []);
}

async function refreshDashboard() {
  if (!appState.token) {
    return;
  }

  try {
    const dashboardResponse = await apiRequest("/api/analytics/dashboard");

    renderDashboard(dashboardResponse.data);
  } catch (error) {
    showToast(error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Logging in...";

  try {
    const response = await apiRequest("/api/auth/login", {
      method: "POST",
      body: formToObject(loginForm),
    });

    saveSession(response.data);
    showToast("Logged in");
    showDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Login";
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = signupForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Creating...";

  try {
    const response = await apiRequest("/api/auth/register", {
      method: "POST",
      body: formToObject(signupForm),
    });

    saveSession(response.data);
    showToast("Account created");
    showDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Signup";
  }
});

showSignupButton.addEventListener("click", showSignup);
showLoginButton.addEventListener("click", showLogin);

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("cms.token");
  localStorage.removeItem("cms.user");
  appState.token = "";
  appState.user = null;
  window.location.hash = "login";
  showAuth();
});

profileButton.addEventListener("click", () => {
  const user = appState.user || { name: "Admin User", hospital: "City Hospital" };
  showToast(`${user.name} - ${user.hospital}`);
});

uploadButton.addEventListener("click", () => {
  csvInput.click();
});

csvInput.addEventListener("change", () => {
  const files = Array.from(csvInput.files || []);
  if (!files.length) {
    return;
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("file", file));

  apiRequest("/api/data/upload", {
    method: "POST",
    body: formData,
  })
    .then((response) => {
      showToast(response.message || `${files.length} file(s) uploaded`);
      refreshDashboard();
    })
    .catch((error) => showToast(error.message))
    .finally(() => {
      csvInput.value = "";
    });
});

seedSignupDefaults();

if (window.location.hash === "#signup") {
  showSignup();
} else if (appState.token && appState.user) {
  showDashboard();
} else {
  showAuth();
}
