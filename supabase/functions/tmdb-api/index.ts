
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// CINEVA TMDB API
// One-time import into Supabase
// ==========================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TMDB_TOKEN = Deno.env.get("TMDB_READ_ACCESS_TOKEN")!;

const POSTER_BUCKET = "cineva-posters";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (data: unknown, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
};

// ==========================================
// TMDB REQUEST
// ==========================================

async function tmdbRequest(endpoint: string) {
  const response = await fetch(
    `https://api.themoviedb.org/3${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${TMDB_TOKEN}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return await response.json();
}

// ==========================================
// DOWNLOAD AND STORE TMDB ARTWORK
// ==========================================

async function saveArtwork(
  imagePath: string | null,
  folder: string,
  filename: string,
  width: string
): Promise<string | null> {
  if (!imagePath) return null;

  const imageUrl =
    `https://image.tmdb.org/t/p/${width}${imagePath}`;

  const response = await fetch(imageUrl);

  if (!response.ok) {
    console.error("Artwork download failed:", imagePath);
    return null;
  }

  const imageBlob = await response.blob();

  const storagePath = `${folder}/${filename}.jpg`;

  const { error } = await supabaseAdmin.storage
    .from(POSTER_BUCKET)
    .upload(storagePath, imageBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    throw new Error(`Artwork upload failed: ${error.message}`);
  }

  const { data } = supabaseAdmin.storage
    .from(POSTER_BUCKET)
    .getPublicUrl(storagePath);

  return data.publicUrl;
}

// ==========================================
// SUPABASE ADMIN CLIENT
// ==========================================

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY
);

// ==========================================
// MAIN FUNCTION
// ==========================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Only POST requests are allowed." },
      405
    );
  }

  try {
    // --------------------------------------
    // 1. CHECK ADMIN AUTHENTICATION
    // --------------------------------------

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Authentication required." },
        401
      );
    }

    const supabaseUser = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return jsonResponse(
        { error: "Invalid login session." },
        401
      );
    }

    if (user.app_metadata?.role !== "admin") {
      return jsonResponse(
        { error: "Admin permission required." },
        403
      );
    }

    // --------------------------------------
    // 2. READ REQUEST
    // --------------------------------------

    const body = await req.json();

    const action = body.action;
    const mediaType = body.mediaType || "movie";

    if (!["movie", "tv"].includes(mediaType)) {
      return jsonResponse(
        { error: "Media type must be movie or tv." },
        400
      );
    }

    // --------------------------------------
    // 3. SEARCH TMDB
    // --------------------------------------

    if (action === "search") {
      const query = String(body.query || "").trim();

      if (!query) {
        return jsonResponse(
          { error: "Enter a movie or series name." },
          400
        );
      }

      const results = await tmdbRequest(
        `/search/${mediaType}?query=${encodeURIComponent(query)}&include_adult=false`
      );

      return jsonResponse({
        success: true,
        results: (results.results || []).map((item: any) => ({
          id: item.id,
          mediaType,
          title: item.title || item.name,
          overview: item.overview,
          releaseDate:
            item.release_date || item.first_air_date,
          rating: item.vote_average,
          poster: item.poster_path
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
            : null,
          backdrop: item.backdrop_path
            ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
            : null,
        })),
      });
    }

    // --------------------------------------
    // 4. IMPORT CONTENT
    // --------------------------------------

    if (action === "import") {
      const tmdbId = Number(body.tmdbId);

      if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
        return jsonResponse(
          { error: "A valid TMDB ID is required." },
          400
        );
      }

      // Prevent duplicate imports.
      const { data: existing, error: lookupError } =
        await supabaseAdmin
          .from("titles")
          .select("id, title")
          .eq("tmdb_id", tmdbId)
          .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        return jsonResponse({
          success: false,
          alreadyImported: true,
          message: "This title has already been imported.",
          existing,
        }, 409);
      }

      // Fetch complete TMDB details.
      const details = await tmdbRequest(
        `/${mediaType}/${tmdbId}?append_to_response=videos`
      );

      const title = details.title || details.name;

      if (!title) {
        return jsonResponse(
          { error: "TMDB did not return a valid title." },
          404
        );
      }

      // ------------------------------------
      // Extract metadata
      // ------------------------------------

      const releaseDate =
        details.release_date || details.first_air_date || null;

      const year = releaseDate
        ? Number(releaseDate.substring(0, 4))
        : null;

      const genres = (details.genres || [])
        .map((genre: any) => genre.name)
        .join(", ");

      const rating = Number(details.vote_average || 0);

      const voteCount = Number(details.vote_count || 0);

      const duration = details.runtime
        ? `${details.runtime} min`
        : details.episode_run_time?.length
          ? `${details.episode_run_time[0]} min/episode`
          : null;

      const trailer = (details.videos?.results || []).find(
        (video: any) =>
          video.site === "YouTube" &&
          video.type === "Trailer" &&
          video.official === true
      ) || (details.videos?.results || []).find(
        (video: any) =>
          video.site === "YouTube" &&
          video.type === "Trailer"
      );

      const trailerUrl = trailer?.key
        ? `https://www.youtube.com/watch?v=${trailer.key}`
        : null;

      // ------------------------------------
      // Download artwork into Supabase
      // ------------------------------------

      const folder = `tmdb/${mediaType}/${tmdbId}`;

      const posterUrl = await saveArtwork(
        details.poster_path,
        folder,
        "poster",
        "w500"
      );

      const backdropUrl = await saveArtwork(
        details.backdrop_path,
        folder,
        "backdrop",
        "w1280"
      );

      // ------------------------------------
      // Save metadata permanently
      // ------------------------------------

      const { data: savedTitle, error: insertError } =
        await supabaseAdmin
          .from("titles")
          .insert({
            title,
            type: mediaType === "movie" ? "Movie" : "Series",
            genre: genres,
            year,
            rating,
            vote_count: voteCount,
            duration,
            description: details.overview || "",
            tagline: details.tagline || null,
            original_language:
              details.original_language || null,
            poster_url: posterUrl,
            backdrop_url: backdropUrl,
            trailer_url: trailerUrl,
            tmdb_id: tmdbId,
            tmdb_media_type: mediaType,
            video_url: null,
            featured: false,
            published: false,
          })
          .select()
          .single();

      if (insertError) throw insertError;

      return jsonResponse({
        success: true,
        message: "Content imported successfully into CINEVA.",
        title: savedTitle,
        artwork: {
          poster: posterUrl,
          backdrop: backdropUrl,
        },
        nextStep:
          "Upload the actual video file and publish this content from the CINEVA admin dashboard.",
      });
    }

    return jsonResponse(
      { error: "Unknown action. Use search or import." },
      400
    );

  } catch (error) {
    console.error("CINEVA TMDB error:", error);

    return jsonResponse(
      {
        error: "TMDB operation failed.",
        details: error instanceof Error
          ? error.message
          : "Unknown error",
      },
      500
    );
  }
});
