-- chat on D1. Sites are single HTML files a task made; they expire after 7 days and are served sandboxed.
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,          -- 16 random hex characters: the link is unguessable
  login TEXT NOT NULL,
  html TEXT NOT NULL,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sites_login ON sites (login, created);
