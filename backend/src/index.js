import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import multer from "multer";
import { WebSocketServer } from "ws";
import { db, sql, uploadDir } from "./db.js";
import {
  PRESETS,
  LINKS,
  defaultState,
  clampProfile,
  shapeRequest,
  handshakeTimeline,
  simulateRequestFlow,
  videoLadder,
  pickQuality,
  healthBreakdown,
  explain,
  pathOpen,
  sampleDelay,
  transferMs,
  sleep,
} from "./network.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${file.originalname}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

let profile = defaultState();
const row = sql.getState.get();
if (row?.payload) {
  try {
    profile = { ...defaultState(), ...clampProfile(JSON.parse(row.payload)) };
  } catch {
    profile = defaultState();
  }
} else {
  persist();
}

let replicaLagMs = 0;
let lastGoodputKbps = 20000;
let lastVideoQuality = "1080p";
let replicaQueue = [];
let lastCommentKey = "";
let chaosTimer = null;

function persist() {
  sql.putState.run(JSON.stringify(profile), sql.now());
}

function snapshotHealth() {
  return healthBreakdown(profile, { replicaLagMs });
}

function commentary() {
  return explain(profile, { replicaLagMs, via: lastVideoQuality });
}

function maybeLogComment(c) {
  const key = `${c.tone}:${c.title}`;
  if (key === lastCommentKey) return;
  lastCommentKey = key;
  sql.addComment.run(sql.now(), c.tone, c.title, c.body);
}

function publicState() {
  const health = snapshotHealth();
  const comment = commentary();
  maybeLogComment(comment);
  const origin = pathOpen(profile, "api");
  const video = pathOpen(profile, "video");
  const replica = pathOpen(profile, "replica");
  lastVideoQuality = video.ok ? pickQuality(lastGoodputKbps, 3).id : "offline";
  return {
    network: profile,
    links: LINKS,
    health,
    commentary: comment,
    replicaLagMs: Math.round(replicaLagMs),
    lastGoodputKbps: Math.round(lastGoodputKbps),
    lastVideoQuality,
    originUp: origin.ok,
    videoUp: video.ok,
    replicaUp: replica.ok,
    activeRoute: origin.via || (origin.ok ? "origin" : "none"),
    handshake: handshakeTimeline(profile),
    videoLadder: videoLadder(),
    presets: PRESETS,
    replicaPending: replicaQueue.length,
  };
}

// ----------------------------------------------------
// NETWORK APIS
// ----------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json(publicState());
});

app.get("/api/network", (_req, res) => {
  res.json(publicState());
});

app.put("/api/network", (req, res) => {
  const next = clampProfile({ ...profile, ...req.body });
  profile = { ...profile, ...next };
  persist();
  broadcast();
  res.json(publicState());
});

app.post("/api/network/preset", (req, res) => {
  const key = req.body?.key;
  const named = PRESETS[key];
  if (!named) return res.status(400).json({ error: "Unknown preset key." });
  profile = {
    ...profile,
    ...clampProfile(named),
    cdnEnabled: profile.cdnEnabled,
    replicaEnabled: profile.replicaEnabled,
    secondDcEnabled: profile.secondDcEnabled,
    chaos: false,
  };
  persist();
  broadcast();
  res.json(publicState());
});

app.post("/api/network/reset", (_req, res) => {
  const keep = {
    cdnEnabled: profile.cdnEnabled,
    replicaEnabled: profile.replicaEnabled,
    secondDcEnabled: profile.secondDcEnabled,
  };
  profile = { ...defaultState(), ...keep, chaos: false };
  persist();
  broadcast();
  res.json(publicState());
});

app.post("/api/network/link", (req, res) => {
  const { id, failed } = req.body || {};
  if (!LINKS.some((l) => l.id === id)) return res.status(400).json({ error: "Unknown link." });
  const set = new Set(profile.failedLinks);
  if (failed) set.add(id);
  else set.delete(id);
  profile.failedLinks = [...set];
  persist();
  broadcast();
  res.json(publicState());
});

