require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const pool = require("./db");

const app = express();
const port = process.env.PORT || 3000;

const DEFAULT_IMPORT_AMOUNT = 8000;
const MAX_IMPORT_AMOUNT = 10000;
const TMDB_MAX_PAGES = 500;

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: [
                    "'self'",
                    "https://image.tmdb.org",
                    "https://i.ytimg.com",
                    "data:"
                ],
                frameSrc: [
                    "'self'",
                    "https://www.youtube.com",
                    "https://www.youtube-nocookie.com"
                ],
                connectSrc: ["'self'"]
            }
        }
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function getTmdbHeaders() {
    if (!process.env.TMDB_ACCESS_TOKEN) {
        throw new Error("TMDB_ACCESS_TOKEN is missing from your .env file.");
    }

    return {
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
        accept: "application/json"
    };
}

async function fetchTmdb(endpoint) {
    const response = await fetch(`https://api.themoviedb.org/3${endpoint}`, {
        headers: getTmdbHeaders()
    });

    if (!response.ok) {
        throw new Error(`TMDB returned ${response.status}`);
    }

    return response.json();
}

function getTitleData(item, type) {
    const date = type === "movie" ? item.release_date : item.first_air_date;
    const title = type === "movie" ? item.title : item.name;

    return {
        tmdbId: item.id,
        title,
        type,
        releaseYear: date ? Number.parseInt(date.substring(0, 4), 10) : null,
        description: item.overview || "",
        posterUrl: item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : null,
        backdropUrl: item.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
            : null
    };
}

app.get("/api/test", (req, res) => {
    res.json({ message: "Movie Database API is working!" });
});

app.get("/api/titles", async (req, res) => {
    try {
        const type = req.query.type;
        const search = req.query.q || "";

        const values = [];
        const filters = [];

        if (type === "movie" || type === "tv") {
            values.push(type);
            filters.push(`titles.type = $${values.length}`);
        }

        if (search.trim()) {
            values.push(`%${search.trim()}%`);
            filters.push(`titles.title ILIKE $${values.length}`);
        }

        const whereClause =
            filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

        const result = await pool.query(`
            SELECT
                titles.*,
                COALESCE(AVG(rating.rating), 0) AS average_rating
            FROM titles
            LEFT JOIN rating ON titles.id = rating.title_id
            ${whereClause}
            GROUP BY titles.id
            ORDER BY titles.title ASC
        `, values);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching titles:", error);
        res.status(500).json({ error: "Could not load titles." });
    }
});

app.get("/api/titles/:id", async (req, res) => {
    try {
        const result = await pool.query(
            `
                SELECT
                    titles.*,
                    COALESCE(AVG(rating.rating), 0) AS average_rating
                FROM titles
                LEFT JOIN rating ON titles.id = rating.title_id
                WHERE titles.id = $1
                GROUP BY titles.id
            `,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Title not found." });
        }

        const title = result.rows[0];
        let videos = [];

        if (title.tmdb_id) {
            try {
                const tmdbType = title.type === "movie" ? "movie" : "tv";
                const videoData = await fetchTmdb(
                    `/${tmdbType}/${title.tmdb_id}/videos`
                );

                videos = (videoData.results || [])
                    .filter((video) => video.site === "YouTube")
                    .filter((video) =>
                        [
                            "Trailer",
                            "Teaser",
                            "Featurette",
                            "Behind the Scenes",
                            "Clip"
                        ].includes(video.type)
                    )
                    .map((video) => ({
                        name: video.name,
                        type: video.type,
                        official: video.official,
                        publishedAt: video.published_at,
                        youtubeKey: video.key,
                        embedUrl: `https://www.youtube-nocookie.com/embed/${video.key}`
                    }));
            } catch (videoError) {
                console.error("Could not load TMDB videos:", videoError.message);
            }
        }

        res.json({
            ...title,
            videos
        });
    } catch (error) {
        console.error("Error fetching title details:", error);
        res.status(500).json({ error: "Could not load title details." });
    }
});

