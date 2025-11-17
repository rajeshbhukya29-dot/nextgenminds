// =========================
// FIREBASE + NEXTGEN MINDS
// =========================

// Global user state
let currentUser = {
  role: "guest", 
  id: null,
  name: null,
  email: null,
  extra: {}
};

// Admin emails (these 5 people)
const ADMIN_EMAILS = [
  "rajesh.bhukya@example.com",
  "rajesh.bandari@example.com",
  "srija.bakshi@example.com",
  "saathwika.sunkari@example.com",
  "haripriya@example.com"
];

// Toast utility
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// =========================
// BACKEND FUNCTIONS (FIRESTORE)
// =========================

async function saveStudent(data) {
  const docRef = await db.collection("students").add(data);
  return docRef.id;
}

async function saveEmployer(data) {
  const docRef = await db.collection("employers").add(data);
  return docRef.id;
}

async function saveJob(data) {
  const docRef = await db.collection("jobs").add(data);
  return docRef.id;
}

async function saveContactMessage(data) {
  const docRef = await db.collection("contacts").add(data);
  return docRef.id;
}

async function getStudentByEmail(email) {
  const snap = await db.collection("students").where("email", "==", email).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function getEmployerByCredentials(email, password) {
  const snap = await db.collection("employers")
    .where("email", "==", email)
    .where("password", "==", password)
    .get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function getJobs() {
  const snap = await db.collection("jobs").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getAdminSummary() {
  const studentsSnap = await db.collection("students").limit(10).get();
  const employersSnap = await db.collection("employers").limit(10).get();
  const jobsSnap = await db.collection("jobs").limit(10).get();

  return {
    studentCount: (await db.collection("students").get()).size,
    employerCount: (await db.collection("employers").get()).size,
    jobCount: (await db.collection("jobs").get()).size,

    students: studentsSnap.docs.map(d => d.data()),
    employers: employersSnap.docs.map(d => d.data()),
    jobs: jobsSnap.docs.map(d => d.data())
  };
}

// =========================
// NAVIGATION
// =========================

function buildNav() {
  const navLinks = document.getElementById("navLinks");
  navLinks.innerHTML = "";

  let links = [];

  if (currentUser.role === "guest") {
    links = [
      { id: "homeSection", label: "Home" },
      { id: "jobsSection", label: "Job Posted" },
      { id: "upskillSection", label: "Upskill" },
      { id: "supportSection", label: "Support" }
    ];
  } else if (currentUser.role === "student") {
    links = [
      { id: "homeSection", label: "Home" },
      { id: "jobsSection", label: "Job Posted" },
      { id: "upskillSection", label: "Upskill" },
      { id: "supportSection", label: "Contact" }
    ];
  } else if (currentUser.role === "employer") {
    links = [
      { id: "homeSection", label: "Home" },
      { id: "employerJobsSection", label: "Post a Job" },
      { id: "employerCoursesSection", label: "Recommending Courses" },
      { id: "supportSection", label: "Contact" }
    ];
  } else if (currentUser.role === "admin") {
    links = [
      { id: "homeSection", label: "Home" },
      { id: "adminSection", label: "Admin Dashboard" },
      { id: "supportSection", label: "Support" }
    ];
  }

  links.forEach(link => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = link.label;
    a.dataset.target = link.id;
    a.addEventListener("click", e => {
      e.preventDefault();
      showSection(link.id);
      setActiveNav(link.id);
    });
    li.appendChild(a);
    navLinks.appendChild(li);
  });

  setActiveNav("homeSection");

  const authBtn = document.getElementById("authBtn");
  const welcomeUser = document.getElementById("welcomeUser");

  if (currentUser.role === "guest") {
    authBtn.textContent = "Login / Register";
    welcomeUser.textContent = "";
  } else {
    authBtn.textContent = "Logout";
    welcomeUser.textContent = `Hi, ${currentUser.name}`;
  }
}

function setActiveNav(id) {
  document.querySelectorAll(".ngm-nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.target === id);
  });
}

function showSection(id) {
  document.querySelectorAll("main .section").forEach(sec => {
    sec.classList.toggle("active", sec.id === id);
  });
}

// =========================
// STUDENT PROFILE & MATCH
// =========================

function updateStudentProfilePanel() {
  document.getElementById("stuNameProfile").textContent = currentUser.name;
  document.getElementById("stuPreferredRoleProfile").textContent = currentUser.extra.preferred_role;
  document.getElementById("stuExpProfile").textContent = currentUser.extra.experience_years;
  document.getElementById("stuSkillsProfile").textContent = currentUser.extra.skills;
}

function computeSkillMatch(jobs) {
  const skills = (currentUser.extra.skills || "").toLowerCase().split(",").map(s => s.trim());
  if (!skills.length) return;

  let bestScore = -1;
  let bestJob = null;
  let missing = new Set();

  jobs.forEach(job => {
    const req = job.skills_required.toLowerCase().split(",").map(s => s.trim());
    const overlap = req.filter(s => skills.includes(s));
    const score = Math.round((overlap.length / req.length) * 100);

    if (score > bestScore) {
      bestScore = score;
      bestJob = job;
    }

    req.forEach(s => { if (!skills.includes(s)) missing.add(s); });
  });

  document.getElementById("bestMatchJob").textContent =
    bestJob ? `${bestJob.job_title} @ ${bestJob.company_name}` : "-";

  document.getElementById("bestMatchScore").textContent =
    bestScore >= 0 ? bestScore + "%" : "-";

  const ul = document.getElementById("recommendedSkillsList");
  ul.innerHTML = "";
  [...missing].slice(0, 8).forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    ul.appendChild(li);
  });
}