app.post("/api/network/chaos", (req, res) => {
  const on = Boolean(req.body?.on ?? !profile.chaos);
  profile.chaos = on;
  if (chaosTimer) clearInterval(chaosTimer);
  chaosTimer = null;
  if (on) {
    chaosTimer = setInterval(() => {
      if (!profile.chaos) return;
      profile.latencyMs = 20 + Math.round(Math.random() * 240);
      profile.lossPct = Math.round(Math.random() * 22 * 10) / 10;
      profile.jitterMs = Math.round(Math.random() * 70);
      profile.bandwidthKbps = 400 + Math.round(Math.random() * 18000);
      if (Math.random() < 0.25) {
        const link = LINKS[Math.floor(Math.random() * LINKS.length)].id;
        const set = new Set(profile.failedLinks);
        if (set.has(link)) set.delete(link);
        else set.add(link);
        profile.failedLinks = [...set];
      }
      persist();
      broadcast();
    }, 1800);
    chaosTimer.unref();
  }
  persist();
  broadcast();
  res.json(publicState());
});

app.get("/api/presets", (_req, res) => {
  const rows = sql.listPresets.all().map((p) => ({ ...p, payload: JSON.parse(p.payload) }));
  res.json({ builtIn: PRESETS, custom: rows });
});

app.post("/api/presets", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (name.length < 2) return res.status(400).json({ error: "Preset name must be at least 2 characters." });
  const payload = clampProfile({ ...profile, ...req.body.payload, name });
  const info = sql.addPreset.run(name, JSON.stringify(payload), sql.now());
  res.status(201).json({ id: Number(info.lastInsertRowid), name, payload });
});

app.delete("/api/presets/:id", (req, res) => {
  sql.deletePreset.run(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/presets/:id/apply", (req, res) => {
  const r = sql.getPreset.get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: "Preset not found." });
  const payload = clampProfile(JSON.parse(r.payload));
  profile = { ...profile, ...payload };
  persist();
  broadcast();
  res.json(publicState());
});

// ----------------------------------------------------
// UPLOAD APIS
// ----------------------------------------------------

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const fakeSize = Number(req.body?.syntheticBytes);
    let size = 0;
    let filename = "blob.bin";
    let stored = "";
    if (req.file) {
      size = req.file.size;
      filename = req.file.originalname;
      stored = req.file.filename;
    } else if (fakeSize > 0 && fakeSize <= 8_000_000) {
      size = Math.floor(fakeSize);
      filename = `synthetic-${size}.bin`;
      stored = `${Date.now()}-synthetic.bin`;
      fs.writeFileSync(path.join(uploadDir, stored), Buffer.alloc(Math.min(size, 4096), 7));
    } else {
      return res.status(400).json({ error: "Attach a file or send syntheticBytes." });
    }

    const result = await shapeRequest(profile, { bytes: size, kind: "api", retries: 5 });
    const info = sql.addObject.run(
      filename,
      size,
      stored,
      result.delayMs || 0,
      result.transferMs || 0,
      result.retries || 0,
      result.ok ? 1 : 0,
      result.error || null,
      sql.now()
    );
    if (result.ok) {
      lastGoodputKbps = (size / Math.max((result.totalMs || 1) / 1000, 0.05) / 1024) * 8;
    }
    res.status(result.ok ? 201 : 503).json({
      id: Number(info.lastInsertRowid),
      filename,
      size,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/uploads", (_req, res) => {
  res.json(sql.listObjects.all());
});

app.get("/api/uploads/:id", (req, res) => {
  const rowObj = sql.getObject.get(Number(req.params.id));
  if (!rowObj) return res.status(404).json({ error: "Upload record not found." });
  res.json(rowObj);
});

