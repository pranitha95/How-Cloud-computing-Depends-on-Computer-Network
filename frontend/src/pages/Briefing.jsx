import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PacketMap from "../components/PacketMap.jsx";
import { api } from "../api.js";
import { useLab } from "../LabContext.jsx";

export default function Briefing() {
  const { state, patchNetwork, command, healthHistory, setNetwork } = useLab();
  const net = state?.network;
  const [presetName, setPresetName] = useState("");
  const [custom, setCustom] = useState([]);
  const sliderTimer = useRef();

  useEffect(() => {
    api("/api/presets")
      .then((d) => setCustom(d.custom || []))
      .catch(() => {});
  }, []);

  if (!net) {
    return (
      <div className="page">
        <p className="muted mono" style={{ textAlign: "center", padding: "60px 0" }}>
          Connecting to Cloud Under Stress telemetry engine…
        </p>
      </div>
    );
  }

  const slide = (partial) => {
    setNetwork(partial);
    clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(() => {
      command("/api/network", { method: "PUT", body: { ...net, ...partial } }).catch(() => {});
    }, 80);
  };

  const score = state.health?.score ?? 0;
  const parts = state.health?.parts || {};
  const healthClass = score >= 70 ? "" : score >= 40 ? "warn" : "bad";
  const comment = state.commentary || {};

  return (
    <div className="page">
      {/* BRIEFING HEADER */}
      <section className="hero" style={{ padding: "16px 8px 12px" }}>
        <div>
          <div className="kicker">
            <span className="radar-dot" style={{ width: 8, height: 8, background: "var(--cyan)", borderRadius: "50%", display: "inline-block" }} />
            Mission Briefing & Live Cockpit
          </div>
          <h1 style={{ marginTop: 8, fontSize: "clamp(2rem, 4vw, 3.4rem)" }}>
            The cloud is only as reliable as the <span style={{ color: "var(--cyan)" }}>network</span> connecting it.
          </h1>
          <p className="lede" style={{ fontSize: "1.02rem" }}>
            Cloud Under Stress is an interactive educational laboratory. Perturb network conditions below—drag latency, drop packets,
            throttle bandwidth, or cut physical cables—and directly observe live cloud services degrade and recover in real time.
          </p>
        </div>

        {/* QUICK STATUS SUMMARY CARD */}
        <div className="panel" style={{ border: "1px solid var(--stroke)", padding: 16 }}>
          <div className="kicker">Interactive Control Status</div>
          <div className="row mono" style={{ justifyContent: "space-between", margin: "10px 0 6px", fontSize: "0.82rem" }}>
            <span>Cloud Health: <strong style={{ color: score > 70 ? "var(--green)" : score > 40 ? "var(--amber)" : "var(--red)" }}>{score}/100</strong></span>
            <span>Video: <strong style={{ color: "var(--cyan)" }}>{state.lastVideoQuality}</strong></span>
            <span>Replica: <strong>{state.replicaLagMs} ms lag</strong></span>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button
              className="btn danger"
              style={{ fontSize: "0.8rem", padding: "6px 14px", flex: 1 }}
              onClick={() => command("/api/network/reset", { method: "POST", body: {} })}
            >
              Reset Network
            </button>
            <button
              className={`btn ${net.chaos ? "danger" : ""}`}
              style={{ fontSize: "0.8rem", padding: "6px 14px", flex: 1 }}
              onClick={() => command("/api/network/chaos", { method: "POST", body: { on: !net.chaos } })}
            >
              {net.chaos ? "Stop Chaos" : "Chaos Mode"}
            </button>
          </div>
        </div>
      </section>

      {/* MAIN SIMULATION SECTION: TOPOLOGY MAP + HEALTH GAUGE */}
      <div className="grid-lab" style={{ marginTop: 12 }}>
        {/* Interactive Network Topology Radar */}
        <PacketMap />

        {/* Live Cloud Health Score & Telemetry Cockpit */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Live Cloud Health Telemetry</div>
            <div className="health-gauge-wrap" style={{ padding: "6px 0" }}>
              <div className={`health ${healthClass}`}>{score}</div>
              <div className="mono" style={{ marginTop: 6, fontSize: "0.82rem" }}>
                Cloud Health Score (0–100)
              </div>
            </div>

            {/* Dynamic Plain-English Explanation */}
            <div className={`comment ${comment.tone || "ok"}`} style={{ padding: "10px 12px", margin: "8px 0" }}>
              <strong style={{ fontSize: "0.92rem" }}>{comment.title}</strong>
              <p style={{ margin: "3px 0 0", fontSize: "0.85rem" }}>{comment.body}</p>
            </div>

            {/* Health Score Penalties Breakdown */}
            <div className="breakdown-bars">
              <div className="breakdown-bar">
                <span>Latency</span>
                <strong>-{parts.latency ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Packet Loss</span>
                <strong>-{parts.loss ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Bandwidth</span>
                <strong>-{parts.bandwidth ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Cable Cuts</span>
                <strong>-{parts.links ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Replica Lag</span>
                <strong>-{parts.replica ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Redundancy</span>
                <strong style={{ color: "var(--cyan)" }}>+{(parts.cdnBonus || 0) + (parts.dc2Bonus || 0)} pts</strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block" }}>
              Health Telemetry Sparkline (Last 48s)
            </label>
            <HealthSpark values={healthHistory} />
            <div className="row mono" style={{ justifyContent: "space-between", marginTop: 6, fontSize: "0.76rem" }}>
              <span>Goodput: {state.lastGoodputKbps} kbps</span>
              <span>Replica Lag: {state.replicaLagMs} ms</span>
              <span>
                Origin:{" "}
                <strong style={{ color: state.originUp ? "var(--green)" : "var(--red)" }}>
                  {state.originUp ? (state.activeRoute === "secondary-dc" ? "SECONDARY DC" : "ONLINE") : "OFFLINE"}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* NETWORK CONTROLS & PRESETS */}
      <div className="grid-lab" style={{ marginTop: 16 }}>
        {/* Network Parameter Sliders */}
        <div className="panel sliders">
          <div className="kicker">Network Impairment Controls</div>
          <h3 style={{ margin: "4px 0 8px" }}>Live Parameter Sliders</h3>

          <label>
            <span>Network Latency (RTT Delay)</span>
            <span className="val">{net.latencyMs} ms</span>
          </label>
          <input
            type="range"
            min={1}
            max={600}
            value={net.latencyMs}
            onChange={(e) => slide({ latencyMs: Number(e.target.value) })}
          />

          <label>
            <span>Jitter (Delay Variance)</span>
            <span className="val">{net.jitterMs} ms</span>
          </label>
          <input
            type="range"
            min={0}
            max={150}
            value={net.jitterMs}
            onChange={(e) => slide({ jitterMs: Number(e.target.value) })}
          />

          <label>
            <span>Packet Loss Percentage</span>
            <span className="val">{net.lossPct}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={60}
            step={0.5}
            value={net.lossPct}
            onChange={(e) => slide({ lossPct: Number(e.target.value) })}
          />

          <label>
            <span>Available Bandwidth</span>
            <span className="val">{(net.bandwidthKbps / 1000).toFixed(1)} Mbps ({net.bandwidthKbps} kbps)</span>
          </label>
          <input
            type="range"
            min={128}
            max={80000}
            step={256}
            value={net.bandwidthKbps}
            onChange={(e) => slide({ bandwidthKbps: Number(e.target.value) })}
          />

          {/* Infrastructure Toggles */}
          <div
            className="row"
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(0, 0, 0, 0.3)",
              borderRadius: 10,
              border: "1px solid var(--stroke-subtle)",
              gap: 16,
            }}
          >
            <label style={{ margin: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={net.cdnEnabled}
                onChange={(e) => patchNetwork({ cdnEnabled: e.target.checked })}
              />
              <span>Edge CDN Enabled</span>
            </label>

            <label style={{ margin: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={net.secondDcEnabled}
                onChange={(e) => patchNetwork({ secondDcEnabled: e.target.checked })}
              />
              <span>Secondary DC Enabled</span>
            </label>

            <label style={{ margin: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={net.replicaEnabled}
                onChange={(e) => patchNetwork({ replicaEnabled: e.target.checked })}
              />
              <span>DB Replica Sync Active</span>
            </label>
          </div>
        </div>

        {/* Presets & Storm Save */}
        <div className="panel">
          <div className="kicker">Calibrated Scenarios</div>
          <h3 style={{ margin: "4px 0 8px" }}>Network Presets</h3>
          <p className="lede" style={{ fontSize: "0.88rem", marginBottom: 10 }}>
            Click any preset to immediately load real-world network conditions:
          </p>

          <div className="row" style={{ gap: 8 }}>
            {Object.entries(state.presets || {}).map(([key, p]) => (
              <button
                key={key}
                className="btn"
                style={{ fontSize: "0.82rem", padding: "6px 12px" }}
                onClick={() => command("/api/network/preset", { method: "POST", body: { key } })}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <label className="mono" style={{ fontSize: "0.78rem", color: "var(--muted)", display: "block", marginBottom: 4 }}>
              Save Current Network Conditions as Named Preset:
            </label>
            <div className="row">
              <input
                style={{ flex: 1 }}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. Hostile Wi-Fi Storm"
              />
              <button
                className="btn primary"
                style={{ fontSize: "0.82rem" }}
                onClick={async () => {
                  if (presetName.trim().length < 2) return;
                  await api("/api/presets", { method: "POST", body: { name: presetName.trim() } });
                  setPresetName("");
                  setCustom((await api("/api/presets")).custom || []);
                }}
              >
                Save
              </button>
            </div>
          </div>

          {custom.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--muted)" }}>Custom Presets:</span>
              <div className="row" style={{ marginTop: 4, gap: 6 }}>
                {custom.map((p) => (
                  <button
                    key={p.id}
                    className="btn ghost"
                    style={{ fontSize: "0.76rem", padding: "3px 8px" }}
                    onClick={() => command(`/api/presets/${p.id}/apply`, { method: "POST", body: {} })}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CLOUD SERVICES TEST BAYS */}
      <div className="services" style={{ marginTop: 16 }}>
        <UploadBay />
        <VideoBay />
        <ReplicaBay />
      </div>

      {/* JUMP MODULES CARDS */}
      <div style={{ marginTop: 32 }}>
        <div className="kicker">Extended Laboratory Modules</div>
        <h2>Dive Deeper into Cloud Protocols</h2>
        <div className="cards" style={{ marginTop: 14 }}>
          {[
            {
              title: "6 Guided Missions",
              path: "/missions",
              kicker: "Challenges",
              desc: "Test your skills with 6 structured engineering missions evaluated against live simulation state.",
            },
            {
              title: "The Hidden Path of a Request",
              path: "/anatomy",
              kicker: "7-Stage Trace",
              desc: "Inspect DNS, TCP 3-way handshake, TLS exchange, load balancing, cloud compute, and DB writes.",
            },
            {
              title: "Concepts Arcade",
              path: "/concepts",
              kicker: "13 Mini-Lessons",
              desc: "13 interactive cards covering Latency, Loss, Congestion, Bufferbloat, Failover, CDNs, and Replication.",
            },
            {
              title: "Experiment History & CSV",
              path: "/experiments",
              kicker: "Data Science",
              desc: "Record live experiment runs, inspect multi-metric telemetry graphs, and export CSV files for reports.",
            },
            {
              title: "Architecture & Viva Guide",
              path: "/how",
              kicker: "System Design",
              desc: "Complete documentation of the stack (React + Express + Node SQLite), formulas, and viva defense answers.",
            },
          ].map((item) => (
            <Link key={item.path} to={item.path} className="panel mission">
              <div className="kicker">{item.kicker}</div>
              <h3 style={{ color: "var(--cyan)", margin: "4px 0" }}>{item.title}</h3>
              <p className="lede" style={{ fontSize: "0.9rem", flex: 1, margin: "4px 0 8px" }}>{item.desc}</p>
              <span className="mono" style={{ color: "var(--cyan)", fontSize: "0.8rem" }}>Launch module →</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function HealthSpark({ values }) {
  if (!values || values.length < 2) return null;
  const w = 360;
  const h = 48;
  const d = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - (v / 100) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="48" aria-label="Live health sparkline">
      <path d={d} fill="none" stroke="var(--cyan)" strokeWidth="2.5" />
    </svg>
  );
}

function UploadBay() {
  const [status, setStatus] = useState("Select a file or send a test payload to observe TCP transfer dynamics.");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

  const refresh = () => api("/api/uploads").then(setLog).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  async function sendFile(file) {
    setBusy(true);
    setStatus(`Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB) through shaped network…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const row = await api("/api/upload", { method: "POST", body: fd });
      setStatus(
        row.ok
          ? `Upload Complete! Arrived in ~${row.totalMs} ms with ${row.retries} TCP retransmissions.`
          : `Upload Failed: ${row.error}`
      );
      refresh();
    } catch (e) {
      setStatus(`Upload Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendBlob(bytes, label) {
    setBusy(true);
    setStatus(`Sending ${label} test payload through simulated network…`);
    try {
      const row = await api("/api/upload", { method: "POST", body: { syntheticBytes: bytes } });
      setStatus(
        row.ok
          ? `${label} Transfer Complete! Duration: ~${row.totalMs} ms · Retries: ${row.retries} · Throughput: ~${Math.round(
              (bytes * 8) / (row.totalMs / 1000) / 1024
            )} kbps`
          : `Transfer Aborted: ${row.error}`
      );
      refresh();
    } catch (e) {
      setStatus(`Transfer Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div className="kicker">Service A</div>
        <h3 style={{ margin: "4px 0" }}>Cloud File Upload</h3>
        <p className="lede" style={{ fontSize: "0.88rem", marginBottom: 10 }}>
          {status}
        </p>

        <input
          type="file"
          disabled={busy}
          style={{ marginBottom: 10 }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendFile(f);
          }}
        />

        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn"
            style={{ fontSize: "0.8rem", padding: "5px 12px" }}
            disabled={busy}
            onClick={() => sendBlob(200000, "200 KB")}
          >
            Send 200 KB Blob
          </button>
          <button
            className="btn"
            style={{ fontSize: "0.8rem", padding: "5px 12px" }}
            disabled={busy}
            onClick={() => sendBlob(1000000, "1 MB")}
          >
            Send 1 MB Blob
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Recent Upload Telemetry:</span>
        <div style={{ maxHeight: 95, overflowY: "auto", marginTop: 4 }}>
          {log.slice(0, 3).map((u) => (
            <div
              key={u.id}
              className="mono row"
              style={{
                justifyContent: "space-between",
                padding: "2px 0",
                borderBottom: "1px solid var(--stroke-subtle)",
                fontSize: "0.72rem",
              }}
            >
              <span>{u.filename}</span>
              <span style={{ color: u.ok ? "var(--green)" : "var(--red)" }}>
                {u.ok ? "OK" : "FAIL"} ({u.retries} retries, {u.delay_ms + u.transfer_ms} ms)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VideoBay() {
  const { state } = useLab();
  const [buffer, setBuffer] = useState(4.5);
  const q = state?.lastVideoQuality || "720p";
  const offline = q === "offline" || state?.videoUp === false;

  useEffect(() => {
    let stop = false;
    async function loop() {
      while (!stop) {
        try {
          const quality = offline ? "240p" : q;
          const res = await fetch(`/api/video/chunk?quality=${quality}`);
          if (!res.ok) throw new Error("chunk");
          await res.arrayBuffer();
          setBuffer((b) => Math.min(8, b + 1.2));
        } catch {
          setBuffer((b) => Math.max(0, b - 1.5));
        }
        await new Promise((r) => setTimeout(r, 900));
      }
    }
    loop();
    return () => {
      stop = true;
    };
  }, [q, offline]);

  const starving = offline || buffer < 1 || q === "240p";

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div className="kicker">Service B</div>
        <h3 style={{ margin: "4px 0" }}>Adaptive Video Stream</h3>

        <div className="screen" style={{ height: 130 }}>
          <div className="bars">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 0.1}s`, opacity: starving ? 0.25 : 1 }} />
            ))}
          </div>
          <div className="badge" style={{ color: starving ? "var(--amber)" : "var(--cyan)" }}>
            {offline ? "OFFLINE" : starving ? "BUFFERING…" : `STREAMING · ${q}`}
          </div>
        </div>

        <label className="mono" style={{ fontSize: "0.76rem", color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
          <span>Client Playhead Buffer</span>
          <span>{buffer.toFixed(1)} / 8.0 sec</span>
        </label>
        <div className="progress">
          <div
            style={{
              width: `${(buffer / 8) * 100}%`,
              background: buffer < 1.5 ? "var(--red)" : buffer < 3.5 ? "var(--amber)" : "var(--cyan)",
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <p className="mono" style={{ fontSize: "0.74rem", margin: 0, color: "var(--muted)" }}>
          {offline
            ? "Origin and Edge CDN are both severed. Video chunk pipeline dead."
            : `Adaptive Bitrate selected ${q} based on measured goodput (${state?.lastGoodputKbps} kbps).`}
        </p>
      </div>
    </div>
  );
}

function ReplicaBay() {
  const [payload, setPayload] = useState("User #4092 committed order updates");
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState("");

  async function refresh() {
    try {
      setStatus(await api("/api/db/status"));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div className="kicker">Service C</div>
        <h3 style={{ margin: "4px 0" }}>Cloud Database Replication</h3>
        <p className="mono" style={{ fontSize: "0.78rem", margin: "4px 0 8px" }}>
          Replication Lag:{" "}
          <strong style={{ color: (status?.replicaLagMs || 0) > 1000 ? "var(--amber)" : "var(--cyan)" }}>
            {status?.replicaLagMs >= 9999 ? "∞ (Link Cut)" : `${status?.replicaLagMs ?? 0} ms`}
          </strong>{" "}
          · Pending: {status?.pending ?? 0} ·{" "}
          <span style={{ color: status?.inSync ? "var(--green)" : "var(--amber)" }}>
            {status?.inSync ? "IN SYNC" : "OUT OF SYNC"}
          </span>
        </p>

        <textarea
          rows={2}
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder="Enter record payload"
        />

        <button
          className="btn primary"
          style={{ marginTop: 6, width: "100%", fontSize: "0.8rem", padding: "6px" }}
          onClick={async () => {
            try {
              await api("/api/db/write", { method: "POST", body: { body: payload } });
              setMsg("Committed to Primary DB. Propagating to replica over network link…");
              refresh();
            } catch (e) {
              setMsg(`Write rejected: ${e.message}`);
            }
          }}
        >
          Write to Cloud DB
        </button>
        {msg && <p className="mono" style={{ fontSize: "0.72rem", margin: "4px 0 0", color: "var(--cyan)" }}>{msg}</p>}
      </div>

      <div style={{ marginTop: 10 }}>
        <span className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Latest DB Records:</span>
        <div style={{ maxHeight: 85, overflowY: "auto", marginTop: 4 }}>
          {status?.records?.slice(0, 3).map((r) => (
            <div
              key={r.id}
              className="mono row"
              style={{
                justifyContent: "space-between",
                padding: "2px 0",
                borderBottom: "1px solid var(--stroke-subtle)",
                fontSize: "0.7rem",
              }}
            >
              <span>#{r.id} {r.body.slice(0, 18)}…</span>
              <span style={{ color: r.replica ? "var(--green)" : "var(--amber)" }}>
                {r.replica ? `Replicated (+${r.replica.lag_ms}ms)` : "Pending Sync"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
