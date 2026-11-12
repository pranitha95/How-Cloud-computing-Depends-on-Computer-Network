import React, { useState, useMemo, useRef, useEffect } from "react";
import { useLab } from "../LabContext.jsx";

// Precise coordinates in 1000 x 520 SVG coordinate space
const NODES = {
  user: {
    id: "user",
    x: 90,
    y: 390,
    name: "CLIENT (YOU)",
    sub: "Origin Host",
    icon: "💻",
    ip: "192.168.1.104",
    role: "Local Browser / Operating System TCP Stack",
    details: "Initiates HTTP/HTTPS connections, manages congestion window (cwnd), buffers outgoing frames.",
  },
  isp: {
    id: "isp",
    x: 230,
    y: 280,
    name: "LOCAL ISP",
    sub: "Edge Gateway",
    icon: "📡",
    ip: "10.48.0.1",
    role: "Last-Mile Broadband Access / DOCSIS / FTTH",
    details: "Subject to bufferbloat, subscriber contention, Wi-Fi interference, and last-mile packet drops.",
  },
  core: {
    id: "core",
    x: 400,
    y: 190,
    name: "INTERNET BACKBONE",
    sub: "Tier-1 Transit",
    icon: "🌐",
    ip: "AS15169 (BGP Tier-1)",
    role: "Undersea Cables & Global Autonomous Systems",
    details: "Speed-of-light propagation delays across long-haul fiber (typically 5ms per 1,000 km).",
  },
  cdn: {
    id: "cdn",
    x: 570,
    y: 90,
    name: "CDN EDGE CACHE",
    sub: "Anycast POP",
    icon: "⚡",
    ip: "cdn.edge.anycast",
    role: "Edge Reverse Proxy & Static Media Storage",
    details: "Caches video chunks and assets near the user, preventing WAN delays and origin overload.",
  },
  lb: {
    id: "lb",
    x: 630,
    y: 280,
    name: "LOAD BALANCER",
    sub: "Reverse Proxy",
    icon: "🔀",
    ip: "10.0.0.1 (HAProxy)",
    role: "High-Availability Layer-4 / Layer-7 Proxy",
    details: "Terminates TLS sessions, performs health checks, and load-balances across cloud app instances.",
  },
  dc2: {
    id: "dc2",
    x: 500,
    y: 440,
    name: "SECONDARY DC",
    sub: "Backup Region",
    icon: "🏢",
    ip: "dc2.backup.net",
    role: "Disaster Recovery & Hot Standby Region",
    details: "Activated via BGP failover when the primary WAN fiber cut occurs, preserving service uptime.",
  },
  app: {
    id: "app",
    x: 790,
    y: 280,
    name: "CLOUD APP TIER",
    sub: "Node / Container",
    icon: "⚙️",
    ip: "app-svc.cluster",
    role: "Microservices / Express Backend Engine",
    details: "Executes business logic, authenticates requests, processes uploads, and interfaces with SQL DB.",
  },
  db: {
    id: "db",
    x: 920,
    y: 180,
    name: "PRIMARY DB",
    sub: "SQLite WAL Master",
    icon: "🗄️",
    ip: "db-primary.internal",
    role: "ACID Write Authority & Write-Ahead Log",
    details: "Handles master write transactions and asynchronously streams replication WAL events to replica.",
  },
  replica: {
    id: "replica",
    x: 920,
    y: 390,
    name: "REPLICA DB",
    sub: "Async Read Replica",
    icon: "📑",
    ip: "db-replica.internal",
    role: "Read-Only Replica Instance",
    details: "Serves read-heavy traffic and analytics; suffers from replication lag under high network latency.",
  },
};

// Web Audio API Synthesizer for Radar Sonar
function playAudioRadar(type = "packet", enabled = false) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "drop") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "cut") {
      osc.type = "square";
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(980, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.04);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    }
  } catch {
    /* audio blocked or unsupported */
  }
}

