/** In-process network emulator and simulation engine.
 * Every cloud request is shaped by this engine.
 */

export const LINKS = [
  { id: "user-isp", from: "user", to: "isp", label: "Last mile" },
  { id: "isp-core", from: "isp", to: "core", label: "Internet Backbone" },
  { id: "core-cdn", from: "core", to: "cdn", label: "CDN Edge" },
  { id: "core-lb", from: "core", to: "lb", label: "Primary WAN" },
  { id: "lb-app", from: "lb", to: "app", label: "App Tier" },
  { id: "app-db", from: "app", to: "db", label: "Primary DB" },
  { id: "db-replica", from: "db", to: "replica", label: "Replication Link" },
  { id: "core-dc2", from: "core", to: "dc2", label: "Secondary DC" },
  { id: "dc2-lb", from: "dc2", to: "lb", label: "DC2 to LB" },
];

export const PRESETS = {
  healthy: {
    name: "Normal Network",
    latencyMs: 15,
    jitterMs: 2,
    lossPct: 0,
    bandwidthKbps: 60000,
    failedLinks: [],
  },
  wifi: {
    name: "Bad Wi-Fi",
    latencyMs: 48,
    jitterMs: 35,
    lossPct: 8,
    bandwidthKbps: 4000,
    failedLinks: [],
  },
  campus: {
    name: "Congested Campus",
    latencyMs: 75,
    jitterMs: 42,
    lossPct: 3.5,
    bandwidthKbps: 1500,
    failedLinks: [],
  },
  transatlantic: {
    name: "Transatlantic Connection",
    latencyMs: 180,
    jitterMs: 12,
    lossPct: 0.4,
    bandwidthKbps: 25000,
    failedLinks: [],
  },
  cut: {
    name: "Cable Cut",
    latencyMs: 25,
    jitterMs: 2,
    lossPct: 0,
    bandwidthKbps: 50000,
    failedLinks: ["core-lb"],
  },
  storm: {
    name: "Packet Storm",
    latencyMs: 95,
    jitterMs: 65,
    lossPct: 20,
    bandwidthKbps: 900,
    failedLinks: [],
  },
};

