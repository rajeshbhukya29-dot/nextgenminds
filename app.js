/* =========================================================
 * NEXTGEN MINDS – Frontend Logic (FormData / NO CORS)
 * Students + Contacts via Google Sheet
 * Jobs via local Excel (synthetic_jobs.xlsx)
 * =======================================================*/

// ★★★ UPDATE THIS TO YOUR OWN WEB APP URL ★★★
const STUDENT_API_URL = "https://script.google.com/macros/s/AKfycbxbgqDu1d3jEK-BCiAB2V3Qh8vT05ThQ_rtMukbyW0xzK68C7v70y-tjkZ-bGbz9R0a/exec";

// Jobs from local Excel file
const EXCEL_JOBS_PATH = "excel/synthetic_jobs.xlsx";

// If Excel fails and you still want data, set true
const USE_MOCK_JOBS = false;

/* ===========================
   HELPERS
   =========================== */

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function getCurrentPage() {
  const path = window.location.pathname.split("/").pop();
  return path || "index.html";
}

function parseSkills(str) {
  if (!str) return [];
  return str
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());
}

/* ===========================
   STATE
   =========================== */

let currentUser = null; // student object from sheet
let jobsCache = [];

/* ===========================
   BACKEND: STUDENT + CONTACT (FORMDATA)
   =========================== */

