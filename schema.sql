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

-- Computers chat started on fleet, so none is left running: deleted when the task ends, a shared app's computer after
-- 7 days (url is its public link), the oldest shared one over 3 per login, and anything a crashed task left after 2 hours.
CREATE TABLE IF NOT EXISTS pods (
  id TEXT PRIMARY KEY,          -- fleet pod id
  login TEXT NOT NULL,
  url TEXT,                     -- public link of the running app, when the task shared it
  created TEXT NOT NULL,
  until TEXT NOT NULL           -- the hourly cron deletes the computer after this
);
CREATE INDEX IF NOT EXISTS pods_until ON pods (until);
CREATE INDEX IF NOT EXISTS pods_login ON pods (login, created);

-- The visitor's GitHub token from sign-in (scope public_repo), sealed with KEY_SECRET, so a task's computer can push and
-- open PRs as them (src/github.js). Replaced on every sign-in, deleted on sign-out.
CREATE TABLE IF NOT EXISTS github_tokens (
  login TEXT PRIMARY KEY,
  token_enc TEXT NOT NULL,
  scope TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- One row per task, for build analytics: what was asked, which AI and computer, what the model did, and how it ended.
-- Read it with: bunx wrangler@4 d1 execute flisk-chat --remote --command "SELECT ..." or GET /api/admin/runs (ADMIN_KEY).
CREATE TABLE IF NOT EXISTS task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL,
  who TEXT NOT NULL,            -- 'anon' or 'user' (never the login)
  task TEXT NOT NULL,           -- first 300 characters
  ai TEXT NOT NULL,             -- the model label
  free INTEGER NOT NULL,
  provider TEXT,
  steps INTEGER NOT NULL,
  errors INTEGER NOT NULL,      -- steps that failed (an error or a non-zero exit code)
  bad_json INTEGER NOT NULL,
  empty INTEGER NOT NULL,
  provider_retries INTEGER NOT NULL,
  big INTEGER NOT NULL,         -- the task looked like a bigger app (CRM, ERP, ...)
  system INTEGER NOT NULL,      -- the "system" action built it
  first_action TEXT,
  shared INTEGER NOT NULL,      -- a live link to the running app was made
  copy INTEGER NOT NULL,        -- a one-file copy was published
  links INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  error TEXT,
  answer TEXT                   -- first 400 characters
);
CREATE INDEX IF NOT EXISTS task_runs_created ON task_runs (created);
