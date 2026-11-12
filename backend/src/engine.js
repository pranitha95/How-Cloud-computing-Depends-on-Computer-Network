export const LINKS = [
  { id: "user-isp", from: "You", to: "ISP", kind: "access" },
  { id: "isp-core", from: "ISP", to: "Internet", kind: "backbone" },
  { id: "core-edge", from: "Internet", to: "CDN Edge", kind: "edge" },
  { id: "core-dc1", from: "Internet", to: "DC-Primary", kind: "wan" },
  { id: "dc1-lb", from: "DC-Primary", to: "Load Balancer", kind: "dc" },
  { id: "dc1-app", from: "Load Balancer", to: "App", kind: "dc" },
  { id: "dc1-db", from: "App", to: "DB Primary", kind: "dc" },
  { id: "dc1-replica", from: "DB Primary", to: "DB Replica", kind: "sync" },
  { id: "core-dc2", from: "Internet", to: "DC-Secondary", kind: "wan" },
  { id: "dc2-lb", from: "DC-Secondary", to: "Load Balancer", kind: "dc" },
];

export const VIDEO_LADDER = [
  { quality: "1080p", bitrateKbps: 8000 },
  { quality: "720p", bitrateKbps: 5000 },
  { quality: "480p", bitrateKbps: 2500 },
  { quality: "240p", bitrateKbps: 800 },
  { quality: "buffering", bitrateKbps: 0 },
];

const DEFAULT_PROFILE = {
  latencyMs: 25,
  jitterMs: 0,
  lossPct: 0,
  bandwidthKbps: 50000,
  failedLinks: [],
  cdnEnabled: false,
  replicaEnabled: true,
  secondDcEnabled: false,
  chaosMode: false,
};

export function normalizeProfile(raw = {}) {
  const failedLinks = Array.isArray(raw.failedLinks)
    ? raw.failedLinks
    : safeJson(raw.failedLinks, []);
  return {
    ...DEFAULT_PROFILE,
    ...raw,
    latencyMs: clamp(Number(raw.latencyMs ?? DEFAULT_PROFILE.latencyMs), 1, 2000),
    jitterMs: clamp(Number(raw.jitterMs ?? 0), 0, 500),
    lossPct: clamp(Number(raw.lossPct ?? 0), 0, 80),
    bandwidthKbps: clamp(Number(raw.bandwidthKbps ?? 50000), 64, 100000),
    failedLinks,
    cdnEnabled: Boolean(raw.cdnEnabled),
    replicaEnabled: raw.replicaEnabled !== false,
    secondDcEnabled: Boolean(raw.secondDcEnabled),
    chaosMode: Boolean(raw.chaosMode),
  };
}

export function rttMs(profile) {
  return profile.latencyMs * 2 + profile.jitterMs * 0.6;
}

export function goodputKbps(profile) {
  const p = profile.lossPct / 100;
  const rtt = rttMs(profile);
  const rttPenalty = Math.max(0.15, 1 / (1 + rtt / 200));
  const lossPenalty = Math.max(0.05, (1 - p) ** 2);
  return Math.max(32, profile.bandwidthKbps * lossPenalty * rttPenalty);
}

export function videoQuality(profile) {
  if (!isServiceReachable(profile, "video")) return "offline";
  const gp = goodputKbps(profile);
  for (const rung of VIDEO_LADDER) {
    if (gp >= rung.bitrateKbps * 1.2) return rung.quality;
  }
  return "buffering";
}

export function simulateTransfer(profile, bytes, service = "origin") {
  const reachable = isServiceReachable(profile, service);
  const rtt = rttMs(profile);
  const p = profile.lossPct / 100;
  const mss = 1460;
  const packets = Math.max(1, Math.ceil(bytes / mss));
  const expectedTx = p >= 0.95 ? packets * 12 : packets / Math.max(0.08, 1 - p);
  const extraRtts = Math.max(0, expectedTx - packets);
  const handshakeRtts = service === "edge" ? 1.2 : 2.4;
  const transferMs = ((bytes * 8) / (goodputKbps(profile) * 1000)) * 1000;
  const simulatedMs = Math.round(handshakeRtts * rtt + transferMs + extraRtts * rtt);
  return {
    ok: reachable && p < 0.75,
    reachable,
    simulatedMs: reachable ? simulatedMs : simulatedMs + 800,
    retries: Math.round(extraRtts),
    throughputKbps: Number(goodputKbps(profile).toFixed(1)),
    rttMs: Math.round(rtt),
    steps: requestSteps(profile, service),
  };
}

