
/* =========================================
   CINEVA ADMIN DASHBOARD
   ========================================= */

// 1. SUPABASE CONFIGURATION

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// 2. ELEMENTS

const loginPanel = document.getElementById("loginPanel");
const dashboardPanel = document.getElementById("dashboardPanel");

const loginForm = document.getElementById("loginForm");
const titleForm = document.getElementById("titleForm");

const loginMessage = document.getElementById("loginMessage");
const uploadMessage = document.getElementById("uploadMessage");

const adminTitles = document.getElementById("adminTitles");
const saveTitleBtn = document.getElementById("saveTitleBtn");
const logoutBtn = document.getElementById("logoutBtn");

document.getElementById("footerYear").textContent =
  new Date().getFullYear();


// 3. CONFIGURATION

const POSTER_BUCKET = "cineva-posters";
const VIDEO_BUCKET = "cineva-videos";

let currentAdmin = null;


// 4. MESSAGE HELPER

function showMessage(element, message, success = false) {
  element.textContent = message;
  element.style.color = success ? "#35d07f" : "#ff6b6b";
}


// 5. CHECK ADMIN ROLE

async function checkAdmin() {
  const { data: { session }, error } =
    await supabaseClient.auth.getSession();

  if (error || !session) {
    showLogin();
    return;
  }

  const { data: { user } } =
    await supabaseClient.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    await supabaseClient.auth.signOut();
    showLogin();
    showMessage(
      loginMessage,
      "Access denied. Admin permission is required."
    );
    return;
  }

  currentAdmin = user;
  showDashboard();
}


// 6. SHOW LOGIN

function showLogin() {
  loginPanel.hidden = false;
  dashboardPanel.hidden = true;
}


// 7. SHOW DASHBOARD

function showDashboard() {
  loginPanel.hidden = true;
  dashboardPanel.hidden = false;

  loadAdminTitles();
}


// 8. ADMIN LOGIN

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  showMessage(loginMessage, "Signing in...");

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage(loginMessage, error.message);
    return;
  }

  if (data.user?.app_metadata?.role !== "admin") {
    await supabaseClient.auth.signOut();

    showMessage(
      loginMessage,
      "This account does not have admin permission."
    );

    return;
  }

  currentAdmin = data.user;
  showMessage(loginMessage, "Login successful.", true);
  showDashboard();
});


// 9. ADMIN LOGOUT

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();

  currentAdmin = null;
  showLogin();
});


// 10. GENERATE UNIQUE FILE NAME

function createFileName(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  return `${crypto.randomUUID()}.${extension}`;
}


// 11. UPLOAD FILE

async function uploadFile(bucket, file) {
  if (!file) return null;

  const fileName = createFileName(file);

  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  if (bucket === POSTER_BUCKET) {
    const { data: publicData } = supabaseClient.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return publicData.publicUrl;
  }

  // Videos are private: save their storage path,
  // not a public URL.
  return data.path;
}


// 12. ADD NEW TITLE

titleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentAdmin || currentAdmin.app_metadata?.role !== "admin") {
    showMessage(uploadMessage, "Admin access required.");
    return;
  }

  const posterFile = document.getElementById("posterFile").files[0];
  const backdropFile = document.getElementById("backdropFile").files[0];
  const videoFile = document.getElementById("videoFile").files[0];

  if (!posterFile) {
    showMessage(uploadMessage, "Please select a poster image.");
    return;
  }

  if (posterFile.size > 10 * 1024 * 1024) {
    showMessage(uploadMessage, "Poster must be smaller than 10 MB.");
    return;
  }

  if (backdropFile && backdropFile.size > 10 * 1024 * 1024) {
    showMessage(uploadMessage, "Background image must be smaller than 10 MB.");
    return;
  }

  if (videoFile && videoFile.size > 500 * 1024 * 1024) {
    showMessage(uploadMessage, "Video must be smaller than 500 MB.");
    return;
  }

  const yearValue = document.getElementById("year").value;
  const ratingValue = document.getElementById("rating").value;

  saveTitleBtn.disabled = true;
  saveTitleBtn.textContent = "Uploading...";

  showMessage(uploadMessage, "Uploading your content...");

  try {
    const posterUrl = await uploadFile(POSTER_BUCKET, posterFile);

    const backdropUrl = backdropFile
      ? await uploadFile(POSTER_BUCKET, backdropFile)
      : null;

    const videoPath = videoFile
      ? await uploadFile(VIDEO_BUCKET, videoFile)
      : null;

    const titleData = {
      title: document.getElementById("title").value.trim(),
      type: document.getElementById("type").value,
      genre: document.getElementById("genre").value,
      year: yearValue ? Number(yearValue) : null,
      rating: ratingValue ? Number(ratingValue) : null,
      duration: document.getElementById("duration").value.trim(),
      description: document.getElementById("description").value.trim(),

      poster_url: posterUrl,
      backdrop_url: backdropUrl,

      // This stores a private storage path.
      video_url: videoPath,

      featured: document.getElementById("featured").checked,
      published: document.getElementById("published").checked
    };

    const { error } = await supabaseClient
      .from("titles")
      .insert([titleData]);

    if (error) throw error;

    showMessage(uploadMessage, "Content uploaded successfully!", true);

    titleForm.reset();

    await loadAdminTitles();

  } catch (error) {
    console.error("Upload error:", error);

    showMessage(
      uploadMessage,
      error.message || "Upload failed. Please try again."
    );

  } finally {
    saveTitleBtn.disabled = false;
    saveTitleBtn.textContent = "Upload Content";
  }
});


// 13. LOAD ALL ADMIN TITLES

async function loadAdminTitles() {
  const { data, error } = await supabaseClient
    .from("titles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    adminTitles.innerHTML = `
      <tr><td colspan="5">Unable to load content.</td></tr>
    `;
    return;
  }

  const titles = data || [];

  document.getElementById("totalTitles").textContent = titles.length;

  document.getElementById("publishedTitles").textContent =
    titles.filter(item => item.published).length;

  document.getElementById("draftTitles").textContent =
    titles.filter(item => !item.published).length;

  if (!titles.length) {
    adminTitles.innerHTML = `
      <tr><td colspan="5">No content uploaded yet.</td></tr>
    `;
    return;
  }

  adminTitles.innerHTML = titles.map(item => `
    <tr>
      <td>
        <img
          src="${escapeHTML(item.poster_url || "")}"
          alt=""
          width="55"
          loading="lazy"
        >
      </td>

      <td>${escapeHTML(item.title)}</td>

      <td>${escapeHTML(item.genre || "")}</td>

      <td>${item.published ? "Published" : "Draft"}</td>

      <td>
        <button
          class="admin-delete-btn"
          type="button"
          data-delete-id="${escapeHTML(item.id)}"
        >
          Delete
        </button>
      </td>
    </tr>
  `).join("");
}


// 14. DELETE TITLE

adminTitles.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-id]");

  if (!button || !currentAdmin) return;

  const id = button.dataset.deleteId;

  if (!confirm("Are you sure you want to delete this title?")) {
    return;
  }

  const { error } = await supabaseClient
    .from("titles")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Delete failed: " + error.message);
    return;
  }

  await loadAdminTitles();
});


// 15. SAFE HTML OUTPUT

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}


// 16. AUTH SESSION LISTENER

supabaseClient.auth.onAuthStateChange(() => {
  setTimeout(checkAdmin, 0);
});


// 17. START DASHBOARD

checkAdmin();