async function callBackend(payload, url = STUDENT_API_URL) {
  if (!url || url.startsWith("PASTE_")) {
    console.warn("Backend URL not set. Update STUDENT_API_URL in app.js");
    throw new Error("Backend URL not configured");
  }

  const formData = new FormData();
  formData.append("data", JSON.stringify(payload));

  const res = await fetch(url, {
    method: "POST",
    body: formData // NO headers → NO CORS preflight
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("Raw backend response:", text);
    throw new Error("Invalid JSON from backend");
  }

  if (!data || data.ok === false) {
    throw new Error(data && data.message ? data.message : "Unknown backend error");
  }
  return data;
}

async function registerStudent(formData) {
  const payload = {
    action: "registerStudent",
    student: {
      user_id: `STU-${Date.now()}`,
      role: "student",
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      mobile: formData.get("mobile"),
      email: formData.get("email"),
      city: formData.get("city"),
      education_level: formData.get("education_level"),
      experience_years: formData.get("experience_years"),
      skills: formData.get("skills"),
      preferred_role: formData.get("preferred_role"),
    },
  };
  return callBackend(payload, STUDENT_API_URL);
}

async function loginStudent(formData) {
  const payload = {
    action: "loginStudent",
    email: formData.get("email"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
  };
  const data = await callBackend(payload, STUDENT_API_URL);
  return data.student; // backend returns whole row
}

async function saveContact(formData) {
  const payload = {
    action: "saveContact",
    contact: {
      name: formData.get("name"),
      email: formData.get("email"),
      subject: formData.get("subject"),
      message: formData.get("message"),
    },
  };
  return callBackend(payload, STUDENT_API_URL);
}

/* ===========================
   JOBS: LOAD FROM EXCEL
   =========================== */

async function loadJobsFromExcel() {
  if (typeof XLSX === "undefined") {
    throw new Error("SheetJS (XLSX) library not loaded. Check script tag in HTML.");
  }

  const resp = await fetch(EXCEL_JOBS_PATH);
  if (!resp.ok) {
    throw new Error("Could not load Excel file at " + EXCEL_JOBS_PATH);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  // Expecting headers:
  // job_id, employer_user_id, company_name, job_title, job_type, location,
  // min_exp, max_exp, skills_required, description, required_edu, created_at, status
  return rows.map(row => ({
    job_id: row.job_id || row["job_id"] || "",
    employer_user_id: row.employer_user_id || row["employer_user_id"] || "",
    company_name: row.company_name || row["company_name"] || "",
    job_title: row.job_title || row["job_title"] || "",
    job_type: row.job_type || row["job_type"] || "",
    location: row.location || row["location"] || "",
    min_exp: row.min_exp ?? row["min_exp"] ?? "",
    max_exp: row.max_exp ?? row["max_exp"] ?? "",
    skills_required: row.skills_required || row["skills_required"] || "",
    description: row.description || row["description"] || "",
    required_edu: row.required_edu || row["required_edu"] || "",
    created_at: row.created_at || row["created_at"] || "",
    status: row.status || row["status"] || "",
  }));
}

async function fetchJobs() {
  try {
    const jobs = await loadJobsFromExcel();
    return jobs;
  } catch (err) {
    console.error("Error loading jobs from Excel:", err);
    if (USE_MOCK_JOBS) {
      return [
        {
          job_id: "JOB-001",
          employer_user_id: "EMP-001",
          company_name: "NextGen Analytics",
          job_title: "Junior Data Analyst",
          job_type: "Full-time",
          location: "Remote",
          min_exp: 0,
          max_exp: 2,
          skills_required: "Python, SQL, Excel, Communication",
          description: "Analyze data sets and support dashboard creation.",
          required_edu: "Bachelor's in any STEM field",
          created_at: "2025-01-01",
          status: "Active",
        },
      ];
    }
    throw err;
  }
}

/* ===========================
   AUTH / LOCAL STORAGE
   =========================== */

function loadUserFromStorage() {
  try {
    const raw = localStorage.getItem("ngm_current_user");
    currentUser = raw ? JSON.parse(raw) : null;
  } catch (e) {
    currentUser = null;
  }
}

function saveUserToStorage(user) {
  currentUser = user;
  localStorage.setItem("ngm_current_user", JSON.stringify(user));
}

function clearUser() {
  currentUser = null;
  localStorage.removeItem("ngm_current_user");
}

/* ===========================
   UI: NAV + MODALS
   =========================== */

function updateNavAuthUI() {
  const authButtons = $("#authButtons");
  const userMenu = $("#userMenu");
  const userGreeting = $("#userGreeting");

  if (!authButtons || !userMenu || !userGreeting) return;

  if (currentUser) {
    authButtons.classList.add("hidden");
    userMenu.classList.remove("hidden");
    const name = currentUser.first_name || "Student";
    userGreeting.textContent = `Hi, ${name}`;
  } else {
    authButtons.classList.remove("hidden");
    userMenu.classList.add("hidden");
  }

  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearUser();
      window.location.href = "index.html";
    };
  }
}

function setupModals() {
  $all("[data-open-modal]").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-open-modal");
      const modal = document.getElementById(targetId);
      if (modal) modal.classList.remove("hidden");
    });
  });

  $all("[data-close-modal]").forEach(el => {
    el.addEventListener("click", () => {
      const modal = el.closest(".modal");
      if (modal) modal.classList.add("hidden");
    });
  });
}

/* ===========================
   FORMS: REGISTER, LOGIN, CONTACT
   =========================== */

function setupAuthForms() {
  const registerForm = $("#registerForm");
  const loginForm = $("#loginForm");

  if (registerForm) {
    const statusEl = $("#registerStatus");
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!statusEl) return;
      statusEl.textContent = "Registering...";
      statusEl.classList.remove("error", "success");
      try {
        await registerStudent(new FormData(registerForm));
        statusEl.textContent = "Registered successfully! Please login now.";
        statusEl.classList.add("success");
        // Fill login form with email/name for convenience
        const email = $("#regEmail")?.value;
        const fn = $("#regFirstName")?.value;
        const ln = $("#regLastName")?.value;
        if ($("#loginEmail")) $("#loginEmail").value = email || "";
        if ($("#loginFirstName")) $("#loginFirstName").value = fn || "";
        if ($("#loginLastName")) $("#loginLastName").value = ln || "";
      } catch (err) {
        statusEl.textContent = err.message || "Could not register student.";
        statusEl.classList.add("error");
      }
    });
  }

  if (loginForm) {
    const statusEl = $("#loginStatus");
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!statusEl) return;
      statusEl.textContent = "Checking credentials...";
      statusEl.classList.remove("error", "success");
      try {
        const student = await loginStudent(new FormData(loginForm));
        saveUserToStorage(student);
        updateNavAuthUI();
        statusEl.textContent = "Login successful.";
        statusEl.classList.add("success");
        const modal = $("#loginModal");
        if (modal) modal.classList.add("hidden");
      } catch (err) {
        statusEl.textContent = err.message || "Login failed. Please check your details.";
        statusEl.classList.add("error");
      }
    });
  }
}

