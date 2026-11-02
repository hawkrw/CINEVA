
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


/* =========================================
   CINEVA — PREMIUM STREAMING PLATFORM
   Movies + Series + Supabase
========================================= */

/* 2. GLOBAL VARIABLES */

let allTitles = [];
let activeFilter = "All";
let searchTerm = "";
let showingMyList = false;
let realtimeChannel = null;

const $ = id => document.getElementById(id);

const placeholderPoster =
  "https://placehold.co/600x900/11121c/ed3f91?text=CINEVA";

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

function safeMediaURL(value) {
  if (!value) return placeholderPoster;

  try {
    const url = new URL(value);

    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch (error) {
    console.warn("Invalid media URL:", value);
  }

  return placeholderPoster;
}

function notify(message) {
  const toast = $("toast");

  if (!toast) {
    console.log(message);
    return;
  }

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

function getGenreText(genre) {
  if (Array.isArray(genre)) {
    return genre.join(", ");
  }

  return genre || "Entertainment";
}

function genreMatches(item, genre) {
  const genres = getGenreText(item.genre)
    .toLowerCase()
    .split(",")
    .map(value => value.trim());

  return genres.includes(genre.toLowerCase());
}

/* 4. NORMALIZE SUPABASE CONTENT */

function normalizeContent(row, type) {
  return {
    id: row.id,
    type: type,

    title: row.title || "Untitled",

    description: row.description || "",
    tagline: row.tagline || "",

    genre: getGenreText(row.genre),

    year: row.year ||
      (row.release_date || row.first_air_date || "")
        .toString()
        .slice(0, 4),

    rating: Number(row.rating || 0),

    vote_count: row.vote_count || 0,

    poster_url: row.poster_url || "",
    backdrop_url: row.backdrop_url || "",
    trailer_url: row.trailer_url || "",

    featured: row.featured === true,

    published: row.published === true,

    created_at: row.created_at || "",

    original_language: row.original_language || "",

    duration: row.duration || null,

    slug: row.slug || "",

    tmdb_id: row.tmdb_id || null
  };
}

/* 5. MOVIE CARD DESIGN */

function createMovieCard(movie) {
  const poster = safeMediaURL(movie.poster_url);

  const watchURL =
    `watch.html?type=${encodeURIComponent(movie.type.toLowerCase())}` +
    `&id=${encodeURIComponent(movie.id)}`;

  const badge = movie.featured
    ? '<span class="poster-badge">FEATURED</span>'
    : '<span class="poster-badge">CINEVA</span>';

  return `
    <article class="movie-card">

      <a href="${escapeHTML(watchURL)}">

        <div class="poster-wrap">

          <img
            src="${escapeHTML(poster)}"
            alt="${escapeHTML(movie.title)} poster"
            loading="lazy"
            onerror="this.onerror=null;this.src='${placeholderPoster}'"
          >

          ${badge}

          <span class="poster-type">
            ${escapeHTML(movie.type)}
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
        ${escapeHTML(movie.genre)}
        ${movie.rating
          ? ` &nbsp; • &nbsp; ★ ${escapeHTML(movie.rating)}`
          : ""}
      </p>

    </article>
  `;
}

/* 6. DISPLAY CONTENT GRIDS */

function renderGrid(elementId, items) {
  const container = $(elementId);

  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="loading-state">
        No published content available yet.
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map(createMovieCard)
    .join("");
}

/* 7. HOMEPAGE CONTENT */

function displayHomepage() {
  const latest = [...allTitles].sort((a, b) =>
    new Date(b.created_at || 0) -
    new Date(a.created_at || 0)
  );

  const movies = latest.filter(item =>
    item.type === "Movie"
  );

  const series = latest.filter(item =>
    item.type === "Series"
  );

  const featured = latest.find(item =>
    item.featured
  );

  renderGrid("latestGrid", latest.slice(0, 10));

  renderGrid("moviesGrid", movies.slice(0, 10));

  renderGrid("seriesGrid", series.slice(0, 10));

  updateHero(featured || latest[0]);

  displayAllContent();
}

/* 8. FEATURED HERO */

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
      `${movie.type} • ${movie.genre} • ${movie.year || "CINEVA"}`;
  }

  if (backdrop) {
    const image = safeMediaURL(
      movie.backdrop_url || movie.poster_url
    );

    backdrop.style.backgroundImage = `
      linear-gradient(90deg,#080910 0%,rgba(8,9,16,.85) 32%,rgba(8,9,16,.2) 75%),
      linear-gradient(0deg,#080910 0%,transparent 35%),
      url("${image}")
    `;
  }

  if (watch) {
    watch.href =
      `watch.html?type=${encodeURIComponent(movie.type.toLowerCase())}` +
      `&id=${encodeURIComponent(movie.id)}`;
  }
}

