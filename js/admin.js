
/* =========================================
   CINEVA ADMIN DASHBOARD
   ========================================= */

// 1. SUPABASE CONFIGURATION

const SUPABASE_URL = "https://ciifhscwcaslnkwtgoyp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4amdlanVqZnhlampsYmZpemd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTQzMTQsImV4cCI6MjA5NDA5MDMxNH0.CWUYLk4qJfriIYXWScB7wcHHVTCuz0SGDhWUV3tMR1Y";


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


// ==========================================
// 16. CINEVA TMDB IMPORT INTEGRATION
// ==========================================

function createTMDBPanel() {
  if (document.getElementById("cinevaTMDBPanel")) return;

  const panel = document.createElement("section");

  panel.id = "cinevaTMDBPanel";
  panel.className = "cineva-tmdb-panel";

  panel.innerHTML = `
    <div class="tmdb-panel-heading">
      <div>
        <span class="tmdb-label">CONTENT DISCOVERY</span>
        <h2>Import from TMDB</h2>
        <p>
          Find a movie or series and import its information
          directly into your CINEVA database.
        </p>
      </div>
    </div>

    <div class="tmdb-search-controls">

      <select id="tmdbMediaType">
        <option value="movie">Movies</option>
        <option value="tv">TV Series</option>
      </select>

      <input
        type="search"
        id="tmdbSearchInput"
        placeholder="Search movie or series..."
      >

      <button type="button" id="tmdbSearchBtn">
        Search TMDB
      </button>

    </div>

    <div id="tmdbStatus" aria-live="polite"></div>

    <div id="tmdbResults" class="tmdb-results"></div>
  `;

  dashboardPanel.prepend(panel);

  document
    .getElementById("tmdbSearchBtn")
    .addEventListener("click", searchCINEVATMDB);

  document
    .getElementById("tmdbSearchInput")
    .addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchCINEVATMDB();
      }
    });
}


// ==========================================
// TMDB STATUS MESSAGE
// ==========================================

function tmdbMessage(message, error = false) {
  const status = document.getElementById("tmdbStatus");

  if (!status) return;

  status.textContent = message;

  status.style.color = error
    ? "#ff6b6b"
    : "#35d07f";
}


// ==========================================
// SEARCH TMDB
// ==========================================


async function searchCINEVATMDB() {
  const query = document
    .getElementById("tmdbSearchInput")
    .value.trim();

  const mediaType = document
    .getElementById("tmdbMediaType")
    .value;

  const tmdbStatus = document.getElementById("tmdbStatus");
  const tmdbResults = document.getElementById("tmdbResults");
  const searchButton = document.getElementById("tmdbSearchBtn");

  if (!query) {
    tmdbStatus.textContent = "Please enter a movie or series name.";
    return;
  }

  searchButton.disabled = true;
  searchButton.textContent = "Searching...";
  tmdbStatus.textContent = "Searching TMDB...";
  tmdbResults.innerHTML = "";

  try {
    const { data, error } =
      await supabaseClient.functions.invoke("hyper-action", {
        body: {
          action: "search",
          query: query,
          mediaType: mediaType
        }
      });

    if (error) {
      let errorMessage = error.message || "Request failed.";

      if (error.context && typeof error.context.json === "function") {
        try {
          const details = await error.context.json();
          errorMessage =
            details.error || details.message || errorMessage;
        } catch (e) {
          console.error("Could not read server response:", e);
        }
      }

      throw new Error(errorMessage);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    const results = data?.results || [];

    tmdbStatus.textContent =
      `${results.length} results found for "${query}".`;

    displayCINEVATMDBResults(results);

  } catch (error) {
    console.error("CINEVA TMDB Search Error:", error);

    tmdbStatus.textContent =
      "TMDB search failed: " +
      (error.message || "Unknown error.");

  } finally {
    searchButton.disabled = false;
    searchButton.textContent = "Search TMDB";
  }
}


// ==========================================
// DISPLAY TMDB SEARCH RESULTS
// ==========================================

function displayCINEVATMDBResults(results) {
  const container =
    document.getElementById("tmdbResults");

  if (!results.length) {
    container.innerHTML = `
      <div class="tmdb-no-results">
        <h3>No results found</h3>
        <p>Try another title.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = results.map(item => `
    <article class="tmdb-result-card">

      ${
        item.poster
          ? `<img
              src="${escapeHTML(item.poster)}"
              alt="${escapeHTML(item.title)}"
              loading="lazy"
            >`
          : `<div class="tmdb-no-poster">No poster</div>`
      }

      <div class="tmdb-result-details">

        <h3>${escapeHTML(item.title)}</h3>

        <p>
          ${escapeHTML(item.releaseDate || "Release date unavailable")}
        </p>

        <p class="tmdb-rating">
          ★ ${Number(item.rating || 0).toFixed(1)} / 10
        </p>

        <p class="tmdb-description">
          ${escapeHTML(item.overview || "No description available.")}
        </p>

        <button
          type="button"
          class="tmdb-import-button"
          data-tmdb-id="${Number(item.id)}"
          data-media-type="${item.mediaType === "tv" ? "tv" : "movie"}"
        >
          Import to CINEVA
        </button>

      </div>

    </article>
  `).join("");

  container
    .querySelectorAll(".tmdb-import-button")
    .forEach(button => {

      button.addEventListener("click", async () => {

        const tmdbId = Number(button.dataset.tmdbId);
        const mediaType = button.dataset.mediaType;

        await importCINEVATMDB(
          tmdbId,
          mediaType,
          button
        );

      });

    });
}


// ==========================================
// IMPORT TMDB CONTENT INTO SUPABASE
// ==========================================

async function importCINEVATMDB(
  tmdbId,
  mediaType,
  button
) {

  if (!currentAdmin) {
    tmdbMessage("Admin login required.", true);
    return;
  }

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Importing...";

  tmdbMessage("Downloading artwork and saving metadata...");

  try {

    const { data, error } =
      await supabaseClient.functions.invoke("hyper-action", {
        body: {
          action: "import",
          tmdbId,
          mediaType
        }
      });

    if (error) throw error;

    if (!data?.success) {

      if (data?.alreadyImported) {
        throw new Error("This title is already imported.");
      }

      throw new Error(
        data?.error || "Import failed."
      );
    }

    button.textContent = "Imported ✓";
    button.classList.add("imported");

    tmdbMessage(
      `${data.title.title} successfully saved in Supabase!`
    );

    // Refresh the existing admin content table.
    await loadAdminTitles();

  } catch (error) {

    console.error("TMDB import error:", error);

    button.disabled = false;
    button.textContent = originalText;

    tmdbMessage(
      error.message || "Unable to import this title.",
      true
    );

  }

}


// ==========================================
// INITIALIZE TMDB PANEL
// ==========================================

// Add this function call when dashboard opens.

const originalShowDashboard = showDashboard;

showDashboard = function () {
  originalShowDashboard();

  createTMDBPanel();
};


// ==========================================
// END TMDB INTEGRATION
// ==========================================

// 16. AUTH SESSION LISTENER

supabaseClient.auth.onAuthStateChange(() => {
  setTimeout(checkAdmin, 0);
});


// 17. START DASHBOARD

checkAdmin();