export function requestSteps(profile, service = "origin") {
  const rtt = rttMs(profile);
  const dns = Math.round(rtt * 0.25);
  const tcp = Math.round(rtt * 0.5);
  const tls = Math.round(rtt * 0.5);
  const lb = profile.cdnEnabled && service === "edge" ? 4 : 12;
  const app = 18 + Math.round(profile.lossPct);
  const used = pathFor(profile, service);
  return [
    { name: "DNS lookup", ms: dns, detail: "Resolve api.cloud-under-stress.lab" },
    { name: "TCP handshake", ms: tcp, detail: "SYN → SYN-ACK → ACK" },
    { name: "TLS handshake", ms: tls, detail: "Certificates + keys over RTT" },
    { name: "Load balancer", ms: lb, detail: profile.cdnEnabled ? "Nearest edge POP" : "DC-Primary LB" },
    { name: "Application", ms: app, detail: service === "replica" ? "Replication worker" : "Cloud API" },
    { name: "Path", ms: 0, detail: used.join(" → ") },
  ];
}

export function pathFor(profile, service) {
  const access = ["You", "ISP", "Internet"];
  if (service === "video" && profile.cdnEnabled) {
    return [...access, "CDN Edge"];
  }
  if (service === "origin" || service === "upload" || service === "app") {
    if (profile.failedLinks.includes("core-dc1") && profile.secondDcEnabled && !profile.failedLinks.includes("core-dc2") && !profile.failedLinks.includes("dc2-lb")) {
      return [...access, "DC-Secondary", "Load Balancer", "App"];
    }
    return [...access, "DC-Primary", "Load Balancer", "App"];
  }
  if (service === "db") {
    const base = pathFor(profile, "app");
    return [...base, "DB Primary"];
  }
  if (service === "replica") {
    return [...pathFor(profile, "db"), "DB Replica"];
  }
  return [...access, "DC-Primary"];
}

export function isServiceReachable(profile, service) {
  const failed = new Set(profile.failedLinks || []);
  if (failed.has("user-isp") || failed.has("isp-core")) return false;

  if (service === "video") {
    if (profile.cdnEnabled && !failed.has("core-edge")) return true;
    return canReachOrigin(profile);
  }
  if (service === "replica") {
    if (!profile.replicaEnabled) return false;
    if (failed.has("dc1-replica")) return false;
    return canReachOrigin(profile) && !failed.has("dc1-db") && !failed.has("dc1-app") && !failed.has("dc1-lb");
  }
  if (service === "db") {
    return canReachOrigin(profile) && !failed.has("dc1-db") && !failed.has("dc1-app") && !failed.has("dc1-lb");
  }
  return canReachOrigin(profile);
}

function canReachOrigin(profile) {
  const failed = new Set(profile.failedLinks || []);
  if (!failed.has("core-dc1") && !failed.has("dc1-lb") && !failed.has("dc1-app")) return true;
  if (profile.secondDcEnabled && !failed.has("core-dc2") && !failed.has("dc2-lb") && !failed.has("dc1-app")) return true;
  return false;
}

export function replicaLagMs(profile) {
  if (!profile.replicaEnabled) return -1;
  if (!isServiceReachable(profile, "replica")) return 99999;
  const sim = simulateTransfer(profile, 2048, "replica");
  return sim.simulatedMs;
}

export function healthScore(profile) {
  let score = 100;
  score -= Math.min(38, rttMs(profile) / 12);
  score -= profile.lossPct * 1.7;
  if (profile.bandwidthKbps < 8000) score -= (8000 - profile.bandwidthKbps) / 250;
  const failed = profile.failedLinks || [];
  score -= failed.length * 12;
  if (failed.includes("user-isp") || failed.includes("isp-core")) score -= 20;
  if (failed.includes("core-dc1") && profile.cdnEnabled) score += 10;
  if (failed.includes("core-dc1") && profile.secondDcEnabled) score += 14;
  if (profile.cdnEnabled) score += 4;
  if (!isServiceReachable(profile, "origin")) score = Math.min(score, 18);
  return clamp(Number(score.toFixed(1)), 0, 100);
}

