
/* =========================================
   CINEVA ADMIN DASHBOARD
   Movies + Series + TMDB + Supabase
========================================= */

/* 1. SUPABASE CONFIGURATION */

// Keep your existing matching project URL and anon/public key here.
// Do not use your service-role key in browser JavaScript.

const SUPABASE_URL = "https://exjgejujfxejjlbfizgz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4amdlanVqZnhlampsYmZpemd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTQzMTQsImV4cCI6MjA5NDA5MDMxNH0.CWUYLk4qJfriIYXWScB7wcHHVTCuz0SGDhWUV3tMR1Y";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const POSTER_BUCKET = "cineva-posters";
const VIDEO_BUCKET = "cineva-videos";
const TMDB_FUNCTION = "tmdb-api";

/* 2. ELEMENTS */

const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("loginForm");
const dashboardPanel = document.getElementById("dashboardPanel");

const titleForm = document.getElementById("titleForm");
const loginMessage = document.getElementById("loginMessage");
const uploadMessage = document.getElementById("uploadMessage");

const adminTitles = document.getElementById("adminTitles");
const saveTitleBtn = document.getElementById("saveTitleBtn");
const logoutBtn = document.getElementById("logoutBtn");

const footerYear = document.getElementById("footerYear");

let currentAdmin = null;
let allAdminContent = [];

if (footerYear) {
  footerYear.textContent = new Date().getFullYear();
}

/* 3. HELPERS */

function showMessage(element, message, type = "info") {
  if (!element) return;

  element.textContent = message;
  element.className = `form-message ${type}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseDuration(value) {
  if (!value) return null;

  const text = String(value).toLowerCase().trim();

  // Example: 2h 10m
  const hours = text.match(/(\d+)\s*h/);
  const minutes = text.match(/(\d+)\s*m/);

  if (hours || minutes) {
    return (
      Number(hours?.[1] || 0) * 60 +
      Number(minutes?.[1] || 0)
    );
  }

  // A number is interpreted as minutes.
  const number = Number(text);

  return Number.isFinite(number) && number > 0
    ? Math.round(number)
    : null;
}

function getSelectedFile(id) {
  return document.getElementById(id)?.files?.[0] || null;
}

/* 4. ADMIN AUTHENTICATION */

async function checkAdmin() {
  const {
    data: { user },
    error
  } = await supabaseClient.auth.getUser();

  if (error || !user) {
    currentAdmin = null;
    showLogin();
    return;
  }

  if (user.app_metadata?.role !== "admin") {
    currentAdmin = null;
    await supabaseClient.auth.signOut();

    showMessage(
      loginMessage,
      "Access denied. This account is not an administrator.",
      "error"
    );

    showLogin();
    return;
  }

  currentAdmin = user;

  showDashboard();
  await loadAdminTitles();
}

function showLogin() {
  if (loginPanel) loginPanel.hidden = false;
  if (dashboardPanel) dashboardPanel.hidden = true;
  if (logoutBtn) logoutBtn.hidden = true;
}

function showDashboard() {
  if (loginPanel) loginPanel.hidden = true;
  if (dashboardPanel) dashboardPanel.hidden = false;
  if (logoutBtn) logoutBtn.hidden = false;

  createTMDBPanel();
  createEpisodeAndPartsPanel();
}

if (loginForm) {
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;

    showMessage(loginMessage, "Signing in...", "info");

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage(loginMessage, error.message, "error");
      return;
    }

    await checkAdmin();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    currentAdmin = null;
    showLogin();
  });
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    setTimeout(checkAdmin, 0);
  } else {
    showLogin();
  }
});

/* 5. STORAGE UPLOAD */

async function uploadFile(bucket, file) {
  if (!file) return null;

  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  const filePath =
    `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  if (bucket === POSTER_BUCKET) {
    const { data: publicData } = supabaseClient.storage
      .from(POSTER_BUCKET)
      .getPublicUrl(data.path);

    return publicData.publicUrl;
  }

  // Private video storage: save the storage path, not a public URL.
  return data.path;
}

