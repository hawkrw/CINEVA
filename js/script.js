
/* =========================================
   CINEVA STREAMING PLATFORM
   Main JavaScript + Supabase
========================================= */

/* 1. SUPABASE CONFIGURATION */

const SUPABASE_URL = "https://ciifhscwcaslnkwtgoyp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpaWZoc2N3Y2FzbG5rd3Rnb3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDk3NTUsImV4cCI6MjEwOTE4NTc1NX0.XdYZzTlBNY9xRm08cu6gKWkKI7LeuF45jUSFE3cEMhA";

let db = null;

if (
  window.supabase &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_")
) {
  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

/* 2. GLOBAL VARIABLES */

let allTitles = [];
let activeFilter = "All";
let searchTerm = "";
let showingMyList = false;

const $ = id => document.getElementById(id);

const placeholderPoster =
  "https://images.unsplash.com/photo-1489599849927-2ee91ashed?auto=format&fit=crop&w=600&q=80";

/* 3. HELPER FUNCTIONS */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function notify(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function getMyList() {
  try {
    return JSON.parse(
      localStorage.getItem("cineva_my_list") || "[]"
    );
  } catch {
    return [];
  }
}

function saveMyList(list) {
  localStorage.setItem(
    "cineva_my_list",
    JSON.stringify(list)
  );
}

function formatYear(year) {
  return year || "New release";
}

/* 4. MOVIE CARD DESIGN */

function createMovieCard(movie) {

  const poster = movie.poster_url || placeholderPoster;

  return `
    <article class="movie-card">

      <a href="watch.html?id=${encodeURIComponent(movie.id)}">

        <div class="poster-wrap">

          <img
            src="${escapeHTML(poster)}"
            alt="${escapeHTML(movie.title)} poster"
            loading="lazy"
            onerror="this.onerror=null;this.src='${placeholderPoster}'"
          >

          ${movie.featured
            ? '<span class="poster-badge">FEATURED</span>'
            : '<span class="poster-badge">CINEVA</span>'}

          <span class="poster-type">
            ${escapeHTML(movie.type || "Movie")}
          </span>

          <span class="card-play">▶</span>

        </div>

      </a>

      <h3 class="movie-title">
        ${escapeHTML(movie.title)}
      </h3>

      <p class="movie-meta">
        ${escapeHTML(formatYear(movie.year))}
        &nbsp; • &nbsp;
        ${escapeHTML(movie.genre || "Entertainment")}
        ${movie.rating
          ? ` &nbsp; • &nbsp; ★ ${escapeHTML(movie.rating)}`
          : ""}
      </p>

    </article>
  `;
}

/* 5. DISPLAY MOVIES */

function renderGrid(elementId, movies) {

  const container = $(elementId);

  if (!container) return;

  if (!movies.length) {
    container.innerHTML = `
      <div class="loading-state">
        No titles available yet.
      </div>
    `;
    return;
  }

  container.innerHTML = movies
    .map(createMovieCard)
    .join("");
}

/* 6. HOMEPAGE CONTENT */

function displayHomepage() {

  const latest = [...allTitles]
    .sort((a, b) =>
      new Date(b.created_at || 0) -
      new Date(a.created_at || 0)
    );

  const movies = latest.filter(
    item => item.type?.toLowerCase() === "movie"
  );

  const series = latest.filter(
    item => item.type?.toLowerCase() === "series"
  );

  const featured = latest.find(
    item => item.featured
  );

  renderGrid(
    "latestGrid",
    latest.slice(0, 5)
  );

  renderGrid(
    "moviesGrid",
    movies.slice(0, 5)
  );

  renderGrid(
    "seriesGrid",
    series.slice(0, 5)
  );

  updateHero(featured || latest[0]);

  displayAllContent();
}

/* 7. FEATURED HERO */

function updateHero(movie) {

  if (!movie) return;

  const title = $("heroTitle");
  const description = $("heroDescription");
  const meta = $("heroMeta");
  const backdrop = $("heroBackdrop");
  const watch = $("heroWatch");

  if (title) {
    title.textContent = movie.title;
  }

  if (description) {
    description.textContent =
      movie.description || "Discover this title on CINEVA.";
  }

  if (meta) {
    meta.textContent =
      `${movie.genre || "FEATURED"} • ${movie.year || "CINEVA"}`;
  }

  if (backdrop) {
    backdrop.style.backgroundImage = `
      linear-gradient(90deg,#080910 0%,rgba(8,9,16,.85) 32%,rgba(8,9,16,.2) 75%),
      linear-gradient(0deg,#080910 0%,transparent 35%),
      url("${movie.backdrop_url || movie.poster_url || placeholderPoster}")
    `;
  }

  if (watch) {
    watch.href =
      `watch.html?id=${encodeURIComponent(movie.id)}`;
  }
}

/* 8. ALL CONTENT AND FILTERS */

function displayAllContent() {

  let filtered = [...allTitles];

  if (activeFilter !== "All") {
    filtered = filtered.filter(movie =>
      movie.type?.toLowerCase() === activeFilter.toLowerCase()
    );
  }

  if (showingMyList) {
    const saved = getMyList().map(String);

    filtered = filtered.filter(movie =>
      saved.includes(String(movie.id))
    );
  }

  if (searchTerm) {
    filtered = filtered.filter(movie =>
      movie.title?.toLowerCase().includes(searchTerm) ||
      movie.genre?.toLowerCase().includes(searchTerm) ||
      movie.description?.toLowerCase().includes(searchTerm)
    );
  }

  renderGrid("allGrid", filtered);

  const status = $("filterStatus");

  if (status) {
    status.textContent =
      `${filtered.length} title(s) found`;
  }
}

/* 9. GENRE FILTER */

function filterByGenre(genre) {

  searchTerm = "";
  showingMyList = false;
  activeFilter = "All";

  const search = $("searchInput");

  if (search) search.value = "";

  document.querySelectorAll(".filter-chip").forEach(button => {
    button.classList.remove("selected");
  });

  const allButton = document.querySelector(
    '.filter-chip[data-filter="All"]'
  );

  if (allButton) {
    allButton.classList.add("selected");
  }

  const results = allTitles.filter(movie =>
    movie.genre?.toLowerCase() === genre.toLowerCase()
  );

  renderGrid("allGrid", results);

  const status = $("filterStatus");

  if (status) {
    status.textContent =
      `${results.length} ${genre} title(s)`;
  }

  $("all-content")?.scrollIntoView({
    behavior: "smooth"
  });
}

/* 10. SEARCH */

function initializeSearch() {

  const search = $("searchInput");

  if (!search) return;

  search.addEventListener("input", event => {

    searchTerm = event.target.value
      .trim()
      .toLowerCase();

    showingMyList = false;

    displayAllContent();

    $("all-content")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  });
}

/* 11. FILTER BUTTONS */

function initializeFilters() {

  document.querySelectorAll(".filter-chip").forEach(button => {

    button.addEventListener("click", () => {

      document.querySelectorAll(".filter-chip")
        .forEach(item => item.classList.remove("selected"));

      button.classList.add("selected");

      activeFilter = button.dataset.filter;

      showingMyList = false;

      displayAllContent();

    });

  });

}

/* 12. GENRE BUTTONS */

function initializeGenres() {

  document.querySelectorAll(".genre-tile").forEach(button => {

    button.addEventListener("click", () => {

      filterByGenre(button.dataset.genre);

    });

  });

}

/* 13. MY LIST */

function initializeMyList() {

  const button = $("myListButton");

  if (!button) return;

  button.addEventListener("click", () => {

    showingMyList = !showingMyList;

    activeFilter = "All";
    searchTerm = "";

    const search = $("searchInput");

    if (search) search.value = "";

    document.querySelectorAll(".filter-chip")
      .forEach(item => item.classList.remove("selected"));

    const allButton = document.querySelector(
      '.filter-chip[data-filter="All"]'
    );

    if (allButton) allButton.classList.add("selected");

    displayAllContent();

    $("all-content")?.scrollIntoView({
      behavior: "smooth"
    });

    notify(
      showingMyList
        ? "Showing your saved titles"
        : "Showing all titles"
    );

  });

}

/* 14. MOBILE MENU */

function initializeMobileMenu() {

  const button = $("mobileMenu");
  const nav = $("mainNav");

  if (!button || !nav) return;

  button.addEventListener("click", () => {
    nav.classList.toggle("open");
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
    });
  });

}