/* 9. SEARCH AND CONTENT FILTERS */

function displayAllContent() {
  let filtered = [...allTitles];

  if (activeFilter !== "All") {
    filtered = filtered.filter(item =>
      item.type.toLowerCase() === activeFilter.toLowerCase()
    );
  }

  if (showingMyList) {
    const saved = getMyList().map(String);

    filtered = filtered.filter(item =>
      saved.includes(String(item.id)) ||
      saved.includes(`${item.type.toLowerCase()}:${item.id}`)
    );
  }

  if (searchTerm) {
    filtered = filtered.filter(item =>
      item.title.toLowerCase().includes(searchTerm) ||
      item.genre.toLowerCase().includes(searchTerm) ||
      item.description.toLowerCase().includes(searchTerm)
    );
  }

  renderGrid("allGrid", filtered);

  const status = $("filterStatus");

  if (status) {
    status.textContent =
      `${filtered.length} title(s) found`;
  }
}

/* 10. GENRE FILTER */

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

  const results = allTitles.filter(item =>
    genreMatches(item, genre)
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

/* 11. SEARCH */

function initializeSearch() {
  const search = $("searchInput");

  if (!search) return;

  search.addEventListener("input", event => {
    searchTerm = event.target.value
      .trim()
      .toLowerCase();

    showingMyList = false;

    displayAllContent();
  });
}

/* 12. FILTER BUTTONS */

function initializeFilters() {
  document.querySelectorAll(".filter-chip").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip")
        .forEach(item => item.classList.remove("selected"));

      button.classList.add("selected");

      activeFilter = button.dataset.filter || "All";

      showingMyList = false;

      displayAllContent();
    });
  });
}

/* 13. GENRE BUTTONS */

function initializeGenres() {
  document.querySelectorAll(".genre-tile").forEach(button => {
    button.addEventListener("click", () => {
      filterByGenre(button.dataset.genre);
    });
  });
}

/* 14. MY LIST */

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

    if (allButton) {
      allButton.classList.add("selected");
    }

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

/* 15. MOBILE MENU */

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

/* 16. LOAD MOVIES FROM SUPABASE */

async function fetchMovies() {
  const { data, error } = await db
    .from("movies")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map(item =>
    normalizeContent(item, "Movie")
  );
}

/* 17. LOAD SERIES FROM SUPABASE */

async function fetchSeries() {
  const { data, error } = await db
    .from("series")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map(item =>
    normalizeContent(item, "Series")
  );
}

/* 18. LOAD ALL PUBLISHED CONTENT */

async function loadTitles() {
  if (!db) {
    notify("Supabase connection is missing.");
    return;
  }

  const grids = [
    "latestGrid",
    "moviesGrid",
    "seriesGrid",
    "allGrid"
  ];

  grids.forEach(id => {
    if ($(id)) {
      $(id).innerHTML = `
        <div class="loading-state">
          Loading CINEVA content...
        </div>
      `;
    }
  });

  try {
    const [moviesResult, seriesResult] =
      await Promise.allSettled([
        fetchMovies(),
        fetchSeries()
      ]);

    const movies =
      moviesResult.status === "fulfilled"
        ? moviesResult.value
        : [];

    const series =
      seriesResult.status === "fulfilled"
        ? seriesResult.value
        : [];

    if (moviesResult.status === "rejected") {
      console.error(
        "CINEVA movies loading error:",
        moviesResult.reason
      );
    }

    if (seriesResult.status === "rejected") {
      console.error(
        "CINEVA series loading error:",
        seriesResult.reason
      );
    }

    allTitles = [...movies, ...series];

    displayHomepage();

    if (!allTitles.length) {
      notify("No published movies or series found.");
    }

  } catch (error) {
    console.error("CINEVA database error:", error);

    grids.forEach(id => {
      if ($(id)) {
        $(id).innerHTML = `
          <div class="loading-state">
            Unable to load CINEVA content.
            Please check your Supabase database and policies.
          </div>
        `;
      }
    });

    notify("Could not load content.");
  }
}

/* 19. REAL-TIME DATABASE UPDATES */

function enableRealtime() {
  if (!db) return;

  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
  }

  realtimeChannel = db
    .channel("cineva-content-updates")

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "movies"
      },
      () => loadTitles()
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "series"
      },
      () => loadTitles()
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "movie_parts"
      },
      () => loadTitles()
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "episodes"
      },
      () => loadTitles()
    )

    .subscribe(status => {
      console.log("CINEVA realtime status:", status);
    });
}

/* 20. NEWSLETTER */

function initializeNewsletter() {
  const form = $("newsletterForm");

  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    notify("Newsletter registration coming soon.");

    form.reset();
  });
}

/* 21. FOOTER YEAR */

function initializeFooter() {
  const year = $("year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }
}

/* 22. START CINEVA */

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


  enableRealtime();

});
