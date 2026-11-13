-- chat on D1. Sites are single HTML files a task made; they expire after 7 days and are served sandboxed.
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,          -- 16 random hex characters: the link is unguessable
  login TEXT NOT NULL,
  html TEXT NOT NULL,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sites_login ON sites (login, created);

-- Videos a task made: the mp4 as base64 parts (one D1 row holds at most 2 MB), 7 days, the newest 5 per login.
CREATE TABLE IF NOT EXISTS videos (
  id TEXT NOT NULL,             -- 16 random hex characters: the link is unguessable
  part INTEGER NOT NULL,
  login TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (id, part)
);
CREATE INDEX IF NOT EXISTS videos_login ON videos (login, created);