function setupContactForm() {
  const contactForm = $("#contactForm");
  if (!contactForm) return;
  const statusEl = $("#contactStatus");

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!statusEl) return;
    statusEl.textContent = "Sending...";
    statusEl.classList.remove("error", "success");
    try {
      await saveContact(new FormData(contactForm));
      statusEl.textContent = "Thank you! We received your message.";
      statusEl.classList.add("success");
      contactForm.reset();
    } catch (err) {
      statusEl.textContent = err.message || "Could not send message.";
      statusEl.classList.add("error");
    }
  });
}

/* ===========================
   JOBS PAGE
   =========================== */

function renderJobs(jobs) {
  jobsCache = jobs.slice();
  const list = $("#jobsList");
  const statusEl = $("#jobsStatus");
  if (!list) return;

  list.innerHTML = "";

  if (!jobs.length) {
    if (statusEl) statusEl.textContent = "No jobs found in Excel file.";
    return;
  } else if (statusEl) {
    statusEl.textContent = "";
  }

  // Build filter options
  const locSel = $("#jobLocationFilter");
  const typeSel = $("#jobTypeFilter");
  if (locSel) {
    const locations = Array.from(new Set(jobs.map(j => j.location || "").filter(Boolean))).sort();
    locSel.innerHTML = '<option value="">Location (All)</option>' +
      locations.map(loc => `<option value="${loc}">${loc}</option>`).join("");
  }
  if (typeSel) {
    const types = Array.from(new Set(jobs.map(j => j.job_type || "").filter(Boolean))).sort();
    typeSel.innerHTML = '<option value="">Role Type (All)</option>' +
      types.map(t => `<option value="${t}">${t}</option>`).join("");
  }

  const userSkills = parseSkills(currentUser?.skills || "");

  jobs.forEach(job => {
    const card = document.createElement("article");
    card.className = "job-card";

    const main = document.createElement("div");
    main.className = "job-main";

    const title = document.createElement("h2");
    title.className = "job-title";
    title.textContent = job.job_title || "Untitled Role";

    const company = document.createElement("p");
    company.className = "job-company";
    company.textContent = `${job.company_name || ""} • ${job.location || ""}`;

    const meta = document.createElement("div");
    meta.className = "job-meta";
    if (job.job_type) {
      const span = document.createElement("span");
      span.textContent = job.job_type;
      meta.appendChild(span);
    }
    if (job.min_exp !== "" && job.max_exp !== "") {
      const span = document.createElement("span");
      span.textContent = `${job.min_exp}-${job.max_exp} yrs exp`;
      meta.appendChild(span);
    }
    if (job.required_edu) {
      const span = document.createElement("span");
      span.textContent = job.required_edu;
      meta.appendChild(span);
    }

    const skills = document.createElement("p");
    skills.className = "job-skills";
    skills.textContent = `Skills Required: ${job.skills_required || "-"}`;

    main.appendChild(title);
    main.appendChild(company);
    main.appendChild(meta);
    main.appendChild(skills);

    const actions = document.createElement("div");
    actions.className = "job-actions";

    const statusBadge = document.createElement("span");
    statusBadge.className = "job-status";
    const statusLower = (job.status || "").toLowerCase();
    const isOpen = statusLower !== "closed" && statusLower !== "inactive";
    statusBadge.textContent = isOpen ? (job.status || "Active") : "Closed";
    if (!isOpen) statusBadge.classList.add("closed");
    actions.appendChild(statusBadge);

    // Simple match %
    if (userSkills.length && job.skills_required) {
      const jobSkills = parseSkills(job.skills_required);
      const intersection = jobSkills.filter(s => userSkills.includes(s));
      const match = jobSkills.length ? Math.round((intersection.length / jobSkills.length) * 100) : 0;
      const matchEl = document.createElement("span");
      matchEl.className = "job-apply-note";
      matchEl.textContent = `Match: ${match}%`;
      actions.appendChild(matchEl);
    }

    const applyBtn = document.createElement("button");
    applyBtn.className = "btn primary";
    applyBtn.textContent = "Apply";

    if (!currentUser) {
      applyBtn.onclick = () => {
        const statusEl = $("#jobsStatus");
        if (statusEl) {
          statusEl.textContent = "Please login as a student to apply.";
          statusEl.classList.add("error");
        }
        const modal = $("#loginModal");
        if (modal) modal.classList.remove("hidden");
      };
    } else if (!isOpen) {
      applyBtn.disabled = true;
      applyBtn.textContent = "Closed";
    } else {
      applyBtn.onclick = () => {
        alert(`Application submitted for ${job.job_title}! (You can later extend this to save in a sheet)`);
      };
    }

    actions.appendChild(applyBtn);

    card.appendChild(main);
    card.appendChild(actions);

    list.appendChild(card);
  });
}