export function commentaryFor(profile) {
  const lines = [];
  const rtt = rttMs(profile);
  const q = videoQuality(profile);
  if (profile.lossPct >= 15) {
    lines.push({
      severity: "warn",
      message: "Lost packets must be resent (TCP retransmission), so uploads and video take longer.",
    });
  }
  if (rtt > 180) {
    lines.push({
      severity: "warn",
      message: "High latency means every handshake and ACK waits. Distant data centers feel slower.",
    });
  }
  if (profile.bandwidthKbps < 4000) {
    lines.push({
      severity: "warn",
      message: "The pipe is too narrow. Bandwidth is the ceiling for how much cloud traffic fits per second.",
    });
  }
  if ((profile.failedLinks || []).includes("core-dc1")) {
    if (profile.secondDcEnabled) {
      lines.push({
        severity: "info",
        message: "Primary link is cut, but traffic failed over to DC-Secondary. Redundancy kept the cloud alive.",
      });
    } else if (profile.cdnEnabled) {
      lines.push({
        severity: "info",
        message: "Origin is unreachable, but the CDN edge can still serve cached video. Uploads to origin still fail.",
      });
    } else {
      lines.push({
        severity: "alert",
        message: "The cable to DC-Primary is cut and there is no backup path. The cloud is unreachable.",
      });
    }
  }
  if (!isServiceReachable(profile, "replica") && profile.replicaEnabled) {
    lines.push({
      severity: "warn",
      message: "The replica cannot catch up. Primary and secondary databases are drifting out of sync.",
    });
  }
  if (q === "buffering" || q === "240p") {
    lines.push({
      severity: "info",
      message: "Adaptive bitrate dropped quality because goodput cannot hold a HD stream.",
    });
  }
  if (lines.length === 0) {
    lines.push({
      severity: "ok",
      message: "Network is healthy. Cloud services look instant because packets arrive quickly and intact.",
    });
  }
  return lines;
}

export function packetColor(profile, linkId) {
  if ((profile.failedLinks || []).includes(linkId)) return "dead";
  if (profile.lossPct >= 12) return "loss";
  if (rttMs(profile) > 200 || profile.bandwidthKbps < 3000) return "stress";
  return "ok";
}

export function chaosJitter(profile) {
  const next = { ...profile };
  const roll = Math.random();
  if (roll < 0.25) next.lossPct = clamp(next.lossPct + (Math.random() * 20 - 8), 0, 55);
  else if (roll < 0.5) next.latencyMs = clamp(Math.round(next.latencyMs + (Math.random() * 180 - 60)), 10, 800);
  else if (roll < 0.75) next.bandwidthKbps = clamp(Math.round(next.bandwidthKbps * (0.4 + Math.random())), 128, 80000);
  else {
    const ids = LINKS.map((l) => l.id);
    const pick = ids[Math.floor(Math.random() * ids.length)];
    const set = new Set(next.failedLinks);
    if (set.has(pick)) set.delete(pick);
    else set.add(pick);
    next.failedLinks = [...set];
  }
  return normalizeProfile(next);
}

export function snapshot(profile) {
  const p = normalizeProfile(profile);
  const health = healthScore(p);
  const comments = commentaryFor(p);
  return {
    profile: p,
    health,
    rttMs: Math.round(rttMs(p)),
    goodputKbps: Number(goodputKbps(p).toFixed(1)),
    videoQuality: videoQuality(p),
    replicaLagMs: replicaLagMs(p),
    originUp: isServiceReachable(p, "origin"),
    videoUp: isServiceReachable(p, "video"),
    replicaUp: isServiceReachable(p, "replica"),
    commentary: comments,
    links: LINKS.map((link) => ({
      ...link,
      state: packetColor(p, link.id),
      down: (p.failedLinks || []).includes(link.id),
    })),
  };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function safeJson(value, fallback) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
