import { useEffect, useRef, useState } from "react";
import PacketMap from "../components/PacketMap.jsx";
import { api } from "../api.js";
import { useLab } from "../LabContext.jsx";

export default function Lab() {
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
        <p className="muted">Connecting to Cloud Under Stress telemetry engine…</p>
      </div>
    );
  }

  const slide = (partial) => {
    setNetwork(partial);
    clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(() => {
      command("/api/network", { method: "PUT", body: { ...net, ...partial } }).catch(() => {});
    }, 90);
  };

  const score = state.health?.score ?? 0;
  const parts = state.health?.parts || {};
  const healthClass = score >= 70 ? "" : score >= 40 ? "warn" : "bad";
  const comment = state.commentary || {};

  return (
    <div className="page">
      {/* Header & Controls */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="kicker">Interactive Stress Lab</div>
          <h2>Hurt the network. Watch the cloud flinch.</h2>
        </div>
        <div className="row">
          <button
            className="btn danger"
            onClick={() => command("/api/network/reset", { method: "POST", body: {} })}
            title="Reset all network parameters back to pristine healthy state"
          >
            Reset Network
          </button>
          <button
            className={`btn ${net.chaos ? "danger" : ""}`}
            onClick={() => command("/api/network/chaos", { method: "POST", body: { on: !net.chaos } })}
          >
            {net.chaos ? "Stop Chaos Mode" : "Chaos Mode"}
          </button>
        </div>
      </div>

      {/* TOP ROW: Live Topology + Health Gauge */}
      <div className="grid-lab">
        <PacketMap />

        <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Telemetry Telemetry</div>
            <div className="health-gauge-wrap">
              <div className={`health ${healthClass}`}>{score}</div>
              <div className="mono" style={{ marginTop: 8, fontSize: "0.85rem" }}>
                Cloud Health Score (0–100)
              </div>
            </div>

            {/* Dynamic Plain-English Explanation */}
            <div className={`comment ${comment.tone || "ok"}`}>
              <strong>{comment.title}</strong>
              <p style={{ margin: "4px 0 0" }}>{comment.body}</p>
            </div>

            {/* Health Score Breakdown Penalties */}
            <div className="breakdown-bars">
              <div className="breakdown-bar">
                <span>Latency Penalty</span>
                <strong>-{parts.latency ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Loss Penalty</span>
                <strong>-{parts.loss ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Bandwidth Penalty</span>
                <strong>-{parts.bandwidth ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Link Failure</span>
                <strong>-{parts.links ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Replica Lag</span>
                <strong>-{parts.replica ?? 0} pts</strong>
              </div>
              <div className="breakdown-bar">
                <span>Redundancy Bonus</span>
                <strong style={{ color: "var(--cyan)" }}>
                  +{(parts.cdnBonus || 0) + (parts.dc2Bonus || 0)} pts
                </strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label className="mono" style={{ fontSize: "0.74rem", color: "var(--muted)", display: "block" }}>
              Health Telemetry History (Last 48s)
            </label>
            <HealthSpark values={healthHistory} />
            <div className="row mono" style={{ justifyContent: "space-between", marginTop: 8, fontSize: "0.76rem" }}>
              <span>Goodput: {state.lastGoodputKbps} kbps</span>
              <span>Replication Lag: {state.replicaLagMs} ms</span>
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

      {/* MIDDLE ROW: Sliders + Presets */}
      <div className="grid-lab" style={{ marginTop: 20 }}>
        {/* Network Parameter Sliders */}
        <div className="panel sliders">
          <div className="kicker">Network Controls</div>
          <h3>Inject Network Impairments</h3>

          <label>
            <span>Network Latency (RTT Base)</span>
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
            <span>Jitter (Packet Variance)</span>
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
              marginTop: 16,
              padding: "12px",
              background: "rgba(0, 0, 0, 0.3)",
              borderRadius: 12,
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
          <div className="kicker">Standard Scenarios</div>
          <h3>Network Presets</h3>
          <p className="lede" style={{ fontSize: "0.92rem", marginBottom: 12 }}>
            Simulate real-world network environments with calibrated parameters:
          </p>

          <div className="row" style={{ gap: 8 }}>
            {Object.entries(state.presets || {}).map(([key, p]) => (
              <button
                key={key}
                className="btn"
                style={{ fontSize: "0.82rem", padding: "6px 14px" }}
                onClick={() => command("/api/network/preset", { method: "POST", body: { key } })}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <label className="mono" style={{ fontSize: "0.82rem", color: "var(--muted)", display: "block", marginBottom: 6 }}>
              Save Current Network Conditions as Custom Preset:
            </label>
            <div className="row">
              <input
                style={{ flex: 1 }}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., Campus Fiber Cut"
              />
              <button
                className="btn primary"
                onClick={async () => {
                  if (presetName.trim().length < 2) return;
                  await api("/api/presets", { method: "POST", body: { name: presetName.trim() } });
                  setPresetName("");
                  setCustom((await api("/api/presets")).custom || []);
                }}
              >
                Save Preset
              </button>
            </div>
          </div>

          {custom.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <span className="mono" style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Custom Presets:</span>
              <div className="row" style={{ marginTop: 6, gap: 6 }}>
                {custom.map((p) => (
                  <button
                    key={p.id}
                    className="btn ghost"
                    style={{ fontSize: "0.78rem", padding: "4px 10px" }}
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

      {/* BOTTOM ROW: The 3 Core Cloud Services */}
      <div className="services">
        <UploadBay />
        <VideoBay />
        <ReplicaBay />
      </div>
    </div>
  );
}

function HealthSpark({ values }) {
  if (!values || values.length < 2) return null;
  const w = 360;
  const h = 50;
  const d = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - (v / 100) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="50" aria-label="Live health sparkline">
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
        <h3>Cloud File Upload</h3>
        <p className="lede" style={{ fontSize: "0.92rem", marginBottom: 12 }}>
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
            style={{ fontSize: "0.82rem", padding: "6px 12px" }}
            disabled={busy}
            onClick={() => sendBlob(200000, "200 KB")}
          >
            Send 200 KB Blob
          </button>
          <button
            className="btn"
            style={{ fontSize: "0.82rem", padding: "6px 12px" }}
            disabled={busy}
            onClick={() => sendBlob(1000000, "1 MB")}
          >
            Send 1 MB Blob
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <span className="mono" style={{ fontSize: "0.74rem", color: "var(--muted)" }}>Recent Upload Telemetry:</span>
        <div style={{ maxHeight: 110, overflowY: "auto", marginTop: 4 }}>
          {log.slice(0, 4).map((u) => (
            <div
              key={u.id}
              className="mono row"
              style={{
                justifyContent: "space-between",
                padding: "3px 0",
                borderBottom: "1px solid var(--stroke-subtle)",
                fontSize: "0.74rem",
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
        <h3>Adaptive Video Stream</h3>

        <div className="screen">
          <div className="bars">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 0.1}s`, opacity: starving ? 0.25 : 1 }} />
            ))}
          </div>
          <div className="badge" style={{ color: starving ? "var(--amber)" : "var(--cyan)" }}>
            {offline ? "OFFLINE" : starving ? "BUFFERING…" : `STREAMING · ${q}`}
          </div>
        </div>

        <label className="mono" style={{ fontSize: "0.78rem", color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
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

      <div style={{ marginTop: 12 }}>
        <p className="mono" style={{ fontSize: "0.76rem", margin: 0, color: "var(--muted)" }}>
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
        <h3>Cloud Database Replication</h3>
        <p className="mono" style={{ fontSize: "0.8rem", margin: "6px 0 10px" }}>
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
          style={{ marginTop: 8, width: "100%", fontSize: "0.82rem" }}
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
        {msg && <p className="mono" style={{ fontSize: "0.74rem", margin: "6px 0 0", color: "var(--cyan)" }}>{msg}</p>}
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="mono" style={{ fontSize: "0.74rem", color: "var(--muted)" }}>Latest DB Records:</span>
        <div style={{ maxHeight: 95, overflowY: "auto", marginTop: 4 }}>
          {status?.records?.slice(0, 3).map((r) => (
            <div
              key={r.id}
              className="mono row"
              style={{
                justifyContent: "space-between",
                padding: "3px 0",
                borderBottom: "1px solid var(--stroke-subtle)",
                fontSize: "0.72rem",
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