/* 15. SUPABASE DATABASE */

async function loadTitles() {

  if (!db) {

    notify("Connect your Supabase project first.");

    const message = `
      <div class="loading-state">
        CINEVA is waiting for its Supabase connection.
        <br><br>
        Add your Supabase URL and publishable key in script.js.
      </div>
    `;

    ["latestGrid", "moviesGrid", "seriesGrid", "allGrid"]
      .forEach(id => {
        if ($(id)) $(id).innerHTML = message;
      });

    return;
  }

  try {

    const { data, error } = await db
      .from("titles")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    allTitles = data || [];

    displayHomepage();

  } catch (error) {

    console.error("CINEVA database error:", error);

    const message = `
      <div class="loading-state">
        Unable to load titles.
        <br><br>
        Check your Supabase connection and database policies.
      </div>
    `;

    ["latestGrid", "moviesGrid", "seriesGrid", "allGrid"]
      .forEach(id => {
        if ($(id)) $(id).innerHTML = message;
      });

  }

}

/* 16. REAL-TIME UPDATES */

function enableRealtime() {

  if (!db) return;

  db.channel("cineva-titles")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "titles"
      },
      () => {
        loadTitles();
      }
    )
    .subscribe();

}

/* 17. NEWSLETTER */

function initializeNewsletter() {

  const form = $("newsletterForm");

  if (!form) return;

  form.addEventListener("submit", event => {

    event.preventDefault();

    notify("Newsletter registration will be available soon.");

    form.reset();

  });

}

/* 18. FOOTER YEAR */

function initializeFooter() {

  const year = $("year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

}

/* 19. START CINEVA */

document.addEventListener("DOMContentLoaded", async () => {

  initializeSearch();

  initializeFilters();

  initializeGenres();

  initializeMyList();

  initializeMobileMenu();

  initializeNewsletter();

  initializeFooter();

  await loadTitles();

  enableRealtime();

});