app.delete("/api/uploads/:id", (req, res) => {
  const rowObj = sql.getObject.get(Number(req.params.id));
  if (!rowObj) return res.status(404).json({ error: "Not found." });
  const fp = path.join(uploadDir, rowObj.stored_name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  sql.deleteObject.run(rowObj.id);
  res.json({ ok: true });
});

// ----------------------------------------------------
// VIDEO STREAMING APIS
// ----------------------------------------------------

app.get("/api/video/manifest", (_req, res) => {
  const pathInfo = pathOpen(profile, "video");
  res.json({
    ok: pathInfo.ok,
    error: pathInfo.reason,
    via: pathInfo.via,
    ladder: videoLadder(),
    suggested: pickQuality(lastGoodputKbps, 3),
  });
});

app.get("/api/video/status", (_req, res) => {
  const pathInfo = pathOpen(profile, "video");
  res.json({
    ok: pathInfo.ok,
    via: pathInfo.via,
    currentQuality: lastVideoQuality,
    goodputKbps: Math.round(lastGoodputKbps),
    ladder: videoLadder(),
    suggested: pickQuality(lastGoodputKbps, 3),
    isStarving: !pathInfo.ok || lastVideoQuality === "offline" || lastVideoQuality === "240p",
    error: pathInfo.reason || null,
  });
});

app.get("/api/video/chunk", async (req, res) => {
  const qualityId = String(req.query.quality || "720p");
  const quality = videoLadder().find((q) => q.id === qualityId) || videoLadder()[1];
  const result = await shapeRequest(profile, { bytes: quality.chunkBytes, kind: "video", retries: 5 });
  if (!result.ok) {
    return res.status(503).json({ error: result.error, ...result, quality: quality.id });
  }
  const secs = Math.max(result.totalMs / 1000, 0.04);
  lastGoodputKbps = (quality.chunkBytes * 8) / secs / 1024;
  lastVideoQuality = quality.id;
  const payload = Buffer.alloc(Math.min(quality.chunkBytes, 64 * 1024), 11);
  res.setHeader("X-Chunk-Quality", quality.id);
  res.setHeader("X-Goodput-Kbps", String(Math.round(lastGoodputKbps)));
  res.setHeader("X-Shape-Ms", String(result.totalMs));
  res.setHeader("X-Via", result.via || "origin");
  res.setHeader("Content-Type", "application/octet-stream");
  res.send(payload);
});

// ----------------------------------------------------
// DATABASE & REPLICATION APIS
// ----------------------------------------------------

function retransmissionPenalty() {
  const p = profile.lossPct / 100;
  return p * profile.latencyMs * 8;
}

app.post("/api/db/write", async (req, res) => {
  const body = String(req.body?.body || req.body?.payload || "").trim();
  if (body.length < 1) return res.status(400).json({ error: "Write a short message to store in the cloud DB." });
  if (body.length > 400) return res.status(400).json({ error: "Message too long (max 400 chars)." });

  const result = await shapeRequest(profile, { bytes: 800 + body.length, kind: "db", retries: 5 });
  if (!result.ok) return res.status(503).json({ error: result.error, ...result });

  const info = sql.addRecord.run(body, sql.now());
  const id = Number(info.lastInsertRowid);
  const replicaPath = pathOpen(profile, "replica");
  if (replicaPath.ok) {
    const lag = Math.round(sampleDelay(profile) * 1.8 + transferMs(600, profile) + retransmissionPenalty());
    replicaQueue.push({ id, body, lag, enqueued: Date.now() });
    replicaLagMs = Math.max(replicaLagMs, lag);
  } else {
    replicaLagMs = Math.max(replicaLagMs, 9999);
  }
  res.status(201).json({
    id,
    body,
    primaryAt: sql.now(),
    replicaQueued: replicaPath.ok,
    estimatedLagMs: replicaPath.ok ? replicaLagMs : null,
    ...result,
  });
});

app.get("/api/db/status", (_req, res) => {
  const primary = sql.primaryCount.get().c;
  const replica = sql.replicaCount.get().c;
  res.json({
    primary,
    replica,
    pending: replicaQueue.length,
    replicaLagMs,
    replicaEnabled: profile.replicaEnabled,
    inSync: replicaQueue.length === 0 && replicaLagMs < 250 && primary === replica,
    records: sql.listRecords.all().slice(0, 16).map((r) => ({
      ...r,
      replica: sql.replicaByRecord.get(r.id) || null,
    })),
    lastReplica: sql.latestReplica.get() || null,
  });
});

app.get("/api/db/records", (_req, res) => {
  const records = sql.listRecords.all().map((r) => ({
    ...r,
    replica: sql.replicaByRecord.get(r.id) || null,
  }));
  res.json(records);
});

app.delete("/api/db/records/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = sql.getRecord.get(id);
  if (!r) return res.status(404).json({ error: "Record not found." });
  replicaQueue = replicaQueue.filter((j) => j.id !== id);
  sql.deleteReplicaByRecord.run(id);
  sql.deleteRecord.run(id);
  res.json({ ok: true, deletedId: id });
});

// ----------------------------------------------------
// REQUEST PATH & TIMELINE APIS
// ----------------------------------------------------

app.get("/api/anatomy", (req, res) => {
  const flow = simulateRequestFlow(profile, String(req.query?.service || "api"));
  res.json({
    ...handshakeTimeline(profile),
    ...flow,
  });
});

app.get("/api/trace", (req, res) => {
  const kind = String(req.query?.service || "api");
  const flow = simulateRequestFlow(profile, kind);
  res.json({
    ...handshakeTimeline(profile),
    ...flow,
  });
});

