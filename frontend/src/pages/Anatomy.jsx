import { useState } from "react";
import { api } from "../api.js";
import { useLab } from "../LabContext.jsx";

export default function Anatomy() {
  const { state, setNetwork, command } = useLab();
  const [trace, setTrace] = useState(null);
  const [service, setService] = useState("api");
  const [activeStage, setActiveStage] = useState(null);
  const [animating, setAnimating] = useState(false);
  const net = state?.network;

  const handleSimulate = async () => {
    setAnimating(true);
    setActiveStage(1);
    try {
      const data = await api("/api/request-flow/simulate", {
        method: "POST",
        body: { service },
      });
      setTrace(data);

      // Sequentially highlight each stage
      for (let s = 1; s <= 7; s++) {
        setActiveStage(s);
        await new Promise((r) => setTimeout(r, 220));
      }
    } catch (e) {
      /* ignore */
    } finally {
      setAnimating(false);
    }
  };

  return (
    <div className="page">
      <div className="kicker">Protocol Mechanics</div>
      <h2>The Hidden Path of a Request</h2>
      <p className="lede">
        When a user clicks a button, a request doesn't instantly materialize in the cloud. It traverses 7 sequential network and system stages.
        Watch how physical latency and packet loss multiply the round trips before the application even finishes executing.
      </p>

      {/* Target Service Selector & Fire Button */}
      <div
        className="row"
        style={{
          marginTop: 16,
          background: "rgba(0, 0, 0, 0.4)",
          padding: "12px 18px",
          borderRadius: 14,
          border: "1px solid var(--stroke-subtle)",
          gap: 14,
        }}
      >
        <div style={{ flex: 1 }}>
          <label className="mono" style={{ fontSize: "0.76rem", color: "var(--muted)", display: "block", marginBottom: 4 }}>
            TARGET CLOUD ENDPOINT:
          </label>
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="api">Cloud API / File Upload (POST /api/upload)</option>
            <option value="video">Adaptive Video Chunk (GET /api/video/chunk)</option>
            <option value="db">Transactional Database Write (POST /api/db/write)</option>
            <option value="replica">Cross-Region DB Replication Sync (WAL Stream)</option>
          </select>
        </div>

        <button
          className="btn primary"
          style={{ height: 42, padding: "0 22px", marginTop: "auto" }}
          disabled={animating}
          onClick={handleSimulate}
        >
          {animating ? "Simulating Packet Path…" : "Fire Simulated Request →"}
        </button>
      </div>

      {/* Live Latency & Loss Sliders for direct experimentation */}
      {net && (
        <div className="panel sliders" style={{ marginTop: 20 }}>
          <div className="kicker">Live Variable Injection</div>
          <div className="grid-lab" style={{ gap: 24, marginTop: 8 }}>
            <div>
              <label>
                <span>Current Simulated Latency</span>
                <span className="val">{net.latencyMs} ms RTT</span>
              </label>
              <input
                type="range"
                min={1}
                max={400}
                value={net.latencyMs}
                onChange={(e) => {
                  const latencyMs = Number(e.target.value);
                  setNetwork({ latencyMs });
                  command("/api/network", { method: "PUT", body: { ...net, latencyMs } });
                }}
              />
            </div>
            <div>
              <label>
                <span>Current Simulated Loss</span>
                <span className="val">{net.lossPct}% Drop</span>
              </label>
              <input
                type="range"
                min={0}
                max={40}
                value={net.lossPct}
                onChange={(e) => {
                  const lossPct = Number(e.target.value);
                  setNetwork({ lossPct });
                  command("/api/network", { method: "PUT", body: { ...net, lossPct } });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 7 STAGES DISPLAY */}
      <div className="grid-lab" style={{ marginTop: 20 }}>
        {/* Left: Sequential Stage Cards */}
        <div className="panel">
          <div className="kicker">Sequential Stages (1 through 7)</div>
          <h3>Execution Pipeline</h3>

          <div style={{ marginTop: 14 }}>
            {(trace?.steps || defaultSteps(net?.latencyMs || 25)).map((s) => {
              const isActive = activeStage === s.stage;
              return (
                <div
                  key={s.stage}
                  className={`comment ${isActive ? "info" : s.status === "fail" ? "danger" : "ok"}`}
                  style={{
                    transition: "all 0.2s ease",
                    transform: isActive ? "scale(1.02)" : "scale(1)",
                    borderWidth: isActive ? 3 : 1,
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      Stage {s.stage}: {s.name}
                    </strong>
                    <span className="mono" style={{ color: "var(--cyan)", fontWeight: "bold" }}>
                      ~{s.ms} ms (Simulated)
                    </span>
                  </div>
                  <p className="lede" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
                    {s.detail}
                  </p>
                </div>
              );
            })}
          </div>

          <div
            className="mono"
            style={{
              fontSize: "0.75rem",
              color: "var(--muted)",
              marginTop: 12,
              padding: "8px 12px",
              background: "rgba(0, 0, 0, 0.3)",
              borderRadius: 8,
            }}
          >
            * Note: Timings are calculated from deterministic network modeling formulas calibrated for educational demonstration.
          </div>
        </div>

        {/* Right: Timing Breakdown & Visual Stack */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div className="kicker">Duration Analysis</div>
            <h3>End-to-End Latency Budget</h3>

            <div
              className="mono"
              style={{
                fontSize: "2.4rem",
                fontFamily: "var(--display)",
                color: "var(--cyan)",
                margin: "12px 0 4px",
              }}
            >
              {trace ? trace.totalMs : "~" + (net ? Math.round(net.latencyMs * 4.2 + 45) : 150)} ms
            </div>
            <div className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 16 }}>
              Total Round-Trip Request Lifetime
            </div>

            <div className="comment info" style={{ fontSize: "0.88rem" }}>
              <strong>The RTT Multiplication Effect:</strong>
              <p style={{ margin: "4px 0 0" }}>
                Before the application code even executes, DNS resolution, TCP SYN/ACK, and TLS cryptographic key exchange consume <strong>at least 3 to 4 full round trips</strong>.
                If latency is 150 ms (e.g. transatlantic fiber), handshakes alone take ~600 ms before byte 1 moves.
              </p>
            </div>
          </div>

          {/* Timeline Stack Visualization */}
          <div style={{ marginTop: 20 }}>
            <span className="mono" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Proportional Stage Latency:</span>
            <div className="timeline">
              {(trace?.steps || defaultSteps(net?.latencyMs || 25)).map((s) => {
                const total = trace ? trace.totalMs : 160;
                const pct = Math.max(15, Math.min(100, (s.ms / total) * 100));
                return (
                  <div
                    key={s.stage}
                    className={`step ${activeStage === s.stage ? "active" : ""}`}
                    style={{ height: `${pct}%` }}
                    title={`${s.name}: ${s.ms} ms`}
                  >
                    <span>{s.ms}ms</span>
                    <strong style={{ fontSize: "0.68rem" }}>S{s.stage}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultSteps(rtt) {
  return [
    { stage: 1, name: "DNS lookup", ms: Math.round(rtt * 0.55 + 8), detail: "Resolve hostname via hierarchical DNS servers.", status: "ok" },
    { stage: 2, name: "TCP connection handshake", ms: Math.round(rtt), detail: "SYN -> SYN-ACK -> ACK establishes reliable in-order transport (1 RTT).", status: "ok" },
    { stage: 3, name: "TLS handshake", ms: Math.round(rtt * 1.4 + 10), detail: "Asymmetric key exchange & TLS cert validation (1.5 RTTs).", status: "ok" },
    { stage: 4, name: "Load balancer", ms: 12, detail: "Reverse proxy terminates TLS and selects target app pod.", status: "ok" },
    { stage: 5, name: "Cloud application", ms: 22, detail: "Microservice application handler processes JSON payload.", status: "ok" },
    { stage: 6, name: "Database request", ms: 14, detail: "Primary database commit to SQLite WAL journal.", status: "ok" },
    { stage: 7, name: "Response returned to client", ms: Math.round(rtt * 0.5), detail: "HTTP response packet travels back through backbone to client.", status: "ok" },
  ];
}
