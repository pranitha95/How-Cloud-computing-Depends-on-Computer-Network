import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.join(__dirname, "..", "data");
export const uploadDir = path.join(dataDir, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "lab.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS network_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  stored_name TEXT NOT NULL,
  delay_ms INTEGER NOT NULL,
  transfer_ms INTEGER NOT NULL,
  retries INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS db_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replica_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  lag_ms INTEGER NOT NULL,
  synced_at TEXT NOT NULL,
  FOREIGN KEY (record_id) REFERENCES db_records(id)
);

CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  latency_ms REAL NOT NULL,
  loss_pct REAL NOT NULL,
  bandwidth_kbps REAL NOT NULL,
  health INTEGER NOT NULL,
  replica_lag_ms REAL NOT NULL,
  video_quality TEXT,
  goodput_kbps REAL
);

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS experiment_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  latency_ms REAL NOT NULL,
  loss_pct REAL NOT NULL,
  bandwidth_kbps REAL NOT NULL,
  health INTEGER NOT NULL,
  replica_lag_ms REAL NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS challenge_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  details TEXT
);

CREATE TABLE IF NOT EXISTS commentary_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  tone TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL
);
`);

const now = () => new Date().toISOString();

export const sql = {
  now,
  getState: db.prepare("SELECT payload FROM network_state WHERE id = 1"),
  putState: db.prepare(
    "INSERT INTO network_state (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
  ),
  listPresets: db.prepare("SELECT id, name, payload, created_at FROM presets ORDER BY id DESC"),
  getPreset: db.prepare("SELECT id, name, payload, created_at FROM presets WHERE id = ?"),
  addPreset: db.prepare("INSERT INTO presets (name, payload, created_at) VALUES (?, ?, ?)"),
  deletePreset: db.prepare("DELETE FROM presets WHERE id = ?"),
  addObject: db.prepare(
    "INSERT INTO cloud_objects (filename, size, stored_name, delay_ms, transfer_ms, retries, ok, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  listObjects: db.prepare("SELECT * FROM cloud_objects ORDER BY id DESC LIMIT 40"),
  getObject: db.prepare("SELECT * FROM cloud_objects WHERE id = ?"),
  deleteObject: db.prepare("DELETE FROM cloud_objects WHERE id = ?"),
  addRecord: db.prepare("INSERT INTO db_records (body, created_at) VALUES (?, ?)"),
  listRecords: db.prepare("SELECT * FROM db_records ORDER BY id DESC LIMIT 40"),
  addReplica: db.prepare("INSERT INTO replica_records (record_id, body, lag_ms, synced_at) VALUES (?, ?, ?, ?)"),
  replicaCount: db.prepare("SELECT COUNT(*) AS c FROM replica_records"),
  primaryCount: db.prepare("SELECT COUNT(*) AS c FROM db_records"),
  latestReplica: db.prepare("SELECT * FROM replica_records ORDER BY id DESC LIMIT 1"),
  deleteRecord: db.prepare("DELETE FROM db_records WHERE id = ?"),
  deleteReplicaByRecord: db.prepare("DELETE FROM replica_records WHERE record_id = ?"),
  getRecord: db.prepare("SELECT * FROM db_records WHERE id = ?"),
  replicaByRecord: db.prepare("SELECT * FROM replica_records WHERE record_id = ? ORDER BY id DESC LIMIT 1"),
  addTelemetry: db.prepare(
    "INSERT INTO telemetry (ts, latency_ms, loss_pct, bandwidth_kbps, health, replica_lag_ms, video_quality, goodput_kbps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  listTelemetry: db.prepare("SELECT * FROM telemetry ORDER BY id DESC LIMIT 120"),
  addExperiment: db.prepare("INSERT INTO experiments (title, notes, started_at) VALUES (?, ?, ?)"),
  getExperiment: db.prepare("SELECT * FROM experiments WHERE id = ?"),
  listExperiments: db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM experiment_samples s WHERE s.experiment_id = e.id) AS sample_count
    FROM experiments e
    ORDER BY id DESC
  `),
  endExperiment: db.prepare("UPDATE experiments SET ended_at = ?, summary = ? WHERE id = ?"),
  updateExperiment: db.prepare("UPDATE experiments SET title = ?, notes = ? WHERE id = ?"),
  deleteExperiment: db.prepare("DELETE FROM experiments WHERE id = ?"),
  addSample: db.prepare(
    "INSERT INTO experiment_samples (experiment_id, ts, latency_ms, loss_pct, bandwidth_kbps, health, replica_lag_ms) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  listSamples: db.prepare("SELECT * FROM experiment_samples WHERE experiment_id = ? ORDER BY id ASC"),
  addChallenge: db.prepare("INSERT INTO challenge_runs (challenge_id, started_at, success, details) VALUES (?, ?, 0, ?)"),
  completeChallenge: db.prepare("UPDATE challenge_runs SET completed_at = ?, success = ?, details = ? WHERE id = ?"),
  getChallenge: db.prepare("SELECT * FROM challenge_runs WHERE id = ?"),
  listChallenges: db.prepare("SELECT * FROM challenge_runs ORDER BY id DESC LIMIT 50"),
  addComment: db.prepare("INSERT INTO commentary_log (ts, tone, title, body) VALUES (?, ?, ?, ?)"),
  listComments: db.prepare("SELECT * FROM commentary_log ORDER BY id DESC LIMIT 30"),
};
