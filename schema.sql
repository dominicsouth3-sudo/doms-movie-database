CREATE TABLE IF NOT EXISTS titles (
    id SERIAL PRIMARY KEY,
    tmdb_id INTEGER UNIQUE,
    title VARCHAR(500) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('movie', 'tv')),
    release_year INTEGER,
    description TEXT,
    poster_url TEXT,
    backdrop_url TEXT,
    watched BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rating (
    id SERIAL PRIMARY KEY,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 10),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS titles_type_index ON titles(type);
CREATE INDEX IF NOT EXISTS titles_tmdb_id_index ON titles(tmdb_id);
CREATE INDEX IF NOT EXISTS comments_title_id_index ON comments(title_id);
ALTER TABLE titles
ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;

ALTER TABLE titles
ADD COLUMN IF NOT EXISTS backdrop_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS titles_tmdb_type_unique
ON titles (tmdb_id, type)
WHERE tmdb_id IS NOT NULL;