function setupJobFilters() {
  const searchInput = $("#jobSearch");
  const locSel = $("#jobLocationFilter");
  const typeSel = $("#jobTypeFilter");

  function applyFilters() {
    const query = (searchInput?.value || "").toLowerCase();
    const loc = locSel?.value || "";
    const type = typeSel?.value || "";

    const filtered = jobsCache.filter(job => {
      const matchesSearch =
        !query ||
        (job.job_title || "").toLowerCase().includes(query) ||
        (job.company_name || "").toLowerCase().includes(query) ||
        (job.description || "").toLowerCase().includes(query);

      const matchesLoc = !loc || job.location === loc;
      const matchesType = !type || job.job_type === type;

      return matchesSearch && matchesLoc && matchesType;
    });

    renderJobs(filtered);
  }

  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (locSel) locSel.addEventListener("change", applyFilters);
  if (typeSel) typeSel.addEventListener("change", applyFilters);
}

/* ===========================
   UPSKILL PAGE
   =========================== */

function renderUpskillPage() {
  const grid = $("#upskillGrid");
  const note = $("#upskillNote");
  if (!grid) return;

  const baseCourses = [
    {
      title: "Foundations of Data Analytics",
      description: "Learn Excel, SQL and visualization basics.",
      skills: ["Excel", "SQL", "Power BI"],
      learners: 420,
      completion: 78,
    },
    {
      title: "Modern Web Development",
      description: "HTML, CSS, JavaScript and frontend fundamentals.",
      skills: ["HTML", "CSS", "JavaScript"],
      learners: 310,
      completion: 71,
    },
    {
      title: "Cloud & DevOps Starter",
      description: "Intro to Linux, cloud concepts and CI/CD.",
      skills: ["Linux", "Git", "Cloud Basics"],
      learners: 190,
      completion: 65,
    },
    {
      title: "Soft Skills for Tech Careers",
      description: "Communication, teamwork and interview prep.",
      skills: ["Communication", "Collaboration"],
      learners: 530,
      completion: 82,
    },
  ];

  const gapSkills = [];
  if (currentUser && window.__ngmSkillsGap) {
    gapSkills.push(...window.__ngmSkillsGap);
  }

  let courses = baseCourses;
  if (gapSkills.length) {
    courses = [
      {
        title: "Close Your Skill Gap",
        description: "Custom set of modules based on the jobs you want.",
        skills: gapSkills,
        learners: 120,
        completion: 60,
      },
      ...baseCourses,
    ];
  }

  grid.innerHTML = "";
  courses.forEach(c => {
    const card = document.createElement("article");
    card.className = "upskill-card";

    const h3 = document.createElement("h3");
    h3.textContent = c.title;

    const desc = document.createElement("p");
    desc.textContent = c.description;

    const skills = document.createElement("p");
    skills.textContent = `Skills covered: ${c.skills.join(", ")}`;

    const stat = document.createElement("p");
    stat.className = "upskill-stat";
    stat.textContent = `${c.learners}+ learners • Avg completion ${c.completion}%`;

    const bar = document.createElement("div");
    bar.className = "progress-bar";
    const barFill = document.createElement("div");
    barFill.className = "progress-bar-fill";
    bar.appendChild(barFill);
    setTimeout(() => {
      barFill.style.width = `${c.completion}%`;
    }, 50);

    card.appendChild(h3);
    card.appendChild(desc);
    card.appendChild(skills);
    card.appendChild(stat);
    card.appendChild(bar);

    grid.appendChild(card);
  });

  if (note) {
    if (!currentUser) {
      note.textContent = "Login to see personalized upskilling recommendations based on your profile.";
    } else {
      note.textContent = "These recommendations are aligned with your skill gaps for the current jobs.";
    }
  }
}