export default function PacketMap() {
  const { state, command } = useLab();
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [tracerouteLog, setTracerouteLog] = useState(null);
  const [tracing, setTracing] = useState(false);

  const net = state?.network;
  const links = state?.links || [];
  const down = new Set(net?.failedLinks || []);

  // Latency-scaled speed: lower latency = faster flow
  const speed = Math.max(0.7, (net?.latencyMs || 25) / 50);

  // Generate packet trail indices
  const packetIndices = useMemo(() => Array.from({ length: 8 }, (_, i) => i), [net?.lossPct, net?.latencyMs]);

  if (!net) {
    return (
      <div className="map" style={{ display: "grid", placeItems: "center" }}>
        <span className="mono muted">Initializing radar topology…</span>
      </div>
    );
  }

  const lastMileDown = down.has("user-isp") || down.has("isp-core");
  const primaryWanDown = down.has("core-lb");
  const secondaryUsable = net.secondDcEnabled && !down.has("core-dc2") && !down.has("dc2-lb");

  // Determine active flow path string for SVG animation
  let activeRouteLabel = "Primary WAN Route";
  let activeRouteClass = "ok";
  let activePathD = `M ${NODES.user.x} ${NODES.user.y} L ${NODES.isp.x} ${NODES.isp.y} L ${NODES.core.x} ${NODES.core.y} L ${NODES.lb.x} ${NODES.lb.y} L ${NODES.app.x} ${NODES.app.y}`;

  if (lastMileDown) {
    activeRouteLabel = "TRAFFIC BLOCKED: Last-Mile / Backbone Link Down";
    activeRouteClass = "bad";
    activePathD = `M ${NODES.user.x} ${NODES.user.y} L ${NODES.isp.x} ${NODES.isp.y}`;
  } else if (primaryWanDown && secondaryUsable) {
    activeRouteLabel = "BGP FAILOVER: Route Rerouted via Secondary DC";
    activeRouteClass = "warn";
    activePathD = `M ${NODES.user.x} ${NODES.user.y} L ${NODES.isp.x} ${NODES.isp.y} L ${NODES.core.x} ${NODES.core.y} L ${NODES.dc2.x} ${NODES.dc2.y} L ${NODES.lb.x} ${NODES.lb.y} L ${NODES.app.x} ${NODES.app.y}`;
  } else if (primaryWanDown && net.cdnEnabled) {
    activeRouteLabel = "ORIGIN ISOLATED: Edge CDN Serving Video Reads";
    activeRouteClass = "warn";
    activePathD = `M ${NODES.user.x} ${NODES.user.y} L ${NODES.isp.x} ${NODES.isp.y} L ${NODES.core.x} ${NODES.core.y} L ${NODES.cdn.x} ${NODES.cdn.y}`;
  } else if (primaryWanDown) {
    activeRouteLabel = "OUTAGE: Primary WAN Cut · Origin Unreachable";
    activeRouteClass = "bad";
    activePathD = `M ${NODES.user.x} ${NODES.user.y} L ${NODES.isp.x} ${NODES.isp.y} L ${NODES.core.x} ${NODES.core.y}`;
  }

  const toggleLink = (id) => {
    playAudioRadar("cut", audioEnabled);
    command("/api/network/link", {
      method: "POST",
      body: { id, failed: !down.has(id) },
    });
  };

  // Run Simulated Traceroute Probe across live network topology
  const runTraceroute = async () => {
    if (tracing) return;
    setTracing(true);
    setTracerouteLog([
      `PING app-svc.cluster (10.0.0.1) 56(84) bytes of data:`,
      `[PROBE 1/4] Probing client egress stack...`,
    ]);

    await new Promise((r) => setTimeout(r, 260));
    playAudioRadar("packet", audioEnabled);

    const hops = [];
    hops.push(`PING app-svc.cluster (10.0.0.1) 56(84) bytes of data:`);

    // Hop 1: User -> ISP
    if (down.has("user-isp")) {
      hops.push(` Hop 1: 192.168.1.104 -> * * * Request timed out (Cable Cut: user-isp)`);
      setTracerouteLog([...hops, `[FAILED] Link user-isp severed. Target host unreachable.`]);
      setTracing(false);
      playAudioRadar("drop", audioEnabled);
      return;
    }
    const hop1Ms = (1.2 + Math.random() * 0.8).toFixed(1);
    hops.push(` Hop 1: 192.168.1.104 [User] -> 10.48.0.1 [Local ISP]  ${hop1Ms} ms`);
    setTracerouteLog([...hops, `[PROBE 2/4] Traversing ISP edge gateway...`]);

    await new Promise((r) => setTimeout(r, 260));
    playAudioRadar("packet", audioEnabled);

    // Hop 2: ISP -> Backbone Core
    if (down.has("isp-core")) {
      hops.push(` Hop 2: 10.48.0.1 -> * * * Transit Link Down (Cable Cut: isp-core)`);
      setTracerouteLog([...hops, `[FAILED] ISP gateway transit severed. Core backbone unreachable.`]);
      setTracing(false);
      playAudioRadar("drop", audioEnabled);
      return;
    }
    const hop2Ms = (Math.max(2, net.latencyMs * 0.35) + Math.random() * (net.jitterMs || 2)).toFixed(1);
    hops.push(` Hop 2: 10.48.0.1 [Local ISP] -> AS15169 [Internet Backbone]  ${hop2Ms} ms`);
    setTracerouteLog([...hops, `[PROBE 3/4] Routing through backbone transit...`]);

    await new Promise((r) => setTimeout(r, 280));
    playAudioRadar("packet", audioEnabled);

    // Hop 3: Backbone -> Load Balancer / CDN / DC2
    if (primaryWanDown) {
      if (secondaryUsable) {
        const hopSecMs = (Math.max(5, net.latencyMs * 0.65) + 12.5).toFixed(1);
        hops.push(` Hop 3: AS15169 -> dc2.backup.net [Secondary DC BGP Failover]  ${hopSecMs} ms`);
        hops.push(` Hop 4: dc2.backup.net -> 10.0.0.1 [Load Balancer]  ${(Number(hopSecMs) + 6.2).toFixed(1)} ms`);
      } else if (net.cdnEnabled) {
        hops.push(` Hop 3: AS15169 -> cdn.edge.anycast [Edge CDN POP]  4.8 ms (Origin WAN Cut)`);
        hops.push(` [RESULT] Origin WAN cable severed! Edge CDN cached read response delivered in 4.8 ms.`);
        setTracerouteLog([...hops]);
        setTracing(false);
        return;
      } else {
        hops.push(` Hop 3: AS15169 -> * * * Request timed out (Primary WAN Cable Cut: core-lb)`);
        setTracerouteLog([...hops, `[FAILED] Primary WAN cut & Secondary DC disabled. Origin offline.`]);
        setTracing(false);
        playAudioRadar("drop", audioEnabled);
        return;
      }
    } else {
      const hop3Ms = (Math.max(4, net.latencyMs * 0.8) + Math.random() * (net.jitterMs || 3)).toFixed(1);
      hops.push(` Hop 3: AS15169 [Backbone] -> 10.0.0.1 [Load Balancer]  ${hop3Ms} ms`);
    }

    await new Promise((r) => setTimeout(r, 260));
    playAudioRadar("packet", audioEnabled);

    // Hop 4: LB -> App
    if (down.has("lb-app")) {
      hops.push(` Hop 4: 10.0.0.1 -> * * * 502 Bad Gateway (Internal link cut: lb-app)`);
      setTracerouteLog([...hops, `[FAILED] Cloud App cluster internal connection severed.`]);
      setTracing(false);
      playAudioRadar("drop", audioEnabled);
      return;
    }

    const totalRtt = (net.latencyMs * 2 + (Math.random() * 4 - 2)).toFixed(1);
    hops.push(` Hop 4: 10.0.0.1 [Load Balancer] -> app-svc.cluster [Cloud App]  ${totalRtt} ms`);

    // Packet loss calculation
    const lossDrop = net.lossPct > 0 && Math.random() * 100 < net.lossPct;
    if (lossDrop) {
      hops.push(` [PACKET LOSS] 1 probe packet dropped by network impairment (${net.lossPct}% loss).`);
      hops.push(` --- 1 packet transmitted, 0 received, 100% loss during probe burst ---`);
      playAudioRadar("drop", audioEnabled);
    } else {
      hops.push(` --- 1 packets transmitted, 1 received, 0% loss, RTT ~${totalRtt} ms ---`);
      hops.push(` [SUCCESS] End-to-end cloud round-trip completed successfully.`);
      playAudioRadar("packet", audioEnabled);
    }

    setTracerouteLog(hops);
    setTracing(false);
  };

  return (
    <div className="map" aria-label="Interactive Network Weather Topology">
      {/* 100% SVG Layout: Guarantees Pixel-Perfect Alignment on All Screen Sizes */}
      <svg
        viewBox="0 0 1000 520"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        <defs>
          {/* Subtle radar range rings */}
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.09" />
            <stop offset="60%" stopColor="var(--cyan)" stopOpacity="0.02" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Sweeping Radar Beam Gradient */}
          <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
          </linearGradient>

          {/* Node Glow Filters */}
          <filter id="glowCyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="glowRed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Radar Range Rings & Crosshairs */}
        <circle cx="500" cy="260" r="230" fill="url(#radarGlow)" stroke="rgba(0, 240, 255, 0.08)" strokeWidth="1" />
        <circle cx="500" cy="260" r="160" fill="none" stroke="rgba(0, 240, 255, 0.07)" strokeWidth="1" strokeDasharray="3 5" />
        <circle cx="500" cy="260" r="80" fill="none" stroke="rgba(0, 240, 255, 0.09)" strokeWidth="1" />
        <line x1="0" y1="260" x2="1000" y2="260" stroke="rgba(0, 240, 255, 0.05)" strokeWidth="1" />
        <line x1="500" y1="0" x2="500" y2="520" stroke="rgba(0, 240, 255, 0.05)" strokeWidth="1" />

        {/* Rotating Radar Sweep Beam */}
        <g>
          <polygon points="500,260 410,30 500,30" fill="url(#sweepGrad)" opacity="0.18">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 500 260"
              to="360 500 260"
              dur="7s"
              repeatCount="indefinite"
            />
          </polygon>
          <line x1="500" y1="260" x2="500" y2="30" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.8">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 500 260"
              to="360 500 260"
              dur="7s"
              repeatCount="indefinite"
            />
          </line>
        </g>

        {/* Physical Links */}
        {links.map((l) => {
          const a = NODES[l.from];
          const b = NODES[l.to];
          if (!a || !b) return null;
          const isDead = down.has(l.id);
          const isCdn = l.id === "core-cdn";
          const isDc2 = l.id === "core-dc2" || l.id === "dc2-lb";
          const isDim = (isCdn && !net.cdnEnabled) || (isDc2 && !net.secondDcEnabled);
          const isFailoverActive = isDc2 && secondaryUsable && primaryWanDown && !isDead;
          const isHovered = hoveredLink === l.id;

          const strokeColor = isDead
            ? "var(--red)"
            : isFailoverActive
            ? "#a855f7"
            : isDim
            ? "rgba(100, 116, 139, 0.3)"
            : isHovered
            ? "#38bdf8"
            : "var(--cyan)";

          const strokeW = isDead ? 2.5 : isHovered ? 3.5 : isFailoverActive ? 3 : isDim ? 1.2 : 2.2;
          const strokeDash = isDead ? "6 6" : isDim ? "2 6" : "0";

          return (
            <g
              key={l.id}
              onClick={() => toggleLink(l.id)}
              onMouseEnter={() => setHoveredLink(l.id)}
              onMouseLeave={() => setHoveredLink(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Invisible wider hit area for easy clicking on mobile / desktop */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="26" />

              {/* Visible link cable */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={strokeColor}
                strokeWidth={strokeW}
                strokeDasharray={strokeDash}
                opacity={isDim ? 0.4 : 0.9}
              />

              {/* Severed cable indicator badge */}
              {isDead && (
                <g transform={`translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`}>
                  <rect x="-24" y="-11" width="48" height="22" rx="4" fill="rgba(15, 2, 8, 0.94)" stroke="var(--red)" strokeWidth="1.5" />
                  <text fill="var(--red)" fontSize="10" fontFamily="var(--mono)" fontWeight="bold" textAnchor="middle" dy="4">
                    ⚡ CUT
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Replication Stream Link Indicator */}
        {net.replicaEnabled && !down.has("db-replica") && (
          <line
            x1={NODES.db.x}
            y1={NODES.db.y}
            x2={NODES.replica.x}
            y2={NODES.replica.y}
            stroke="var(--green)"
            strokeWidth="1.8"
            strokeDasharray="4 4"
            opacity="0.65"
          />
        )}

        {/* Animated Moving Packets along Active Route */}
        {!lastMileDown &&
          packetIndices.map((i) => {
            const isDropped = net.lossPct > 0 && i % 3 === 0 && (i * 13) % 100 < net.lossPct * 1.5;
            const packetColor = isDropped ? "var(--red)" : "var(--green)";
            const radius = isDropped ? 4 : 5.5;

            return (
              <circle key={i} r={radius} fill={packetColor} filter="url(#glowCyan)">
                <animateMotion
                  dur={`${speed + i * 0.16}s`}
                  repeatCount="indefinite"
                  begin={`${i * 0.2}s`}
                  path={activePathD}
                />
              </circle>
            );
          })}

        {/* Topology Nodes */}
        {Object.values(NODES).map((node) => {
          const involved = links.filter((l) => l.from === node.id || l.to === node.id);
          const isNodeCut = involved.length > 0 && involved.every((l) => down.has(l.id)) && node.id !== "user";
          const isCdn = node.id === "cdn";
          const isDc2 = node.id === "dc2";
          const isReplica = node.id === "replica";
          const isDim = (isCdn && !net.cdnEnabled) || (isDc2 && !net.secondDcEnabled) || (isReplica && !net.replicaEnabled);

          const ringColor = isNodeCut
            ? "var(--red)"
            : isDc2 && secondaryUsable
            ? "#a855f7"
            : isDim
            ? "rgba(100, 116, 139, 0.4)"
            : "var(--cyan)";

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => setSelectedNode(node)}
              style={{ cursor: "pointer", opacity: isDim ? 0.45 : 1 }}
            >
              {/* Outer Pulse Ring */}
              <circle r="25" fill="none" stroke={ringColor} strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />

              {/* Node Center Base */}
              <circle
                r="19"
                fill="rgba(8, 16, 32, 0.95)"
                stroke={ringColor}
                strokeWidth="2.5"
                filter={isNodeCut ? "url(#glowRed)" : "url(#glowCyan)"}
              />

              {/* Node Icon Emoji */}
              <text textAnchor="middle" dy="5" fontSize="14" userSelect="none">
                {node.icon}
              </text>

              {/* Main Node Label */}
              <text
                textAnchor="middle"
                dy="35"
                fill="var(--ink)"
                fontSize="11"
                fontFamily="var(--mono)"
                fontWeight="700"
                letterSpacing="0.04em"
              >
                {node.name}
              </text>

              {/* Sub-label role */}
              <text textAnchor="middle" dy="48" fill="var(--muted)" fontSize="9" fontFamily="var(--mono)">
                {node.sub}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Top HUD: Real-Time Active Route Banner + Action Controls */}
      <div
        className="mono"
        style={{
          position: "absolute",
          top: 12,
          right: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          zIndex: 20,
        }}
      >
        {/* Sonar Audio Toggle */}
        <button
          className="btn ghost"
          style={{
            padding: "5px 10px",
            fontSize: "0.75rem",
            background: "rgba(3, 7, 18, 0.85)",
            border: `1px solid ${audioEnabled ? "var(--cyan)" : "var(--stroke-subtle)"}`,
            color: audioEnabled ? "var(--cyan)" : "var(--muted)",
          }}
          onClick={() => {
            setAudioEnabled(!audioEnabled);
            if (!audioEnabled) playAudioRadar("packet", true);
          }}
          title="Toggle synthesized Web Audio sonar chirps"
        >
          {audioEnabled ? "🔊 Sonar Audio: ON" : "🔈 Sonar Audio: OFF"}
        </button>

        {/* Live Ping / Traceroute Probe Trigger */}
        <button
          className="btn primary"
          style={{
            padding: "5px 12px",
            fontSize: "0.75rem",
          }}
          onClick={runTraceroute}
          disabled={tracing}
        >
          {tracing ? "Probing Route…" : "▶ Send Ping Probe"}
        </button>

        {/* Active Route Status Badge */}
        <div
          style={{
            background: "rgba(3, 7, 18, 0.88)",
            padding: "6px 14px",
            borderRadius: 8,
            border: `1px solid ${activeRouteClass === "bad" ? "var(--red)" : activeRouteClass === "warn" ? "var(--amber)" : "var(--cyan)"}`,
            fontSize: "0.78rem",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 0 16px rgba(0, 0, 0, 0.6)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: activeRouteClass === "bad" ? "var(--red)" : activeRouteClass === "warn" ? "var(--amber)" : "var(--green)",
              boxShadow: `0 0 8px ${activeRouteClass === "bad" ? "var(--red)" : activeRouteClass === "warn" ? "var(--amber)" : "var(--green)"}`,
            }}
          />
          <span>
            Route: <strong>{activeRouteLabel}</strong>
          </span>
        </div>
      </div>

      {/* Floating Interactive Traceroute Terminal HUD */}
      {tracerouteLog && (
        <div
          className="panel"
          style={{
            position: "absolute",
            top: 55,
            right: 14,
            width: "min(460px, 90vw)",
            maxHeight: 260,
            overflowY: "auto",
            background: "rgba(2, 6, 16, 0.95)",
            border: "1px solid var(--cyan)",
            boxShadow: "0 0 24px rgba(0, 240, 255, 0.25)",
            padding: "10px 14px",
            zIndex: 35,
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="kicker" style={{ margin: 0, color: "var(--cyan)" }}>
              ICMP / TCP Traceroute Terminal
            </span>
            <button
              className="btn ghost"
              style={{ padding: "0 5px", fontSize: "0.72rem" }}
              onClick={() => setTracerouteLog(null)}
            >
              ✕
            </button>
          </div>
          <div className="mono" style={{ fontSize: "0.74rem", lineHeight: 1.45, color: "var(--ink)" }}>
            {tracerouteLog.map((line, idx) => (
              <div
                key={idx}
                style={{
                  color: line.includes("[FAILED]") || line.includes("timed out") || line.includes("LOSS")
                    ? "var(--red)"
                    : line.includes("[SUCCESS]")
                    ? "var(--green)"
                    : line.includes("BGP Failover") || line.includes("Anycast")
                    ? "var(--amber)"
                    : "var(--ink)",
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Node Inspection Popup */}
      {selectedNode && (
        <div
          className="panel"
          style={{
            position: "absolute",
            top: 55,
            left: 20,
            maxWidth: 320,
            background: "rgba(3, 9, 22, 0.96)",
            border: "1px solid var(--cyan)",
            boxShadow: "0 0 25px rgba(0, 240, 255, 0.25)",
            padding: 14,
            zIndex: 30,
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <strong style={{ color: "var(--cyan)", fontSize: "0.95rem" }}>
              {selectedNode.icon} {selectedNode.name}
            </strong>
            <button className="btn ghost" style={{ padding: "1px 6px", fontSize: "0.72rem" }} onClick={() => setSelectedNode(null)}>
              ✕
            </button>
          </div>
          <div className="mono" style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "4px 0" }}>
            Role: <strong>{selectedNode.role || selectedNode.sub}</strong>
          </div>
          <div className="mono" style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "4px 0" }}>
            Network Address: <strong>{selectedNode.ip}</strong>
          </div>
          <div className="mono" style={{ fontSize: "0.75rem", margin: "6px 0 4px", color: down.has(selectedNode.id) ? "var(--red)" : "var(--green)" }}>
            Operational State: {down.has(selectedNode.id) ? "DEGRADED / SEVERED" : "ONLINE & ROUTING"}
          </div>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", margin: "6px 0 0", lineHeight: 1.4 }}>
            {selectedNode.details}
          </p>
        </div>
      )}

      {/* Bottom HUD: One-Click Cable Cut Toolbar */}
      <div
        className="row"
        style={{
          position: "absolute",
          bottom: 10,
          left: 12,
          right: 12,
          background: "rgba(3, 7, 18, 0.88)",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid var(--stroke-subtle)",
          justifyContent: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span className="mono" style={{ fontSize: "0.74rem", color: "var(--muted)", marginRight: 6 }}>
          Click link cable or button to cut/restore:
        </span>
        {links.map((l) => {
          const isDead = down.has(l.id);
          return (
            <button
              key={l.id}
              className={`btn ${isDead ? "danger" : "ghost"}`}
              style={{ padding: "3px 8px", fontSize: "0.72rem", borderRadius: 6 }}
              onClick={() => toggleLink(l.id)}
            >
              {isDead ? `Restore ${l.label}` : `Cut ${l.label}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