// =========================
// JOB DISPLAY
// =========================

async function loadJobs() {
  const jobsList = document.getElementById("jobsList");
  jobsList.innerHTML = "<p>Loading...</p>";

  const jobs = await getJobs();

  jobsList.innerHTML = "";
  jobs.forEach(job => {
    const div = document.createElement("div");
    div.classList.add("glass");
    div.style.padding = "15px";

    div.innerHTML = `
      <h3>${job.job_title}</h3>
      <p><strong>Company:</strong> ${job.company_name}</p>
      <p><strong>Location:</strong> ${job.location}</p>
      <p><strong>Skills:</strong> ${job.skills_required}</p>
      <p><strong>Experience:</strong> ${job.min_exp}-${job.max_exp} years</p>
      <button class="btn secondary">Apply</button>
    `;

    jobsList.appendChild(div);
  });

  if (currentUser.role === "student") {
    computeSkillMatch(jobs);
  }
}

// =========================
// ADMIN DASHBOARD
// =========================

async function loadAdminDashboard() {
  const d = await getAdminSummary();

  document.getElementById("adminStudentsCount").textContent = d.studentCount;
  document.getElementById("adminEmployersCount").textContent = d.employerCount;
  document.getElementById("adminJobsCount").textContent = d.jobCount;

  const stuBody = document.querySelector("#adminStudentsTable tbody");
  const empBody = document.querySelector("#adminEmployersTable tbody");
  const jobBody = document.querySelector("#adminJobsTable tbody");

  stuBody.innerHTML = "";
  d.students.forEach(s => {
    stuBody.innerHTML += `
      <tr><td>${s.first_name} ${s.last_name}</td><td>${s.email}</td><td>${s.city}</td><td>${s.preferred_role}</td></tr>
    `;
  });

  empBody.innerHTML = "";
  d.employers.forEach(e => {
    empBody.innerHTML += `
      <tr><td>${e.company_name}</td><td>${e.email}</td><td>${e.created_at}</td></tr>
    `;
  });

  jobBody.innerHTML = "";
  d.jobs.forEach(j => {
    jobBody.innerHTML += `
      <tr><td>${j.job_title}</td><td>${j.company_name}</td><td>${j.location}</td></tr>
    `;
  });
}

// =========================
// INITIALIZATION
// =========================