app.post("/api/request-flow/simulate", (req, res) => {
  const service = String(req.body?.service || "api");
  const flow = simulateRequestFlow(profile, service);
  res.json(flow);
});

// ----------------------------------------------------
// EXPERIMENT LOG & CSV EXPORT APIS
// ----------------------------------------------------

app.get("/api/telemetry", (_req, res) => {
  res.json(sql.listTelemetry.all().reverse());
});

app.get("/api/commentary", (_req, res) => {
  res.json(sql.listComments.all());
});

app.get("/api/experiments", (_req, res) => {
  res.json(sql.listExperiments.all());
});

app.post("/api/experiments", (req, res) => {
  const title = String(req.body?.title || req.body?.name || "Untitled run").trim().slice(0, 80);
  const notes = String(req.body?.notes || "").slice(0, 500);
  const info = sql.addExperiment.run(title, notes, sql.now());
  res.status(201).json(sql.getExperiment.get(Number(info.lastInsertRowid)));
});

app.put("/api/experiments/:id", (req, res) => {
  const id = Number(req.params.id);
  const exp = sql.getExperiment.get(id);
  if (!exp) return res.status(404).json({ error: "Not found." });
  const title = String(req.body?.title || exp.title).trim().slice(0, 80);
  const notes = String(req.body?.notes ?? exp.notes ?? "").slice(0, 500);
  sql.updateExperiment.run(title, notes, id);
  res.json(sql.getExperiment.get(id));
});

app.post("/api/experiments/:id/stop", (req, res) => {
  const id = Number(req.params.id);
  const exp = sql.getExperiment.get(id);
  if (!exp) return res.status(404).json({ error: "Not found." });
  const samples = sql.listSamples.all(id);
  const healthAvg = samples.length
    ? Math.round(samples.reduce((a, s) => a + s.health, 0) / samples.length)
    : snapshotHealth().score;
  const summary = JSON.stringify({
    samples: samples.length,
    healthAvg,
    endedNetwork: profile,
    replicaLagMs,
  });
  sql.endExperiment.run(sql.now(), summary, id);
  res.json(sql.getExperiment.get(id));
});

app.delete("/api/experiments/:id", (req, res) => {
  sql.deleteExperiment.run(Number(req.params.id));
  res.json({ ok: true });
});

app.get("/api/experiments/:id", (req, res) => {
  const exp = sql.getExperiment.get(Number(req.params.id));
  if (!exp) return res.status(404).json({ error: "Not found." });
  res.json({ ...exp, samples: sql.listSamples.all(exp.id) });
});

