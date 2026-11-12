import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Experiments() {
  const [name, setName] = useState("Network Degradation Sweep");
  const [notes, setNotes] = useState("Measuring the impact of packet loss and high latency on cloud service goodput.");
  const [list, setList] = useState([]);
  const [activeExp, setActiveExp] = useState(null);
  const [activeTab, setActiveTab] = useState("health");

  async function refresh() {
    try {
      const data = await api("/api/experiments");
      setList(data || []);
      if (activeExp) {
        const updated = await api(`/api/experiments/${activeExp.id}`);
        setActiveExp(updated);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2500);
    return () => clearInterval(interval);
  }, [activeExp?.id]);

  const handleStart = async () => {
    if (!name.trim()) return;
    try {
      const row = await api("/api/experiments", {
        method: "POST",
        body: { title: name.trim(), notes: notes.trim() },
      });
      setName("");
      setNotes("");
      setActiveExp(row);
      refresh();
    } catch {
      /* ignore */
    }
  };

  const handleStop = async (id) => {
    try {
      const stopped = await api(`/api/experiments/${id}/stop`, { method: "POST" });
      if (activeExp?.id === id) setActiveExp(stopped);
      refresh();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (id) => {
    try {
      await api(`/api/experiments/${id}`, { method: "DELETE" });
      if (activeExp?.id === id) setActiveExp(null);
      refresh();
    } catch {
      /* ignore */
    }
  };

  const handleView = async (id) => {
    try {
      const full = await api(`/api/experiments/${id}`);
      setActiveExp(full);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="page">
      <div className="kicker">Telemetry Logging & Scientific Analysis</div>
      <h2>Experiment History & Data Export</h2>
      <p className="lede">
        Record live network telemetry sessions, plot multi-metric performance curves, and export verified CSV datasets
        for project reports and lab viva analysis.
      </p>

      {/* NEW EXPERIMENT RECORDER */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="kicker">Start New Recording</div>
        <h3>Session Setup</h3>

        <div className="grid-lab" style={{ gap: 16, marginTop: 10 }}>
          <div>
            <label className="mono" style={{ fontSize: "0.78rem", color: "var(--muted)", display: "block", marginBottom: 4 }}>
              EXPERIMENT TITLE:
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 20% Packet Loss Stress Test"
            />
          </div>

          <div>
            <label className="mono" style={{ fontSize: "0.78rem", color: "var(--muted)", display: "block", marginBottom: 4 }}>
              OBJECTIVES & NOTES:
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Hypothesis or test configuration notes"
            />
          </div>
        </div>

        <div style={{ marginTop: 14, textAlign: "right" }}>
          <button className="btn primary" onClick={handleStart}>
            Start Live Telemetry Recording →
          </button>
        </div>
      </div>

      {/* ACTIVE EXPERIMENT DETAILS & GRAPHS */}
      {activeExp && (
        <div className="panel" style={{ marginTop: 24, border: "1px solid var(--cyan)" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="kicker">Active Inspection · Experiment #{activeExp.id}</div>
              <h3 style={{ margin: "4px 0" }}>{activeExp.title}</h3>
              <p className="lede" style={{ fontSize: "0.88rem", margin: 0 }}>
                {activeExp.notes || "No notes attached."} · Started: {activeExp.started_at} · Samples: {activeExp.samples?.length || 0}
              </p>
            </div>
            <div className="row">
              {!activeExp.ended_at && (
                <button className="btn danger" onClick={() => handleStop(activeExp.id)}>
                  Stop Recording
                </button>
              )}
              <a className="btn primary" href={`/api/experiments/${activeExp.id}/export.csv`}>
                Export CSV Dataset ⤓
              </a>
              <button className="btn ghost" onClick={() => setActiveExp(null)}>
                Close View ✕
              </button>
            </div>
          </div>

          {/* Metric Selector Tabs */}
          <div className="row" style={{ marginTop: 16, gap: 8 }}>
            {[
              { id: "health", label: "Cloud Health Score (0-100)", unit: "pts", color: "var(--green)" },
              { id: "latency", label: "Network Latency (RTT)", unit: "ms", color: "var(--cyan)" },
              { id: "loss", label: "Packet Loss (%)", unit: "%", color: "var(--red)" },
              { id: "bandwidth", label: "Available Bandwidth", unit: "kbps", color: "#a855f7" },
              { id: "lag", label: "Replication Lag", unit: "ms", color: "var(--amber)" },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`btn ${activeTab === tab.id ? "primary" : "ghost"}`}
                style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* SVG Telemetry Chart */}
          <div style={{ marginTop: 14 }}>
            <TelemetryChart samples={activeExp.samples || []} metric={activeTab} />
          </div>

          {/* Telemetry Sample Table */}
          <div style={{ marginTop: 20 }}>
            <div className="kicker">Recorded Telemetry Samples</div>
            <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Health Score</th>
                    <th>Latency (ms)</th>
                    <th>Loss (%)</th>
                    <th>Bandwidth (kbps)</th>
                    <th>Replica Lag (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeExp.samples || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted mono" style={{ textAlign: "center", padding: 12 }}>
                        Recording session open. Telemetry samples will appear every 900 ms.
                      </td>
                    </tr>
                  ) : (
                    (activeExp.samples || []).slice(-16).reverse().map((s) => (
                      <tr key={s.id}>
                        <td className="mono" style={{ fontSize: "0.76rem" }}>{s.ts}</td>
                        <td className="mono" style={{ color: "var(--green)", fontWeight: "bold" }}>{s.health}</td>
                        <td className="mono">{s.latency_ms} ms</td>
                        <td className="mono" style={{ color: s.loss_pct > 0 ? "var(--red)" : "inherit" }}>{s.loss_pct}%</td>
                        <td className="mono">{(s.bandwidth_kbps / 1000).toFixed(1)} Mbps</td>
                        <td className="mono">{s.replica_lag_ms} ms</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EXPERIMENTS LOG TABLE */}
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="kicker">Archive</div>
        <h3>Experiment Runs History</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Experiment Name</th>
              <th>Samples</th>
              <th>Started At</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted mono" style={{ textAlign: "center", padding: 18 }}>
                  No experiments recorded yet. Start your first session above.
                </td>
              </tr>
            ) : (
              list.map((e) => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>#{e.id}</td>
                  <td>
                    <strong>{e.title}</strong>
                    {e.notes && <span style={{ display: "block", fontSize: "0.76rem", color: "var(--muted)" }}>{e.notes}</span>}
                  </td>
                  <td className="mono">{e.sample_count ?? 0}</td>
                  <td className="mono" style={{ fontSize: "0.76rem" }}>{e.started_at}</td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        color: e.ended_at ? "var(--muted)" : "var(--green)",
                        borderColor: e.ended_at ? "var(--stroke-subtle)" : "rgba(34, 197, 94, 0.4)",
                      }}
                    >
                      {e.ended_at ? "CLOSED" : "RECORDING ●"}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {!e.ended_at && (
                        <button
                          className="btn danger"
                          style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                          onClick={() => handleStop(e.id)}
                        >
                          Stop
                        </button>
                      )}
                      <button
                        className="btn ghost"
                        style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                        onClick={() => handleView(e.id)}
                      >
                        Inspect
                      </button>
                      <a
                        className="btn primary"
                        style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                        href={`/api/experiments/${e.id}/export.csv`}
                      >
                        CSV
                      </a>
                      <button
                        className="btn danger"
                        style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                        onClick={() => handleDelete(e.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TelemetryChart({ samples, metric }) {
  if (!samples || samples.length === 0) {
    return (
      <div
        className="mono"
        style={{
          height: 160,
          display: "grid",
          placeItems: "center",
          background: "rgba(0, 0, 0, 0.3)",
          borderRadius: 10,
          color: "var(--muted)",
          fontSize: "0.85rem",
        }}
      >
        Collecting telemetry samples… Change network conditions in the lab to generate data curves.
      </div>
    );
  }

  const w = 840;
  const h = 170;

  // Select value and determine scale
  const getValue = (s) => {
    switch (metric) {
      case "health": return s.health;
      case "latency": return s.latency_ms;
      case "loss": return s.loss_pct;
      case "bandwidth": return s.bandwidth_kbps;
      case "lag": return s.replica_lag_ms;
      default: return s.health;
    }
  };

  const formatUnit = (val) => {
    if (metric === "health") return `${Math.round(val)} pts`;
    if (metric === "latency") return `${Math.round(val)} ms`;
    if (metric === "loss") return `${val.toFixed(1)}%`;
    if (metric === "bandwidth") return val >= 1000 ? `${(val / 1000).toFixed(1)} Mbps` : `${Math.round(val)} kbps`;
    if (metric === "lag") return `${Math.round(val)} ms`;
    return `${val}`;
  };

  const values = samples.map(getValue);
  const actualMax = Math.max(...values);
  const actualMin = Math.min(...values);

  // Dynamic range with vertical headroom so lines never hug the edges
  let displayMin = actualMin;
  let displayMax = actualMax;
  if (displayMax === displayMin) {
    displayMin = Math.max(0, actualMin * 0.7);
    displayMax = actualMax * 1.3 || 10;
  } else {
    const pad = (actualMax - actualMin) * 0.15;
    displayMin = Math.max(0, actualMin - pad);
    displayMax = actualMax + pad;
  }
  const range = displayMax - displayMin || 1;

  const points = samples.map((s, i) => {
    const x = (i / Math.max(1, samples.length - 1)) * w;
    const norm = (getValue(s) - displayMin) / range;
    const y = h - norm * (h - 36) - 18;
    return { x, y, v: getValue(s) };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${w} ${h} L 0 ${h} Z`;

  const color =
    metric === "health"
      ? "var(--green)"
      : metric === "latency"
      ? "var(--cyan)"
      : metric === "loss"
      ? "var(--red)"
      : metric === "bandwidth"
      ? "#a855f7"
      : "var(--amber)";

  return (
    <div style={{ background: "rgba(0, 0, 0, 0.4)", borderRadius: 12, padding: "14px", border: "1px solid var(--stroke-subtle)" }}>
      <div className="row mono" style={{ justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", marginBottom: 8 }}>
        <span>Peak: <strong style={{ color: "var(--ink)" }}>{formatUnit(actualMax)}</strong></span>
        <span>Latest: <strong style={{ color }}>{formatUnit(values[values.length - 1])}</strong></span>
        <span>Floor: <strong style={{ color: "var(--ink)" }}>{formatUnit(actualMin)}</strong></span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="170" style={{ display: "block" }}>
        <defs>
          <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line x1="0" y1="20" x2={w} y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
        <line x1="0" y1={h - 20} x2={w} y2={h - 20} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />

        {/* Gradient area under line */}
        <path d={areaD} fill={`url(#grad-${metric})`} />

        {/* Telemetry data curve */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="3" />

        {/* Current sample marker */}
        {points.length > 0 && (
          <g transform={`translate(${points[points.length - 1].x}, ${points[points.length - 1].y})`}>
            <circle r="7" fill={color} opacity="0.3" />
            <circle r="4" fill={color} stroke="#ffffff" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    </div>
  );
}
