
/* =========================================
   CINEVA - MY LIST
   Saved Movies and Series
   ========================================= */

// 1. SUPABASE CONFIGURATION

const SUPABASE_URL = "https://ciifhscwcaslnkwtgoyp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4amdlanVqZnhlampsYmZpemd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTQzMTQsImV4cCI6MjA5NDA5MDMxNH0.CWUYLk4qJfriIYXWScB7wcHHVTCuz0SGDhWUV3tMR1Y";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


// 2. ELEMENTS

const myListGrid = document.getElementById("myListGrid");
const savedCount = document.getElementById("savedCount");

document.getElementById("footerYear").textContent =
  new Date().getFullYear();


// 3. GET SAVED TITLES

function getMyList() {
  try {
    return JSON.parse(
      localStorage.getItem("cinevaMyList")
    ) || [];
  } catch {
    return [];
  }
}


// 4. SAVE LIST

function saveMyList(list) {
  localStorage.setItem(
    "cinevaMyList",
    JSON.stringify(list)
  );
}


// 5. ESCAPE HTML

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}


// 6. EMPTY STATE

function showEmptyList() {
  myListGrid.innerHTML = `
    <div class="empty-list">
      <div class="empty-icon">♡</div>

      <h3>Your list is empty</h3>

      <p>
        Explore CINEVA and save movies or series
        you want to watch later.
      </p>

      <a href="index.html" class="btn btn-primary">
        Explore Movies
      </a>
    </div>
  `;

  savedCount.textContent = "0";
}


// 7. LOAD SAVED CONTENT

async function loadMyList() {
  const ids = getMyList();

  if (!ids.length) {
    showEmptyList();
    return;
  }

  myListGrid.innerHTML = "<p>Loading your collection...</p>";

  try {
    const { data, error } = await supabaseClient
      .from("titles")
      .select("*")
      .eq("published", true)
      .in("id", ids);

    if (error) throw error;

    if (!data || !data.length) {
      saveMyList([]);
      showEmptyList();
      return;
    }

    // Preserve the visitor's saved order.
    const orderedTitles = ids
      .map(id => data.find(item => String(item.id) === String(id)))
      .filter(Boolean);

    // Remove unpublished or deleted IDs.
    saveMyList(orderedTitles.map(item => item.id));

    savedCount.textContent = orderedTitles.length;

    renderMyList(orderedTitles);

  } catch (error) {
    console.error("My List error:", error);

    myListGrid.innerHTML = `
      <p>Unable to load your collection. Please try again.</p>
    `;
  }
}


// 8. RENDER SAVED TITLES

function renderMyList(titles) {
  myListGrid.innerHTML = titles.map(item => `
    <article class="movie-card">

      <a href="watch.html?id=${encodeURIComponent(item.id)}"
         class="movie-poster">

        <img
          src="${escapeHTML(item.poster_url || "")}"
          alt="${escapeHTML(item.title)}"
          loading="lazy"
        >

        <span class="movie-type">
          ${escapeHTML(item.type || "Movie")}
        </span>

      </a>

      <div class="movie-info">

        <h3>
          <a href="watch.html?id=${encodeURIComponent(item.id)}">
            ${escapeHTML(item.title)}
          </a>
        </h3>

        <div class="movie-meta">
          <span>${escapeHTML(item.year || "")}</span>
          <span>★ ${escapeHTML(item.rating || "N/A")}</span>
        </div>

        <button
          class="remove-list-btn"
          type="button"
          data-remove-id="${escapeHTML(item.id)}"
        >
          ✕ Remove from My List
        </button>

      </div>

    </article>
  `).join("");
}


// 9. REMOVE SAVED TITLE

myListGrid.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-id]");

  if (!button) return;

  const id = button.dataset.removeId;

  const updatedList = getMyList().filter(
    item => String(item) !== String(id)
  );

  saveMyList(updatedList);

  loadMyList();
});


// 10. START

loadMyList();