export function defaultState() {
  return {
    ...PRESETS.healthy,
    cdnEnabled: false,
    replicaEnabled: true,
    secondDcEnabled: false,
    chaos: false,
  };
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function clampProfile(input = {}) {
  const failedLinks = Array.isArray(input.failedLinks)
    ? [...new Set(input.failedLinks.filter((id) => LINKS.some((l) => l.id === id)))]
    : [];
  return {
    latencyMs: clamp(Number(input.latencyMs) || 0, 0, 2000),
    jitterMs: clamp(Number(input.jitterMs) || 0, 0, 500),
    lossPct: clamp(Number(input.lossPct) || 0, 0, 80),
    bandwidthKbps: clamp(Number(input.bandwidthKbps) || 64, 64, 200000),
    failedLinks,
    cdnEnabled: Boolean(input.cdnEnabled),
    replicaEnabled: input.replicaEnabled !== false,
    secondDcEnabled: Boolean(input.secondDcEnabled),
    chaos: Boolean(input.chaos),
    name: typeof input.name === "string" ? input.name.slice(0, 80) : undefined,
  };
}

export function sampleDelay(profile) {
  const jitter = (Math.random() * 2 - 1) * profile.jitterMs;
  return Math.max(1, profile.latencyMs + jitter);
}

export function shouldDrop(profile) {
  return Math.random() * 100 < profile.lossPct;
}

export function transferMs(bytes, profile) {
  const bytesPerSec = Math.max((profile.bandwidthKbps * 1024) / 8, 1);
  return (bytes / bytesPerSec) * 1000;
}

/** Retransmission extra RTTs: expected extra ≈ loss / (1 - loss) */
export function retransmissionRtts(profile) {
  const p = profile.lossPct / 100;
  if (p >= 0.95) return 12;
  return p / Math.max(1 - p, 0.05);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pathOpen(profile, kind) {
  const down = new Set(profile.failedLinks || []);
  const lastMile = down.has("user-isp") || down.has("isp-core");
  if (lastMile) {
    return { ok: false, reason: "Last-mile or ISP backbone link is severed. Traffic cannot reach the internet." };
  }

  // Edge CDN bypass for video streaming
  if (kind === "video" && profile.cdnEnabled && !down.has("core-cdn")) {
    return { ok: true, via: "cdn" };
  }

  // Primary path vs Secondary DC failover
  const primaryCut = down.has("core-lb");
  const secondaryUsable =
    profile.secondDcEnabled && !down.has("core-dc2") && !down.has("dc2-lb");

  let via = "origin";
  if (primaryCut) {
    if (secondaryUsable) {
      via = "secondary-dc";
    } else {
      if (kind === "video" && profile.cdnEnabled) {
        return { ok: false, reason: "Origin is down and edge cache is empty for this chunk." };
      }
      return { ok: false, reason: "Primary WAN link is cut and secondary data center is offline or disabled." };
    }
  }

  if (down.has("lb-app")) {
    return { ok: false, reason: "Load balancer cannot reach cloud application instances." };
  }

  if (kind === "db" && down.has("app-db")) {
    return { ok: false, reason: "Application cluster cannot reach the primary database." };
  }

  if (kind === "replica") {
    if (!profile.replicaEnabled) {
      return { ok: false, reason: "Database replication is disabled by configuration." };
    }
    if (down.has("db-replica")) {
      return { ok: false, reason: "Replication network link between Primary and Replica DB is severed." };
    }
    if (down.has("app-db")) {
      return { ok: false, reason: "Primary DB is unreachable, replication halted." };
    }
  }

  return { ok: true, via };
}

export async function shapeRequest(profile, { bytes = 1500, kind = "api", retries = 5 } = {}) {
  const path = pathOpen(profile, kind);
  if (!path.ok) {
    await sleep(Math.min(sampleDelay(profile) * 0.3, 300));
    return { ok: false, error: path.reason, retries: 0, delayMs: 0, transferMs: 0, via: null, totalMs: 0 };
  }

  let attempts = 0;
  let delayTotal = 0;
  let transferTotal = 0;
  const isCdn = path.via === "cdn";
  const effectiveLatency = isCdn ? Math.max(5, profile.latencyMs * 0.35) : profile.latencyMs;
  const rtt = () => {
    const jitter = (Math.random() * 2 - 1) * (isCdn ? profile.jitterMs * 0.3 : profile.jitterMs);
    return Math.max(1, effectiveLatency + jitter);
  };

  while (attempts <= retries) {
    attempts += 1;
    const d = rtt();
    delayTotal += d;
    await sleep(Math.min(d, 1500));

    if (shouldDrop(profile) && attempts <= retries) {
      continue;
    }

    const t = transferMs(bytes, profile);
    transferTotal += t;
    await sleep(Math.min(t, 2500));

    if (shouldDrop(profile) && attempts <= retries) {
      continue;
    }

    return {
      ok: true,
      retries: attempts - 1,
      delayMs: Math.round(delayTotal),
      transferMs: Math.round(transferTotal),
      via: path.via,
      totalMs: Math.round(delayTotal + transferTotal),
    };
  }

  return {
    ok: false,
    error: "Excessive packet loss exhausted TCP retry budget. Request timed out.",
    retries: attempts - 1,
    delayMs: Math.round(delayTotal),
    transferMs: Math.round(transferTotal),
    via: path.via,
    totalMs: Math.round(delayTotal + transferTotal),
  };
}

export function handshakeTimeline(profile) {
  const rtt = profile.latencyMs;
  const dns = Math.round(rtt * 0.6 + 8);
  const tcp = Math.round(rtt);
  const tls = Math.round(rtt * 1.5 + 12);
  const lb = Math.round(12 + rtt * 0.15);
  const app = Math.round(8 + transferMs(800, profile));
  const extra = Math.round(retransmissionRtts(profile) * rtt);
  return {
    dns,
    tcp,
    tls,
    lb,
    app: app + extra,
    total: dns + tcp + tls + lb + app + extra,
  };
}

export function simulateRequestFlow(profile, service = "api") {
  const path = pathOpen(profile, service);
  const rtt = profile.latencyMs;
  const dns = Math.round(rtt * 0.55 + 8);
  const tcp = Math.round(rtt);
  const tls = Math.round(rtt * 1.4 + 10);
  const lb = Math.round(8 + rtt * 0.1);
  const app = Math.round(14 + transferMs(1200, profile));
  const db = service === "db" || service === "replica" ? Math.round(12 + rtt * 0.25) : 4;
  const ret = Math.round(rtt * 0.5);
  const extra = Math.round(retransmissionRtts(profile) * rtt);

  const steps = [
    {
      stage: 1,
      name: "DNS lookup",
      ms: dns,
      detail: "Translates cloud service hostname to IP. Adds network RTT for recursive resolvers.",
      status: path.ok ? "ok" : "fail",
    },
    {
      stage: 2,
      name: "TCP connection handshake",
      ms: tcp,
      detail: "3-Way SYN -> SYN-ACK -> ACK establishes reliable in-order transport (1 full RTT).",
      status: path.ok ? "ok" : "fail",
    },
    {
      stage: 3,
      name: "TLS handshake",
      ms: tls,
      detail: "Key exchange and certificate validation negotiate encryption. Scales heavily with RTT.",
      status: path.ok ? "ok" : "fail",
    },
    {
      stage: 4,
      name: "Load balancer",
      ms: lb,
      detail: path.via === "secondary-dc"
        ? "Traffic routed to Secondary DC load balancer via failover route."
        : path.via === "cdn"
        ? "Served directly by nearest Anycast CDN edge cache."
        : "Steered to healthy application pod in primary DC cluster.",
      status: path.ok ? "ok" : "fail",
    },
    {
      stage: 5,
      name: "Cloud application",
      ms: app + extra,
      detail: `Application logic executed (${extra > 0 ? extra + " ms retransmission overhead from loss" : "fast path"}).`,
      status: path.ok ? "ok" : "fail",
    },
    {
      stage: 6,
      name: "Database request",
      ms: db,
      detail: service === "db" ? "Write committed to Primary SQLite WAL ledger." : "Fast read lookup.",
      status: path.ok ? "ok" : "fail",
    },
    {
      stage: 7,
      name: "Response returned to client",
      ms: ret,
      detail: "Final HTTP response payload packet delivered back to user interface.",
      status: path.ok ? "ok" : "fail",
    },
  ];

  const total = steps.reduce((sum, s) => sum + s.ms, 0);

  return {
    ok: path.ok,
    error: path.reason,
    via: path.via,
    totalMs: total,
    steps,
  };
}

export function videoLadder() {
  return [
    { id: "1080p", height: 1080, bitrateKbps: 4500, chunkBytes: 560000, label: "1080p Full HD" },
    { id: "720p", height: 720, bitrateKbps: 2200, chunkBytes: 275000, label: "720p HD" },
    { id: "480p", height: 480, bitrateKbps: 900, chunkBytes: 112000, label: "480p Standard" },
    { id: "240p", height: 240, bitrateKbps: 350, chunkBytes: 44000, label: "240p Low" },
  ];
}

export function pickQuality(goodputKbps, bufferSec) {
  const ladder = videoLadder();
  const headroom = bufferSec > 4 ? 1 : bufferSec > 1.5 ? 0.85 : 0.6;
  const usable = goodputKbps * headroom;
  for (const q of ladder) {
    if (usable >= q.bitrateKbps * 1.15) return q;
  }
  return ladder[ladder.length - 1];
}

export function healthBreakdown(profile, extras = {}) {
  const latencyPen = Math.min(38, profile.latencyMs / 9);
  const lossPen = profile.lossPct * 2.1;
  const bwPen = profile.bandwidthKbps >= 20000 ? 0 : ((20000 - profile.bandwidthKbps) / 20000) * 28;
  const jitterPen = Math.min(12, profile.jitterMs / 20);
  const down = profile.failedLinks || [];

  let linkPen = 0;
  if (down.includes("user-isp") || down.includes("isp-core")) {
    linkPen += 55;
  } else {
    if (down.includes("core-lb")) {
      if (profile.secondDcEnabled && !down.includes("core-dc2") && !down.includes("dc2-lb")) {
        linkPen += 10; // Failover survived with mild penalty
      } else if (profile.cdnEnabled) {
        linkPen += 22; // Edge CDN survives reads
      } else {
        linkPen += 45; // Primary down without backup
      }
    }
    if (down.includes("lb-app")) linkPen += 30;
    if (down.includes("app-db")) linkPen += 18;
    if (down.includes("db-replica") || !profile.replicaEnabled) linkPen += 8;
  }

  const replicaLag = extras.replicaLagMs || 0;
  const replicaPen = Math.min(15, replicaLag / 350);
  const cdnBonus = profile.cdnEnabled ? 5 : 0;
  const dc2Bonus = profile.secondDcEnabled ? 4 : 0;

  const rawScore = 100 - latencyPen - lossPen - bwPen - jitterPen - linkPen - replicaPen + cdnBonus + dc2Bonus;
  const score = clamp(Math.round(rawScore), 0, 100);

  return {
    score,
    parts: {
      latency: Math.round(latencyPen),
      loss: Math.round(lossPen),
      bandwidth: Math.round(bwPen),
      jitter: Math.round(jitterPen),
      links: Math.round(linkPen),
      replica: Math.round(replicaPen),
      cdnBonus,
      dc2Bonus,
    },
  };
}

export function explain(profile, extras = {}) {
  const down = profile.failedLinks || [];
  if (down.includes("user-isp") || down.includes("isp-core")) {
    return {
      tone: "danger",
      title: "The local network path is dark",
      body: "Packets cannot leave the client or ISP. Cloud servers are operational in the datacenter, but totally unreachable from this host.",
    };
  }
  if (down.includes("core-lb")) {
    if (profile.secondDcEnabled && !down.includes("core-dc2") && !down.includes("dc2-lb")) {
      return {
        tone: "ok",
        title: "Traffic failed over to Secondary DC",
        body: "Primary WAN link severed! Redundant BGP/DNS routing successfully steered traffic to the Secondary Data Center.",
      };
    }
    if (profile.cdnEnabled) {
      return {
        tone: "warn",
        title: "Origin cut — Edge CDN surviving cached reads",
        body: "Primary data center is isolated. The CDN edge continues serving cached video chunks, but origin uploads and database writes will fail.",
      };
    }
    return {
      tone: "danger",
      title: "Primary WAN cable cut — Outage in progress",
      body: "The route to the cloud load balancer is cut. Enable Secondary DC or Edge CDN to restore service availability.",
    };
  }
  if (profile.lossPct >= 12) {
    return {
      tone: "warn",
      title: "High packet loss triggering TCP retransmissions",
      body: `At ${profile.lossPct}% loss, packets must be repeatedly resent. Goodput collapses, uploads drag, and video buffers even though bandwidth is available.`,
    };
  }
  if (profile.bandwidthKbps < 2000) {
    return {
      tone: "warn",
      title: "Bandwidth constriction (narrow pipe)",
      body: `Bandwidth is limited to ${profile.bandwidthKbps} kbps. High-definition video chunks cannot pass through in time, forcing the player to downscale or buffer.`,
    };
  }
  if (profile.latencyMs >= 140) {
    return {
      tone: "warn",
      title: "High round-trip delay (distance penalty)",
      body: `RTT is ${profile.latencyMs * 2} ms. Handshakes (DNS, TCP 3-way, TLS) multiply round-trip delays, making the application feel sluggish across regions.`,
    };
  }
  if ((extras.replicaLagMs || 0) > 2000) {
    return {
      tone: "warn",
      title: "Database replication falling behind",
      body: `Replica lag is ${Math.round(extras.replicaLagMs)} ms. Slow delivery of WAL log entries means secondary database reads are serving stale data.`,
    };
  }
  if (profile.jitterMs > 40) {
    return {
      tone: "warn",
      title: "High jitter causing buffer variance",
      body: "Variance in arrival times causes bursts and starvation. Video streaming buffers deplete rapidly when jitter is high.",
    };
  }
  return {
    tone: "ok",
    title: "Network carrying cloud traffic reliably",
    body: "Low latency, minimal packet loss, and ample bandwidth keep cloud services responsive and healthy.",
  };
}