/* ===========================
   PERFORMANCE PAGE (Dashboard + Charts)
   =========================== */

function renderPerformancePage(jobs) {
  const summaryEl = $("#performanceSummary");
  const welcomeEl = $("#performanceWelcome");
  const subtitleEl = $("#performanceSubtitle");
  const avatarEl = $("#perfAvatar");
  const topJobsList = $("#topJobsList");
  const currentSkillsList = $("#currentSkillsList");
  const skillsGapList = $("#skillsGapList");
  const perfMsg = $("#performanceMessage");

  if (!summaryEl || !welcomeEl || !topJobsList || !currentSkillsList || !skillsGapList || !perfMsg) return;

  // Not logged in → show message, clear lists, no charts
  if (!currentUser) {
    if (avatarEl) avatarEl.textContent = "?";
    welcomeEl.textContent = "Login to see your performance analytics.";
    if (subtitleEl) subtitleEl.textContent = "Please login as a registered student to view your matches and skill gaps.";
    summaryEl.innerHTML = "";
    topJobsList.innerHTML = "";
    currentSkillsList.innerHTML = "";
    skillsGapList.innerHTML = "";
    perfMsg.textContent = "";
    drawMatchChart([]);      // clear chart
    drawSkillsChart([], []); // clear chart
    return;
  }

  const name = `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim();
  const preferredRole = currentUser.preferred_role || "-";
  const userSkills = parseSkills(currentUser.skills || "");

  // Header text + avatar
  if (avatarEl) {
    const initial = (currentUser.first_name || currentUser.last_name || "S")[0] || "S";
    avatarEl.textContent = initial.toUpperCase();
  }
  welcomeEl.textContent = `Welcome, ${name}.`;
  if (subtitleEl) {
    subtitleEl.textContent = "Here’s how your skills align with live job openings in NEXTGEN MINDS.";
  }

  // Build matches
  const jobMatches = [];
  jobs.forEach(job => {
    const jobSkills = parseSkills(job.skills_required || "");
    if (!jobSkills.length) return;

    const intersection = jobSkills.filter(s => userSkills.includes(s));
    const missing = jobSkills.filter(s => !userSkills.includes(s));
    const matchPercent = Math.round((intersection.length / jobSkills.length) * 100);

    jobMatches.push({ job, matchPercent, intersection, missing });
  });

  jobMatches.sort((a, b) => b.matchPercent - a.matchPercent);
  const top = jobMatches.slice(0, 3);

  const bestMatch = top[0];
  const overallMatch = bestMatch ? bestMatch.matchPercent : 0;

  // Summary box
  summaryEl.innerHTML = `
    <p><strong>Student:</strong> ${name}</p>
    <p><strong>Preferred Role:</strong> ${preferredRole}</p>
    <p><strong>Total Skills Provided:</strong> ${userSkills.length}</p>
    <p><strong>Best Match Across Jobs:</strong> ${overallMatch}%</p>
  `;

  // Current skills list
  currentSkillsList.innerHTML = "";
  userSkills.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    currentSkillsList.appendChild(li);
  });

  // Top jobs list with progress bars
  topJobsList.innerHTML = "";
  top.forEach(entry => {
    const li = document.createElement("li");
    li.className = "top-job-item";
    li.innerHTML = `
      <div class="top-job-main">
        <span class="top-job-title">${entry.job.job_title} @ ${entry.job.company_name}</span>
        <span class="top-job-match">${entry.matchPercent}% match</span>
      </div>
      <div class="match-bar">
        <div class="match-bar-fill" style="width:${entry.matchPercent}%;"></div>
      </div>
    `;
    topJobsList.appendChild(li);
  });

  // Skills gap
  const gaps = new Set();
  jobMatches.forEach(entry => {
    if (entry.matchPercent < 100) {
      entry.missing.forEach(s => gaps.add(s));
    }
  });
  window.__ngmSkillsGap = Array.from(gaps);

  skillsGapList.innerHTML = "";
  window.__ngmSkillsGap.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    skillsGapList.appendChild(li);
  });

  // Message
  if (overallMatch === 100) {
    perfMsg.textContent = "Excellent! You fully meet the skill requirements for at least one job.";
    perfMsg.classList.remove("error");
    perfMsg.classList.add("success");
  } else {
    perfMsg.textContent = "You need to upskill — focus on the skills listed under 'Skills You Need to Achieve'.";
    perfMsg.classList.remove("success");
    perfMsg.classList.add("error");
  }

  // Charts
  drawMatchChart(top);
  drawSkillsChart(userSkills, window.__ngmSkillsGap || []);
}

/* ===========================
   CHART HELPERS (Chart.js)
   =========================== */

function drawMatchChart(topMatches) {
  const canvas = document.getElementById("matchChart");
  if (!canvas || typeof Chart === "undefined") return;

  const labels = topMatches.map(m => m.job.job_title);
  const data = topMatches.map(m => m.matchPercent);

  if (window.__matchChart) {
    window.__matchChart.destroy();
  }

  if (!labels.length) {
    // no data → show empty chart
    window.__matchChart = new Chart(canvas, {
      type: "bar",
      data: { labels: ["No data"], datasets: [{ label: "Match %", data: [0] }] },
      options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } }
    });
    return;
  }

  window.__matchChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Match %",
        data
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });
}

function drawSkillsChart(userSkills, gapSkills) {
  const canvas = document.getElementById("skillsChart");
  if (!canvas || typeof Chart === "undefined") return;

  const have = userSkills.length;
  const need = gapSkills.length;

  if (have === 0 && need === 0) return;

  if (window.__skillsChart) {
    window.__skillsChart.destroy();
  }

  window.__skillsChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Skills you have", "Skills to learn"],
      datasets: [{
        data: [have, need]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

/* ===========================
   INIT
   =========================== */

async function init() {
  loadUserFromStorage();
  updateNavAuthUI();
  setupModals();
  setupAuthForms();
  setupContactForm();

  const page = getCurrentPage();

  if (page === "jobs.html") {
    try {
      const jobs = await fetchJobs();
      renderJobs(jobs);
      setupJobFilters();
    } catch (err) {
      const statusEl = $("#jobsStatus");
      if (statusEl) {
        statusEl.textContent = err.message || "Could not load jobs from Excel.";
        statusEl.classList.add("error");
      }
    }
  } else if (page === "performance.html") {
    try {
      const jobs = await fetchJobs();
      renderPerformancePage(jobs);
    } catch (err) {
      const msg = $("#performanceMessage");
      if (msg) {
        msg.textContent = err.message || "Could not analyze performance because jobs could not be loaded.";
        msg.classList.add("error");
      }
    }
  } else if (page === "upskill.html") {
    try {
      const jobs = await fetchJobs();
      if (currentUser) {
        // compute gaps once using performance logic
        renderPerformancePage(jobs);
      }
    } catch (e) {
      // ignore for upskill; will still render base courses
    } finally {
      renderUpskillPage();
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