app.get("/api/experiments/:id/export.csv", (req, res) => {
  const id = Number(req.params.id);
  const exp = sql.getExperiment.get(id);
  if (!exp) return res.status(404).json({ error: "Not found." });
  const samples = sql.listSamples.all(id);
  const header = "ts,latency_ms,loss_pct,bandwidth_kbps,health,replica_lag_ms";
  const lines = samples.map(
    (s) => `${s.ts},${s.latency_ms},${s.loss_pct},${s.bandwidth_kbps},${s.health},${s.replica_lag_ms}`
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="experiment-${id}.csv"`);
  res.send([header, ...lines].join("\n"));
});

// ----------------------------------------------------
// MISSIONS / CHALLENGES APIS
// ----------------------------------------------------

const MISSIONS = [
  {
    id: "mission-1",
    title: "Mission 1: Starve the Player",
    objective: "Make the video buffer without cutting the network link.",
    startingConditions: {
      latencyMs: 25,
      lossPct: 0,
      bandwidthKbps: 50000,
      jitterMs: 0,
      failedLinks: [],
    },
    hint: "Constrict bandwidth to under 1200 kbps or raise packet loss to over 10% while keeping all links connected.",
    concept: "Bandwidth sets the throughput ceiling; packet loss destroys TCP goodput through backoff.",
  },
  {
    id: "mission-2",
    title: "Mission 2: Desync the Replica",
    objective: "Cause database replication lag to exceed two seconds (2000 ms).",
    startingConditions: {
      latencyMs: 25,
      lossPct: 0,
      bandwidthKbps: 50000,
      failedLinks: [],
    },
    hint: "Increase latency or cut the 'db-replica' link, then commit a write to the cloud DB.",
    concept: "Distributed databases rely on network pipelines to deliver transaction logs to replicas.",
  },
  {
    id: "mission-3",
    title: "Mission 3: Survive a Cable Cut",
    objective: "Make the system survive a primary WAN cut using CDN or backup infrastructure.",
    startingConditions: {
      failedLinks: [],
      cdnEnabled: false,
      secondDcEnabled: false,
    },
    hint: "Enable CDN or Secondary DC first, then sever the 'core-lb' link and verify traffic reaches the alternate path.",
    concept: "Redundant network paths and edge POPs provide fault tolerance against WAN link failures.",
  },
  {
    id: "mission-4",
    title: "Mission 4: Recover from Packet Storm",
    objective: "Restore the cloud to a healthy state (Health Score >= 85) after severe packet loss.",
    startingConditions: {
      latencyMs: 95,
      jitterMs: 65,
      lossPct: 20,
      bandwidthKbps: 900,
      failedLinks: [],
    },
    hint: "Use Reset Network or drag packet loss down to <= 1% and widen bandwidth.",
    concept: "Eliminating loss allows TCP window scaling to recover and eliminates retransmissions.",
  },
  {
    id: "mission-5",
    title: "Mission 5: Sweet Spot for 720p",
    objective: "Find the minimum bandwidth required for stable 720p playback (2200-5000 kbps).",
    startingConditions: {
      bandwidthKbps: 60000,
      lossPct: 0,
      latencyMs: 15,
      failedLinks: [],
    },
    hint: "Adjust bandwidth to around 2500–4500 kbps with low loss so adaptive streaming rungs select 720p.",
    concept: "Adaptive Bitrate (ABR) ladders dynamically match chunk bitrate to measured network goodput.",
  },
  {
    id: "mission-6",
    title: "Mission 6: Campus Congestion Study",
    objective: "Compare a normal network with a congested network.",
    startingConditions: {
      name: "Congested Campus",
      latencyMs: 75,
      lossPct: 3.5,
      bandwidthKbps: 1500,
      jitterMs: 42,
    },
    hint: "Load Congested Campus preset, run an upload or video test, and observe health score drop below 80.",
    concept: "Shared queue bufferbloat introduces queuing delay and packet drops under heavy concurrency.",
  },
];

// Map legacy IDs for compatibility
const CHALLENGE_MAP = {
  "buffer-storm": "mission-1",
  "replica-drift": "mission-2",
  "edge-survive": "mission-3",
  distance: "mission-6",
};

app.get("/api/challenges", (_req, res) => {
  res.json({ catalog: MISSIONS, runs: sql.listChallenges.all() });
});

app.post("/api/challenges/start", (req, res) => {
  let challengeId = String(req.body?.challengeId || "");
  if (CHALLENGE_MAP[challengeId]) challengeId = CHALLENGE_MAP[challengeId];
  const found = MISSIONS.find((m) => m.id === challengeId);
  if (!found) return res.status(400).json({ error: "Unknown challenge ID." });
  const info = sql.addChallenge.run(found.id, sql.now(), JSON.stringify({ objective: found.objective }));
  res.status(201).json(sql.getChallenge.get(Number(info.lastInsertRowid)));
});

app.post("/api/challenges/:id/setup", (req, res) => {
  let id = String(req.params.id);
  if (CHALLENGE_MAP[id]) id = CHALLENGE_MAP[id];
  const mission = MISSIONS.find((m) => m.id === id);
  if (!mission) return res.status(404).json({ error: "Mission not found." });
  profile = { ...profile, ...clampProfile(mission.startingConditions) };
  persist();
  broadcast();
  res.json({ ok: true, profile, mission });
});

app.post("/api/challenges/:id/complete", async (req, res) => {
  let rawId = String(req.params.id);
  let missionId = CHALLENGE_MAP[rawId] || rawId;
  let run = sql.getChallenge.get(Number(rawId));
  if (!run) {
    if (!MISSIONS.some((m) => m.id === missionId)) {
      return res.status(404).json({ error: "Mission not found." });
    }
    const info = sql.addChallenge.run(missionId, sql.now(), "{}");
    run = sql.getChallenge.get(Number(info.lastInsertRowid));
  } else {
    missionId = run.challenge_id;
  }

  let success = false;
  let details = {};
  const currentHealth = snapshotHealth().score;
  const noCuts = profile.failedLinks.length === 0;

  if (missionId === "mission-1" || missionId === "buffer-storm") {
    const starved = lastVideoQuality === "buffering" || lastVideoQuality === "240p" || profile.lossPct >= 10 || profile.bandwidthKbps <= 1400;
    success = Boolean(starved && noCuts);
    details = {
      lossPct: profile.lossPct,
      bandwidthKbps: profile.bandwidthKbps,
      videoQuality: lastVideoQuality,
      noLinksCut: noCuts,
    };
  } else if (missionId === "mission-2" || missionId === "replica-drift") {
    const lagExceeded = replicaLagMs >= 2000 || profile.failedLinks.includes("db-replica") || !profile.replicaEnabled;
    success = Boolean(lagExceeded);
    details = {
      replicaLagMs,
      replicaCut: profile.failedLinks.includes("db-replica"),
      replicaEnabled: profile.replicaEnabled,
    };
  } else if (missionId === "mission-3" || missionId === "edge-survive") {
    const primaryCut = profile.failedLinks.includes("core-lb");
    const cdnSurvives = profile.cdnEnabled && pathOpen(profile, "video").ok;
    const dc2Survives = profile.secondDcEnabled && pathOpen(profile, "api").ok && pathOpen(profile, "api").via === "secondary-dc";
    success = Boolean(primaryCut && (cdnSurvives || dc2Survives));
    details = {
      primaryCut,
      cdnSurvives,
      dc2Survives,
      activeRoute: pathOpen(profile, "api").via,
    };
  } else if (missionId === "mission-4") {
    success = Boolean(profile.lossPct <= 1 && currentHealth >= 85);
    details = {
      lossPct: profile.lossPct,
      health: currentHealth,
      restored: success,
    };
  } else if (missionId === "mission-5") {
    const is720p = lastVideoQuality === "720p";
    const bwInRange = profile.bandwidthKbps >= 2000 && profile.bandwidthKbps <= 5500;
    success = Boolean(is720p || (bwInRange && profile.lossPct <= 2));
    details = {
      videoQuality: lastVideoQuality,
      bandwidthKbps: profile.bandwidthKbps,
      goodputKbps: Math.round(lastGoodputKbps),
    };
  } else if (missionId === "mission-6" || missionId === "distance") {
    const isCongested = profile.bandwidthKbps <= 2000 && profile.latencyMs >= 50 && currentHealth <= 82;
    success = Boolean(isCongested);
    details = {
      latencyMs: profile.latencyMs,
      bandwidthKbps: profile.bandwidthKbps,
      health: currentHealth,
    };
  }

  sql.completeChallenge.run(sql.now(), success ? 1 : 0, JSON.stringify(details), run.id);
  res.json({ ...sql.getChallenge.get(run.id), details, success });
});

// Error handling
app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Request failed." });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/live" });

function broadcast() {
  const payload = JSON.stringify({ type: "state", ...publicState(), replicaPending: replicaQueue.length });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "state", ...publicState(), replicaPending: replicaQueue.length }));
});

const ticker = setInterval(() => {
  while (replicaQueue.length) {
    const job = replicaQueue[0];
    if (Date.now() - job.enqueued < job.lag) break;
    replicaQueue.shift();
    if (pathOpen(profile, "replica").ok) {
      try {
        if (sql.getRecord.get(job.id)) {
          sql.addReplica.run(job.id, job.body, job.lag, sql.now());
        }
      } catch {
        /* Record was deleted before replication completed */
      }
    }
  }
  const next = replicaQueue[0];
  replicaLagMs = next ? Math.max(0, next.lag - (Date.now() - next.enqueued)) : Math.max(0, replicaLagMs * 0.72);
  if (replicaLagMs < 40) replicaLagMs = 0;

  try {
    const health = snapshotHealth();
    sql.addTelemetry.run(
      sql.now(),
      profile.latencyMs,
      profile.lossPct,
      profile.bandwidthKbps,
      health.score,
      replicaLagMs,
      lastVideoQuality,
      lastGoodputKbps
    );

    const openExp = sql.listExperiments.all().find((e) => !e.ended_at);
    if (openExp) {
      sql.addSample.run(
        openExp.id,
        sql.now(),
        profile.latencyMs,
        profile.lossPct,
        profile.bandwidthKbps,
        health.score,
        replicaLagMs
      );
    }
  } catch (err) {
    // Database busy or locked; drop tick safely without crashing process
  }
  broadcast();
}, 900);
ticker.unref();

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  console.log(`Cloud Under Stress API on http://localhost:${PORT}`);
});
server.wss = wss;
export { app, server, wss, profile, clampProfile, snapshotHealth };
