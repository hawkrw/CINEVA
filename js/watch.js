
/* =========================================
   CINEVA - SECURE WATCH PAGE
   Private Supabase Video Playback
   ========================================= */

// 1. SUPABASE CONFIGURATION
const SUPABASE_URL = "https://ciifhscwcaslnkwtgoyp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4amdlanVqZnhlampsYmZpemd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTQzMTQsImV4cCI6MjA5NDA5MDMxNH0.CWUYLk4qJfriIYXWScB7wcHHVTCuz0SGDhWUV3tMR1Y";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const VIDEO_BUCKET = "cineva-videos";
const SIGNED_URL_DURATION = 3600;


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


// 3. GET TITLE ID

const params = new URLSearchParams(window.location.search);
const titleId = params.get("id");

let currentTitle = null;


// 4. HTML ESCAPING

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}


// 5. LOAD SELECTED TITLE

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
    await loadVideo(data.video_url);
    loadRelatedTitles(data);
    updateWatchListButton(data.id);

  } catch (error) {
    console.error("CINEVA error:", error);
    showError("This movie or series could not be found.");
  }
}


// 6. DISPLAY TITLE DETAILS

function displayTitle(title) {
  document.title = `${title.title} | CINEVA`;

  watchTitle.textContent = title.title || "Untitled";

  watchMeta.innerHTML = `
    <span>${escapeHTML(title.year || "Unknown year")}</span>
    <span>${escapeHTML(title.type || "Movie")}</span>
    <span>★ ${escapeHTML(title.rating || "N/A")}</span>
    <span>${escapeHTML(title.duration || "")}</span>
  `;

  watchDescription.textContent =
    title.description || "No description available.";

  watchGenres.textContent = title.genre || "";
}


// 7. PRIVATE VIDEO PLAYBACK

async function loadVideo(videoPath) {
  if (!videoPath) {
    showVideoMessage("Video is not available yet.");
    return;
  }

  try {
    const { data, error } = await supabaseClient.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(videoPath, SIGNED_URL_DURATION);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error("Could not generate video playback URL.");
    }

    const video = document.createElement("video");

    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.poster = currentTitle.backdrop_url ||
      currentTitle.poster_url || "";

    const source = document.createElement("source");

    source.src = data.signedUrl;
    source.type = "video/mp4";

    video.appendChild(source);

    video.addEventListener("error", () => {
      showVideoMessage(
        "Video playback failed. Please refresh and try again."
      );
    });

    videoPlayer.replaceChildren(video);

  } catch (error) {
    console.error("Video playback error:", error);

    showVideoMessage(
      "Unable to load this video. Please try again later."
    );
  }
}


// 8. VIDEO MESSAGE

function showVideoMessage(message) {
  const container = document.createElement("div");
  container.className = "video-placeholder";

  const paragraph = document.createElement("p");
  paragraph.textContent = message;

  container.appendChild(paragraph);
  videoPlayer.replaceChildren(container);
}


// 9. RELATED CONTENT

async function loadRelatedTitles(title) {
  const { data, error } = await supabaseClient
    .from("titles")
    .select("id, title, poster_url, year, type, genre")
    .eq("published", true)
    .neq("id", title.id)
    .limit(6);

  if (error) {
    console.error(error);
    relatedTitles.textContent = "Recommendations unavailable.";
    return;
  }

  if (!data?.length) {
    relatedTitles.textContent = "No recommendations available.";
    return;
  }

  relatedTitles.innerHTML = data.map(item => `
    <a class="related-card"
       href="watch.html?id=${encodeURIComponent(item.id)}">

      <img
        src="${escapeHTML(item.poster_url || "")}"
        alt="${escapeHTML(item.title)}"
        loading="lazy"
      >

      <div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>
          ${escapeHTML(item.year || "")}
          ·
          ${escapeHTML(item.type || "")}
        </p>
      </div>

    </a>
  `).join("");
}


// 10. MY LIST

function getMyList() {
  try {
    return JSON.parse(
      localStorage.getItem("cinevaMyList")
    ) || [];
  } catch {
    return [];
  }
}

function updateWatchListButton(id) {
  const saved = getMyList().some(
    item => String(item) === String(id)
  );

  watchListBtn.textContent =
    saved ? "✓ Added to My List" : "+ My List";
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

  localStorage.setItem(
    "cinevaMyList",
    JSON.stringify(list)
  );

  updateWatchListButton(currentTitle.id);
});


// 11. ERROR DISPLAY

function showError(message) {
  watchTitle.textContent = "Content unavailable";
  watchDescription.textContent = message;

  showVideoMessage(message);

  relatedTitles.textContent = "";
}


// 12. START

loadTitle();