/* 6. ADD MOVIE OR SERIES */

if (titleForm) {
  titleForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentAdmin) {
      showMessage(uploadMessage, "Please sign in again.", "error");
      return;
    }

    const title = document.getElementById("title").value.trim();
    const type = document.getElementById("type").value;
    const genre = document.getElementById("genre").value;

    const yearValue = document.getElementById("year").value;
    const ratingValue = document.getElementById("rating").value;
    const durationValue = document.getElementById("duration").value;

    const description =
      document.getElementById("description").value.trim();

    const posterFile = getSelectedFile("posterFile");
    const backdropFile = getSelectedFile("backdropFile");
    const videoFile = getSelectedFile("videoFile");

    const featured =
      document.getElementById("featured").checked;

    const published =
      document.getElementById("published").checked;

    if (!title || !genre || !posterFile) {
      showMessage(
        uploadMessage,
        "Enter a title, select a category and choose a poster.",
        "error"
      );
      return;
    }

    // The series table does not have a video_url column.
    if (type === "Series" && videoFile) {
      showMessage(
        uploadMessage,
        "Upload series videos through the episode manager, not this form.",
        "error"
      );
      return;
    }

    saveTitleBtn.disabled = true;
    saveTitleBtn.textContent = "Uploading...";

    try {
      showMessage(uploadMessage, "Uploading poster...", "info");

      const posterURL = await uploadFile(
        POSTER_BUCKET,
        posterFile
      );

      let backdropURL = null;
      let videoPath = null;

      if (backdropFile) {
        showMessage(uploadMessage, "Uploading background...", "info");

        backdropURL = await uploadFile(
          POSTER_BUCKET,
          backdropFile
        );
      }

      if (videoFile) {
        showMessage(uploadMessage, "Uploading video...", "info");

        videoPath = await uploadFile(
          VIDEO_BUCKET,
          videoFile
        );
      }

      const commonData = {
        title,
        slug: slugify(title),
        description: description || null,
        genre: [genre],
        year: yearValue ? Number(yearValue) : null,
        rating: ratingValue ? Number(ratingValue) : null,
        poster_url: posterURL,
        backdrop_url: backdropURL,
        featured,
        published,
        updated_at: new Date().toISOString()
      };

      let result;

      if (type === "Movie") {
        const movieData = {
          ...commonData,
          duration: parseDuration(durationValue),
          video_url: videoPath,
          allow_download: false
        };

        result = await supabaseClient
          .from("movies")
          .insert(movieData);
      } else {
        result = await supabaseClient
          .from("series")
          .insert(commonData);
      }

      if (result.error) throw result.error;

      showMessage(
        uploadMessage,
        type === "Movie"
          ? "Movie uploaded successfully!"
          : "Series uploaded successfully! Add its episodes next.",
        "success"
      );

      titleForm.reset();

      await loadAdminTitles();

    } catch (error) {
      console.error("CINEVA upload error:", error);

      showMessage(
        uploadMessage,
        error.message || "Upload failed. Check your Supabase settings.",
        "error"
      );

    } finally {
      saveTitleBtn.disabled = false;
      saveTitleBtn.textContent = "Upload Content";
    }
  });
}

/* 7. LOAD MOVIES AND SERIES */

async function loadAdminTitles() {
  if (!adminTitles) return;

  adminTitles.innerHTML = `
    <tr>
      <td colspan="5">Loading content...</td>
    </tr>
  `;

  try {
    const [movieResult, seriesResult] = await Promise.all([
      supabaseClient.from("movies").select("*")
        .order("created_at", { ascending: false }),

      supabaseClient.from("series").select("*")
        .order("created_at", { ascending: false })
    ]);

    if (movieResult.error) throw movieResult.error;
    if (seriesResult.error) throw seriesResult.error;

    const movies = (movieResult.data || []).map(item => ({
      ...item,
      content_type: "Movie"
    }));

    const series = (seriesResult.data || []).map(item => ({
      ...item,
      content_type: "Series"
    }));

    allAdminContent = [...movies, ...series].sort((a, b) => {
      return new Date(b.created_at || 0) -
        new Date(a.created_at || 0);
    });

    updateAdminStats();
    renderAdminTitles();

  } catch (error) {
    console.error("Admin content loading error:", error);

    adminTitles.innerHTML = `
      <tr>
        <td colspan="5">
          Could not load content: ${escapeHTML(error.message)}
        </td>
      </tr>
    `;
  }
}

