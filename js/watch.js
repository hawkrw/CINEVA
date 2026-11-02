
/* =====================================
   CINEVA - WATCH PAGE
   ===================================== */

// 1. SUPABASE CONFIGURATION
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// 2. PAGE ELEMENTS
const videoPlayer = document.getElementById("videoPlayer");
const watchTitle = document.getElementById("watchTitle");
const watchMeta = document.getElementById("watchMeta");
const watchDescription = document.getElementById("watchDescription");
const watchGenres = document.getElementById("watchGenres");
const watchListBtn = document.getElementById("watchListBtn");
const relatedTitles = document.getElementById("relatedTitles");

document.getElementById("footerYear").textContent =
  new Date().getFullYear();

// 3. GET TITLE ID FROM URL
const params = new URLSearchParams(window.location.search);
const titleId = params.get("id");

let currentTitle = null;

// 4. LOAD SELECTED TITLE
async function loadTitle() {
  if (!titleId) {
    showError("No movie or series was selected.");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("titles")
      .select("*")
      .eq("id", titleId)
      .eq("published", true)
      .single();

    if (error) throw error;

    currentTitle = data;

    displayTitle(data);
    loadRelatedTitles(data);
    updateWatchListButton(data.id);

  } catch (error) {
    console.error("CINEVA loading error:", error);
    showError("This movie or series could not be found.");
  }
}

// 5. DISPLAY TITLE INFORMATION
function displayTitle(title) {
  document.title = `${title.title} | CINEVA`;

  watchTitle.textContent = title.title || "Untitled";

  watchMeta.innerHTML = `
    <span>${escapeHTML(title.year || "Year unknown")}</span>
    <span>${escapeHTML(title.type || "Movie")}</span>
    <span>★ ${escapeHTML(title.rating || "N/A")}</span>
    <span>${escapeHTML(title.duration || "")}</span>
  `;

  watchDescription.textContent =
    title.description || "No description available.";

  watchGenres.textContent = title.genre || "";

  // VIDEO PLAYER
  if (title.video_url) {
    const video = document.createElement("video");

    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "metadata";
    video.poster = title.backdrop_url || title.poster_url || "";

    const source = document.createElement("source");
    source.src = title.video_url;

    video.appendChild(source);
    videoPlayer.replaceChildren(video);
  } else {
    videoPlayer.innerHTML = `
      <div class="video-placeholder">
        <div class="play-icon">▶</div>
        <p>Video is not available yet.</p>
      </div>
    `;
  }
}

// 6. LOAD RELATED TITLES
async function loadRelatedTitles(title) {
  const { data, error } = await supabaseClient
    .from("titles")
    .select("id, title, poster_url, year, type, genre")
    .eq("published", true)
    .neq("id", title.id)
    .limit(6);

  if (error) {
    console.error("Related titles error:", error);
    relatedTitles.textContent = "No recommendations available.";
    return;
  }

  if (!data || data.length === 0) {
    relatedTitles.textContent = "No recommendations available.";
    return;
  }

  relatedTitles.innerHTML = data.map(item => `
    <a class="related-card" href="watch.html?id=${encodeURIComponent(item.id)}">
      <img
        src="${escapeHTML(item.poster_url || "")}"
        alt="${escapeHTML(item.title)}"
        loading="lazy"
        onerror="this.style.display='none'"
      >
      <div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.year || "")} · ${escapeHTML(item.type || "")}</p>
      </div>
    </a>
  `).join("");
}

// 7. MY LIST
function getMyList() {
  try {
    return JSON.parse(localStorage.getItem("cinevaMyList")) || [];
  } catch {
    return [];
  }
}

function updateWatchListButton(id) {
  const saved = getMyList().some(item => String(item) === String(id));

  watchListBtn.textContent = saved ? "✓ Added to My List" : "+ My List";
}

watchListBtn.addEventListener("click", () => {
  if (!currentTitle) return;

  let list = getMyList();

  const exists = list.some(
    item => String(item) === String(currentTitle.id)
  );

  if (exists) {
    list = list.filter(
      item => String(item) !== String(currentTitle.id)
    );
  } else {
    list.push(currentTitle.id);
  }

  localStorage.setItem("cinevaMyList", JSON.stringify(list));
  updateWatchListButton(currentTitle.id);
});

// 8. ERROR DISPLAY
function showError(message) {
  watchTitle.textContent = "Content unavailable";
  watchDescription.textContent = message;

  videoPlayer.innerHTML = `
    <div class="video-placeholder">
      <p>${escapeHTML(message)}</p>
      <a href="index.html">Return to Home</a>
    </div>
  `;

  relatedTitles.textContent = "";
}

// 9. BASIC HTML ESCAPING
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

// 10. START
loadTitle();