app.get("/api/search", async (req, res) => {
    try {
        const search = req.query.q || "";

        const result = await pool.query(
            `
                SELECT
                    titles.*,
                    COALESCE(AVG(rating.rating), 0) AS average_rating
                FROM titles
                LEFT JOIN rating ON titles.id = rating.title_id
                WHERE titles.title ILIKE $1
                GROUP BY titles.id
                ORDER BY titles.title ASC
            `,
            [`%${search}%`]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error searching titles:", error);
        res.status(500).json({ error: "Could not search titles." });
    }
});

app.post("/api/titles/:id/rating", async (req, res) => {
    const ratingValue = Number(req.body.rating);

    if (!Number.isInteger(ratingValue) || ratingValue < 0 || ratingValue > 10) {
        return res.status(400).json({
            error: "Rating must be a whole number from 0 to 10."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query("DELETE FROM rating WHERE title_id = $1", [
            req.params.id
        ]);

        await client.query(
            "INSERT INTO rating (title_id, rating) VALUES ($1, $2)",
            [req.params.id, ratingValue]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            rating: ratingValue
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error saving rating:", error);
        res.status(500).json({ error: "Could not save rating." });
    } finally {
        client.release();
    }
});

app.patch("/api/titles/:id/watched", async (req, res) => {
    try {
        const { watched } = req.body;

        if (typeof watched !== "boolean") {
            return res.status(400).json({
                error: "watched must be true or false."
            });
        }

        const result = await pool.query(
            `
                UPDATE titles
                SET watched = $1
                WHERE id = $2
                RETURNING id, title, watched
            `,
            [watched, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Title not found." });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating watched status:", error);
        res.status(500).json({ error: "Could not update watched status." });
    }
});

app.get("/api/titles/:id/comments", async (req, res) => {
    try {
        const result = await pool.query(
            `
                SELECT id, display_name, comment, created_at
                FROM comments
                WHERE title_id = $1
                ORDER BY created_at DESC
            `,
            [req.params.id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).json({ error: "Could not load comments." });
    }
});

app.post("/api/titles/:id/comments", async (req, res) => {
    try {
        const displayName = String(req.body.displayName || "").trim();
        const comment = String(req.body.comment || "").trim();

        if (displayName.length < 2 || displayName.length > 50) {
            return res.status(400).json({
                error: "Your name must be between 2 and 50 characters."
            });
        }

        if (comment.length < 1 || comment.length > 1000) {
            return res.status(400).json({
                error: "A comment must be between 1 and 1,000 characters."
            });
        }

        const titleExists = await pool.query(
            "SELECT id FROM titles WHERE id = $1",
            [req.params.id]
        );

        if (titleExists.rows.length === 0) {
            return res.status(404).json({ error: "Title not found." });
        }

        const result = await pool.query(
            `
                INSERT INTO comments (title_id, display_name, comment)
                VALUES ($1, $2, $3)
                RETURNING id, display_name, comment, created_at
            `,
            [req.params.id, displayName, comment]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error saving comment:", error);
        res.status(500).json({ error: "Could not save comment." });
    }
});

app.get("/api/tmdb-test", async (req, res) => {
    try {
        const data = await fetchTmdb("/search/movie?query=Batman");
        res.json(data);
    } catch (error) {
        console.error("TMDB connection error:", error);
        res.status(500).json({ error: "TMDB connection failed." });
    }
});

app.post("/api/tmdb-import", async (req, res) => {
    try {
        const requestedAmount = Number(req.body.amount || DEFAULT_IMPORT_AMOUNT);
        const importAmount = Math.min(
            Math.max(Number.isInteger(requestedAmount) ? requestedAmount : DEFAULT_IMPORT_AMOUNT, 1),
            MAX_IMPORT_AMOUNT
        );

        const importType = async (type, needed) => {
            let added = 0;
            let skipped = 0;
            let page = 1;

            while (added < needed && page <= TMDB_MAX_PAGES) {
                const endpoint =
                    type === "movie"
                        ? `/discover/movie?sort_by=popularity.desc&page=${page}`
                        : `/discover/tv?sort_by=popularity.desc&page=${page}`;

                const data = await fetchTmdb(endpoint);
                const items = data.results || [];

                if (items.length === 0) {
                    break;
                }

                for (const item of items) {
                    if (added >= needed) {
                        break;
                    }

                    const titleData = getTitleData(item, type);

                    if (!titleData.title || !titleData.tmdbId) {
                        skipped++;
                        continue;
                    }

                    const existing = await pool.query(
                        `
                            SELECT id
                            FROM titles
                            WHERE tmdb_id = $1 AND type = $2
                            LIMIT 1
                        `,
                        [titleData.tmdbId, type]
                    );

                    if (existing.rows.length > 0) {
                        skipped++;
                        continue;
                    }

                    await pool.query(
                        `
                            INSERT INTO titles (
                                tmdb_id,
                                title,
                                type,
                                release_year,
                                description,
                                poster_url,
                                backdrop_url,
                                watched
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, false)
                        `,
                        [
                            titleData.tmdbId,
                            titleData.title,
                            titleData.type,
                            titleData.releaseYear,
                            titleData.description,
                            titleData.posterUrl,
                            titleData.backdropUrl
                        ]
                    );

                    added++;
                }

                page++;
            }

            return {
                added,
                skipped,
                pagesChecked: page - 1
            };
        };

        const movies = await importType("movie", importAmount);
        const tvShows = await importType("tv", importAmount);

        const totals = await pool.query(`
            SELECT type, COUNT(*) AS total
            FROM titles
            GROUP BY type
            ORDER BY type
        `);

        res.json({
            success: true,
            requested: {
                movies: importAmount,
                tvShows: importAmount
            },
            movies,
            tvShows,
            totals: totals.rows
        });
    } catch (error) {
        console.error("TMDB import error:", error);
        res.status(500).json({
            error: "TMDB import failed.",
            details: error.message
        });
    }
});

const server = app.listen(port, () => {
    console.log(`Movie Database running at http://localhost:${port}`);
});

server.requestTimeout = 0;