function updateAdminStats() {
  const total = allAdminContent.length;

  const published = allAdminContent.filter(
    item => item.published === true
  ).length;

  const drafts = total - published;

  document.getElementById("totalTitles").textContent = total;
  document.getElementById("publishedTitles").textContent = published;
  document.getElementById("draftTitles").textContent = drafts;
}

/* 8. RENDER ADMIN CONTENT */

function renderAdminTitles() {
  if (!allAdminContent.length) {
    adminTitles.innerHTML = `
      <tr>
        <td colspan="5">No movies or series have been added yet.</td>
      </tr>
    `;
    return;
  }

  adminTitles.innerHTML = allAdminContent.map(item => {
    const category = Array.isArray(item.genre)
      ? item.genre.join(", ")
      : item.genre || "Uncategorized";

    const poster = item.poster_url
      ? `<img src="${escapeHTML(item.poster_url)}"
           alt="${escapeHTML(item.title)}"
           class="admin-poster">`
      : "No poster";

    return `
      <tr>
        <td>${poster}</td>

        <td>
          <strong>${escapeHTML(item.title)}</strong>
          <small>${item.content_type}</small>
        </td>

        <td>${escapeHTML(category)}</td>

        <td>
          <span class="${item.published ? "status-published" : "status-draft"}">
            ${item.published ? "Published" : "Draft"}
          </span>
        </td>

        <td>
          <button
            class="btn btn-outline"
            type="button"
            data-action="toggle"
            data-id="${item.id}"
            data-type="${item.content_type}">
            ${item.published ? "Unpublish" : "Publish"}
          </button>

          <button
            class="btn btn-outline"
            type="button"
            data-action="manage"
            data-id="${item.id}"
            data-type="${item.content_type}">
            ${item.content_type === "Movie" ? "Parts" : "Episodes"}
          </button>

          <button
            class="btn btn-danger"
            type="button"
            data-action="delete"
            data-id="${item.id}"
            data-type="${item.content_type}">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/* 9. PUBLISH / UNPUBLISH / DELETE */

if (adminTitles) {
  adminTitles.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const type = button.dataset.type;
    const action = button.dataset.action;

    const table = type === "Movie" ? "movies" : "series";

    try {
      button.disabled = true;

      if (action === "toggle") {
        const item = allAdminContent.find(
          content => content.id === id
        );

        if (!item) return;

        const { error } = await supabaseClient
          .from(table)
          .update({
            published: !item.published,
            updated_at: new Date().toISOString()
          })
          .eq("id", id);

        if (error) throw error;

        await loadAdminTitles();
      }

      if (action === "delete") {
        const confirmed = confirm(
          `Delete "${button.closest("tr").querySelector("strong").textContent}"?`
        );

        if (!confirmed) return;

        const { error } = await supabaseClient
          .from(table)
          .delete()
          .eq("id", id);

        if (error) throw error;

        await loadAdminTitles();
      }

      if (action === "manage") {
        openPartsOrEpisodesManager(id, type);
      }

    } catch (error) {
      console.error("Content action error:", error);
      alert(error.message || "Action failed.");
    } finally {
      button.disabled = false;
    }
  });
}

/* 10. MOVIE PARTS AND SERIES EPISODE MANAGER */

function createEpisodeAndPartsPanel() {
  if (document.getElementById("contentDetailPanel")) return;

  const panel = document.createElement("section");

  panel.id = "contentDetailPanel";
  panel.className = "admin-panel";
  panel.hidden = true;

  panel.innerHTML = `
    <h2 id="detailPanelTitle">Manage Content</h2>

    <p id="detailPanelMessage" class="form-message"></p>

    <form id="detailContentForm">

      <div id="seasonFields">
        <label for="seasonNumber">Season Number</label>
        <input id="seasonNumber" type="number" min="1" value="1">

        <label for="episodeNumber">Episode Number</label>
        <input id="episodeNumber" type="number" min="1" value="1">
      </div>

      <div id="partFields" hidden>
        <label for="partNumber">Part Number</label>
        <input id="partNumber" type="number" min="1" value="1">

        <label for="partLabel">Part Label</label>
        <input id="partLabel" type="text" value="Part A">
      </div>

      <label for="detailTitle">Title</label>
      <input id="detailTitle" type="text" required>

      <label for="detailDescription">Description</label>
      <textarea id="detailDescription" rows="3"></textarea>

      <label for="detailDuration">Duration (minutes)</label>
      <input id="detailDuration" type="number" min="1">

      <label for="detailVideo">Video File</label>
      <input id="detailVideo" type="file"
        accept="video/mp4,video/webm,video/ogg">

      <label for="detailVideoURL">Or Existing Video URL / Storage Path</label>
      <input id="detailVideoURL" type="text"
        placeholder="Optional video URL or storage path">

      <label for="detailStill">Episode Still Image (series only)</label>
      <input id="detailStill" type="file"
        accept="image/jpeg,image/png,image/webp">

      <div class="admin-checkboxes">
        <label>
          <input type="checkbox" id="detailPublished">
          Publish this item
        </label>

        <label>
          <input type="checkbox" id="detailDownload">
          Allow downloads
        </label>
      </div>

      <button class="btn btn-primary" type="submit" id="saveDetailBtn">
        Save
      </button>

      <button class="btn btn-outline" type="button" id="closeDetailBtn">
        Close
      </button>
    </form>

    <h3>Existing Parts / Episodes</h3>

    <div id="detailItemsList">
      No items loaded.
    </div>
  `;

  dashboardPanel.appendChild(panel);

  document.getElementById("closeDetailBtn")
    .addEventListener("click", () => {
      panel.hidden = true;
    });

  document.getElementById("detailContentForm")
    .addEventListener("submit", savePartOrEpisode);
}

let activeDetailId = null;
let activeDetailType = null;

async function openPartsOrEpisodesManager(id, type) {
  activeDetailId = id;
  activeDetailType = type;

  const panel = document.getElementById("contentDetailPanel");
  const isMovie = type === "Movie";

  panel.hidden = false;

  document.getElementById("detailPanelTitle").textContent =
    isMovie ? "Manage Movie Parts" : "Manage Series Episodes";

  document.getElementById("partFields").hidden = !isMovie;
  document.getElementById("seasonFields").hidden = isMovie;
  document.getElementById("detailStill").parentElement.hidden = isMovie;

  document.getElementById("detailContentForm").reset();

  document.getElementById("detailPanelMessage").textContent = "";

  await loadPartsOrEpisodes();
  panel.scrollIntoView({ behavior: "smooth" });
}

async function loadPartsOrEpisodes() {
  const isMovie = activeDetailType === "Movie";
  const table = isMovie ? "movie_parts" : "episodes";
  const foreignKey = isMovie ? "movie_id" : "series_id";

  const list = document.getElementById("detailItemsList");

  list.textContent = "Loading...";

  try {
    const { data, error } = await supabaseClient
      .from(table)
      .select("*")
      .eq(foreignKey, activeDetailId)
      .order(
        isMovie ? "sort_order" : "season_number",
        { ascending: true }
      );

    if (error) throw error;

    if (!data.length) {
      list.textContent = "No parts or episodes added yet.";
      return;
    }

    list.innerHTML = data.map(item => `
      <div class="admin-detail-item">
        <strong>
          ${escapeHTML(
            isMovie
              ? item.part_label
              : `S${item.season_number} E${item.episode_number}`
          )}
          — ${escapeHTML(item.title || "")}
        </strong>

        <span>${item.published ? "Published" : "Draft"}</span>

        <button
          class="btn btn-danger"
          type="button"
          data-detail-delete="${item.id}">
          Delete
        </button>
      </div>
    `).join("");

    list.querySelectorAll("[data-detail-delete]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Delete this item?")) return;

        const { error: deleteError } = await supabaseClient
          .from(table)
          .delete()
          .eq("id", button.dataset.detailDelete);

        if (deleteError) {
          alert(deleteError.message);
          return;
        }

        await loadPartsOrEpisodes();
      });
    });

  } catch (error) {
    list.textContent = error.message;
  }
}

async function savePartOrEpisode(event) {
  event.preventDefault();

  const isMovie = activeDetailType === "Movie";

  const table = isMovie ? "movie_parts" : "episodes";

  const button = document.getElementById("saveDetailBtn");
  const message = document.getElementById("detailPanelMessage");

  const title = document.getElementById("detailTitle").value.trim();

  if (!title) {
    showMessage(message, "Enter a title.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    let videoPath = document.getElementById("detailVideoURL")
      .value.trim() || null;

    const videoFile = getSelectedFile("detailVideo");
    const stillFile = getSelectedFile("detailStill");

    if (videoFile) {
      videoPath = await uploadFile(VIDEO_BUCKET, videoFile);
    }

    if (!videoPath) {
      throw new Error("Choose a video file or enter a video URL.");
    }

    const common = {
      title,
      description:
        document.getElementById("detailDescription").value.trim() || null,
      duration:
        Number(document.getElementById("detailDuration").value) || null,
      video_url: videoPath,
      published:
        document.getElementById("detailPublished").checked,
      allow_download:
        document.getElementById("detailDownload").checked,
      updated_at: new Date().toISOString()
    };

    let data;

    if (isMovie) {
      const partNumber =
        Number(document.getElementById("partNumber").value);

      const partLabel =
        document.getElementById("partLabel").value.trim();

      if (!partNumber || !partLabel) {
        throw new Error("Enter the part number and label.");
      }

      data = {
        ...common,
        movie_id: activeDetailId,
        part_number: partNumber,
        part_label: partLabel,
        sort_order: partNumber
      };

    } else {
      const seasonNumber =
        Number(document.getElementById("seasonNumber").value);

      const episodeNumber =
        Number(document.getElementById("episodeNumber").value);

      if (!seasonNumber || !episodeNumber) {
        throw new Error("Enter the season and episode numbers.");
      }

      let stillURL = null;

      if (stillFile) {
        stillURL = await uploadFile(POSTER_BUCKET, stillFile);
      }

      data = {
        ...common,
        series_id: activeDetailId,
        season_number: seasonNumber,
        episode_number: episodeNumber,
        still_url: stillURL
      };
    }

    const { error } = await supabaseClient
      .from(table)
      .insert(data);

    if (error) throw error;

    showMessage(
      message,
      isMovie ? "Movie part saved!" : "Episode saved!",
      "success"
    );

    document.getElementById("detailContentForm").reset();

    await loadPartsOrEpisodes();

  } catch (error) {
    console.error("Part / episode error:", error);
    showMessage(message, error.message, "error");

  } finally {
    button.disabled = false;
    button.textContent = "Save";
  }
}

/* 11. TMDB IMPORT PANEL */

function createTMDBPanel() {
  if (document.getElementById("tmdbAdminPanel")) return;

  const panel = document.createElement("section");

  panel.id = "tmdbAdminPanel";
  panel.className = "admin-panel";

  panel.innerHTML = `
    <h2>TMDB Movie & Series Importer</h2>

    <p>
      Search TMDB and import movie or series metadata and artwork
      into your CINEVA database.
    </p>

    <label for="tmdbSearchType">Content Type</label>

    <select id="tmdbSearchType">
      <option value="movie">Movie</option>
      <option value="tv">Series</option>
    </select>

    <label for="tmdbSearchInput">Search Title</label>

    <input
      id="tmdbSearchInput"
      type="search"
      placeholder="Search for a movie or series..."
    >

    <button class="btn btn-primary" id="tmdbSearchBtn" type="button">
      Search TMDB
    </button>

    <p id="tmdbMessage" class="form-message"></p>

    <div id="tmdbResults"></div>
  `;

  dashboardPanel.prepend(panel);

  document.getElementById("tmdbSearchBtn")
    .addEventListener("click", searchTMDB);

  document.getElementById("tmdbSearchInput")
    .addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchTMDB();
      }
    });
}

async function searchTMDB() {
  const query = document.getElementById("tmdbSearchInput")
    .value.trim();

  const mediaType = document.getElementById("tmdbSearchType").value;

  const message = document.getElementById("tmdbMessage");
  const resultsContainer = document.getElementById("tmdbResults");

  if (!query) {
    showMessage(message, "Enter a title to search.", "error");
    return;
  }

  showMessage(message, "Searching TMDB...", "info");
  resultsContainer.innerHTML = "";

  try {
    const { data, error } = await supabaseClient.functions.invoke(
      TMDB_FUNCTION,
      {
        body: {
          action: "search",
          query,
          mediaType
        }
      }
    );

    if (error) throw error;

    if (!data || data.error) {
      throw new Error(data?.error || "TMDB search failed.");
    }

    const results = data.results || [];

    if (!results.length) {
      showMessage(message, "No results found.", "info");
      return;
    }

    showMessage(message, `${results.length} results found.`, "success");

    resultsContainer.innerHTML = results.map(item => `
      <div class="tmdb-result">
        ${
          item.poster
            ? `<img src="${escapeHTML(item.poster)}"
                 alt="${escapeHTML(item.title)}">`
            : ""
        }

        <div>
          <h3>${escapeHTML(item.title)}</h3>

          <p>
            ${escapeHTML(item.releaseDate || "Release date unknown")}
          </p>

          <p>${escapeHTML(item.overview || "")}</p>

          <button
            class="btn btn-primary"
            type="button"
            data-tmdb-id="${item.id}"
            data-media-type="${item.mediaType || mediaType}">
            Import to CINEVA
          </button>
        </div>
      </div>
    `).join("");

    resultsContainer.querySelectorAll("[data-tmdb-id]")
      .forEach(button => {
        button.addEventListener("click", () => {
          importTMDB(
            Number(button.dataset.tmdbId),
            button.dataset.mediaType,
            button
          );
        });
      });

  } catch (error) {
    console.error("TMDB search error:", error);
    showMessage(message, error.message, "error");
  }
}

async function importTMDB(tmdbId, mediaType, button) {
  const message = document.getElementById("tmdbMessage");

  button.disabled = true;
  button.textContent = "Importing...";

  showMessage(message, "Importing metadata and artwork...", "info");

  try {
    const { data, error } = await supabaseClient.functions.invoke(
      TMDB_FUNCTION,
      {
        body: {
          action: "import",
          tmdbId,
          mediaType
        }
      }
    );

    if (error) throw error;

    if (!data || !data.success) {
      throw new Error(data?.error || "TMDB import failed.");
    }

    showMessage(
      message,
      data.message || "Successfully imported into CINEVA as a draft.",
      "success"
    );

    button.textContent = "Imported";

    await loadAdminTitles();

  } catch (error) {
    console.error("TMDB import error:", error);

    showMessage(message, error.message, "error");

    button.disabled = false;
    button.textContent = "Retry Import";
  }
}

/* 12. INITIALIZE */

document.addEventListener("DOMContentLoaded", async () => {
  showLogin();
  await checkAdmin();
});