document.addEventListener("DOMContentLoaded", () => {

  // Logo click → Home
  document.getElementById("logoHome").onclick = () => {
    showSection("homeSection");
    setActiveNav("homeSection");
  };

  // Auth button (login/register OR logout)
  document.getElementById("authBtn").onclick = () => {
    if (currentUser.role === "guest") {
      document.getElementById("authModal").classList.add("open");
    } else {
      currentUser = { role: "guest" };
      showToast("Logged out");
      buildNav();
      showSection("homeSection");
    }
  };

  // Close modal
  document.getElementById("closeAuthModal").onclick = () =>
    document.getElementById("authModal").classList.remove("open");

  // Role tab switching
  document.querySelectorAll(".role-tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".role-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".auth-pane").forEach(p => p.classList.remove("active"));
      document.getElementById(btn.dataset.role + "Auth").classList.add("active");
    };
  });

  // =========================
  // STUDENT REGISTER
  // =========================

  document.getElementById("studentRegisterForm").onsubmit = async e => {
    e.preventDefault();

    const data = {
      first_name: stuFirstName.value.trim(),
      last_name: stuLastName.value.trim(),
      mobile: stuMobile.value.trim(),
      email: stuEmail.value.trim(),
      city: stuCity.value.trim(),
      education_level: stuEdu.value.trim(),
      experience_years: stuExp.value.trim(),
      skills: stuSkills.value.trim(),
      preferred_role: stuPreferredRole.value.trim(),
      created_at: new Date().toISOString()
    };

    const id = await saveStudent(data);

    currentUser = {
      role: "student",
      id,
      name: data.first_name,
      email: data.email,
      extra: data
    };

    showToast("Registered as Student");
    document.getElementById("authModal").classList.remove("open");
    buildNav();
    updateStudentProfilePanel();
    loadJobs();
    showSection("jobsSection");
  };

  // =========================
  // STUDENT LOGIN
  // =========================

  document.getElementById("studentLoginForm").onsubmit = async e => {
    e.preventDefault();

    const email = stuLoginEmail.value.trim();
    const u = await getStudentByEmail(email);

    if (!u) return showToast("Student not found");

    currentUser = {
      role: "student",
      id: u.id,
      name: u.first_name,
      email: u.email,
      extra: u
    };

    showToast("Logged in as Student");
    document.getElementById("authModal").classList.remove("open");
    buildNav();
    updateStudentProfilePanel();
    loadJobs();
    showSection("jobsSection");
  };

  // =========================
  // EMPLOYER REGISTER
  // =========================

  document.getElementById("employerRegisterForm").onsubmit = async e => {
    e.preventDefault();

    if (!/^\d{5}$/.test(empEmployeeId.value.trim())) {
      return showToast("Employee ID must be exactly 5 digits");
    }

    const data = {
      company_name: empCompanyName.value.trim(),
      email: empEmail.value.trim(),
      password: empPassword.value.trim(),
      employee_id: empEmployeeId.value.trim(),
      created_at: new Date().toISOString()
    };

    const id = await saveEmployer(data);

    currentUser = {
      role: "employer",
      id,
      name: data.company_name,
      email: data.email,
      extra: data
    };

    showToast("Registered as Employer");
    document.getElementById("authModal").classList.remove("open");
    buildNav();
    showSection("employerJobsSection");
  };

  // =========================
  // EMPLOYER LOGIN
  // =========================

  document.getElementById("employerLoginForm").onsubmit = async e => {
    e.preventDefault();

    const email = empLoginEmail.value.trim();
    const pass = empLoginPassword.value.trim();

    const u = await getEmployerByCredentials(email, pass);
    if (!u) return showToast("Invalid login");

    currentUser = {
      role: "employer",
      id: u.id,
      name: u.company_name,
      email: u.email,
      extra: u
    };

    showToast("Logged in as Employer");
    document.getElementById("authModal").classList.remove("open");
    buildNav();
    showSection("employerJobsSection");
  };

  // =========================
  // ADMIN LOGIN
  // =========================

  document.getElementById("adminLoginForm").onsubmit = async e => {
    e.preventDefault();

    const email = adminEmail.value.trim();
    if (!ADMIN_EMAILS.includes(email)) {
      return showToast("Not an authorized admin");
    }

    currentUser = {
      role: "admin",
      id: "admin",
      name: "Admin",
      email
    };

    showToast("Logged in as Admin");
    document.getElementById("authModal").classList.remove("open");
    buildNav();
    loadAdminDashboard();
    showSection("adminSection");
  };

  // =========================
  // JOB POSTING
  // =========================

  document.getElementById("jobForm").onsubmit = async e => {
    e.preventDefault();

    if (currentUser.role !== "employer") {
      return showToast("Login as employer first");
    }

    const data = {
      employer_id: currentUser.id,
      company_name: jobCompany.value.trim(),
      job_title: jobTitle.value.trim(),
      job_type: jobType.value,
      location: jobLocation.value.trim(),
      mode: jobMode.value,
      min_exp: jobMinExp.value.trim(),
      max_exp: jobMaxExp.value.trim(),
      skills_required: jobSkills.value.trim(),
      required_edu: jobEdu.value.trim(),
      description: jobDesc.value.trim(),
      created_at: new Date().toISOString()
    };

    await saveJob(data);

    showToast("Job posted");
    jobForm.reset();
  };

  // =========================
  // CONTACT MESSAGE
  // =========================

  document.getElementById("contactForm").onsubmit = async e => {
    e.preventDefault();

    const data = {
      name: contactName.value.trim(),
      email: contactEmail.value.trim(),
      subject: contactSubject.value.trim(),
      message: contactMessage.value.trim(),
      created_at: new Date().toISOString()
    };

    await saveContactMessage(data);

    showToast("Message sent");
    contactForm.reset();
  };

  // =========================
  // INITIAL LOAD
  // =========================

  buildNav();
  loadJobs();

});
// Load metrics for home (Firebase version)
async function loadHomeMetrics() {
  // --- Count Students ---
  const stuSnap = await db.collection("students").get();
  const studentCount = stuSnap.size;

  // --- Count Jobs ---
  const jobSnap = await db.collection("jobs").get();
  const jobCount = jobSnap.size;

  // --- Count Employers ---
  const empSnap = await db.collection("employers").get();
  const employerCount = empSnap.size;

  // Update UI
  document.getElementById("metricStudents").textContent = studentCount;
  document.getElementById("metricJobs").textContent = jobCount;
  document.getElementById("metricEmployers").textContent = employerCount;
}

// Call on page load
document.addEventListener("DOMContentLoaded", () => {
  loadHomeMetrics();
});
links = [
  { id: "homeSection", label: "Home" },
  { id: "dashboardSection", label: "Dashboard" },
  { id: "jobsSection", label: "Job Posted" },
  { id: "upskillSection", label: "Upskill" },
  { id: "supportSection", label: "Support" }
];
async function loadDashboardMetrics() {
  
  // Students
  const stuSnap = await db.collection("students").get();
  document.getElementById("dashStudents").textContent = stuSnap.size;

  // Jobs
  const jobSnap = await db.collection("jobs").get();
  document.getElementById("dashJobs").textContent = jobSnap.size;

  // Employers
  const empSnap = await db.collection("employers").get();
  document.getElementById("dashEmployers").textContent = empSnap.size;
}
