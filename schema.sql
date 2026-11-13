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

-- The AI a person picked for PR reviews. The key is encrypted with the KEY_SECRET Worker secret; one button deletes it.
CREATE TABLE IF NOT EXISTS ai_settings (
  login TEXT PRIMARY KEY,
  ai TEXT NOT NULL,             -- anthropic | openai | openrouter
  model TEXT NOT NULL,
  key_enc TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- Repos where every new pull request is reviewed automatically (switched on with "@flisk-chat auto on"); login = whose AI and limit pay.
CREATE TABLE IF NOT EXISTS auto_repos (
  repo TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- A test run's result is accepted once per computer.
CREATE TABLE IF NOT EXISTS run_done (
  pod TEXT PRIMARY KEY,
  created TEXT NOT NULL
);
