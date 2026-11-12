import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useLab } from "../LabContext.jsx";

export default function Missions() {
  const { state, command } = useLab();
  const [catalog, setCatalog] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeResult, setActiveResult] = useState(null);
  const [checkingId, setCheckingId] = useState(null);
  const net = state?.network || {};

  async function refresh() {
    try {
      const data = await api("/api/challenges");
      setCatalog(data.catalog || []);
      setRuns(data.runs || []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Compute live progress / guidance for each mission
  const getLiveStatus = (id) => {
    const down = net.failedLinks || [];
    const health = state?.health?.score ?? 0;
    const q = state?.lastVideoQuality || "1080p";
    const lag = state?.replicaLagMs ?? 0;

    switch (id) {
      case "mission-1": {
        const starved = q === "buffering" || q === "240p" || net.lossPct >= 10 || net.bandwidthKbps <= 1400;
        const noCuts = down.length === 0;
        if (starved && noCuts) return { ready: true, text: "Ready to check! Video is starved while links remain intact." };
        if (!noCuts) return { ready: false, text: "Warning: You cut a link! Mission 1 requires starving WITHOUT cutting cables." };
        return { ready: false, text: `Current: ${q} · Bandwidth: ${net.bandwidthKbps} kbps · Loss: ${net.lossPct}%. Lower bandwidth or raise loss.` };
      }
      case "mission-2": {
        const ready = lag >= 2000 || down.includes("db-replica") || !net.replicaEnabled;
        if (ready) return { ready: true, text: `Ready! Replication lag is ${lag} ms (>= 2000 ms target).` };
        return { ready: false, text: `Current lag: ${lag} ms. Cut 'Replication Link' or inject delay/loss, then write a DB record.` };
      }
      case "mission-3": {
        const primaryCut = down.includes("core-lb");
        const cdnSurvives = net.cdnEnabled && state?.videoUp;
        const dc2Survives = net.secondDcEnabled && state?.originUp && state?.activeRoute === "secondary-dc";
        if (primaryCut && (cdnSurvives || dc2Survives)) {
          return { ready: true, text: `Ready! Primary WAN is severed, but traffic is surviving via ${dc2Survives ? "Secondary DC" : "Edge CDN"}!` };
        }
        if (!primaryCut) return { ready: false, text: "First enable CDN or Secondary DC, then cut the Primary WAN ('core-lb') link." };
        return { ready: false, text: "Primary WAN is cut, but neither CDN nor Secondary DC is active to handle traffic." };
      }
      case "mission-4": {
        const ready = net.lossPct <= 1 && health >= 85;
        if (ready) return { ready: true, text: `Ready! Packet loss is ${net.lossPct}% and Health is ${health} / 100.` };
        return { ready: false, text: `Current: Loss ${net.lossPct}%, Health ${health}. Reset network or drag loss slider to 0%.` };
      }
      case "mission-5": {
        const is720p = q === "720p";
        const bwTarget = net.bandwidthKbps >= 2000 && net.bandwidthKbps <= 5500;
        if (is720p || (bwTarget && net.lossPct <= 2)) return { ready: true, text: `Ready! Quality is 720p at ${(net.bandwidthKbps / 1000).toFixed(1)} Mbps.` };
        return { ready: false, text: `Current: Quality is ${q} at ${(net.bandwidthKbps / 1000).toFixed(1)} Mbps. Target is 2200-5000 kbps.` };
      }
      case "mission-6": {
        const isCongested = net.bandwidthKbps <= 2000 && net.latencyMs >= 50 && health <= 82;
        if (isCongested) return { ready: true, text: `Ready! Congested network state achieved (Health: ${health}, Latency: ${net.latencyMs} ms).` };
        return { ready: false, text: `Load Congested Campus preset or set Latency >= 60 ms and Bandwidth <= 2000 kbps.` };
      }
      default:
        return { ready: false, text: "Configure lab conditions." };
    }
  };

  const handleSetup = async (missionId) => {
    try {
      await api(`/api/challenges/${missionId}/setup`, { method: "POST" });
      refresh();
    } catch {
      /* ignore */
    }
  };

  const handleCheck = async (missionId) => {
    setCheckingId(missionId);
    try {
      const result = await api(`/api/challenges/${missionId}/complete`, { method: "POST", body: {} });
      setActiveResult(result);
      refresh();
    } catch (e) {
      setActiveResult({ success: false, details: { error: e.message } });
    } finally {
      setCheckingId(null);
    }
  };

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="kicker">Hands-on Engineering Challenges</div>
          <h2>Interactive Missions</h2>
          <p className="lede">
            Learn computer networks by solving real degradation scenarios. Configure the lab, verify the failure mode, and master the protocol mechanics.
          </p>
        </div>
        <div className="row">
          <Link to="/lab" className="btn primary">
            Open Stress Lab →
          </Link>
          <button
            className={`btn ${net.chaos ? "danger" : ""}`}
            onClick={() => command("/api/network/chaos", { method: "POST", body: { on: !net.chaos } })}
          >
            {net.chaos ? "Stop Chaos Mode" : "Chaos Mode"}
          </button>
        </div>
      </div>

      {/* Live System Telemetry Strip */}
      <div
        className="row mono"
        style={{
          background: "rgba(0, 0, 0, 0.4)",
          padding: "10px 16px",
          borderRadius: 12,
          border: "1px solid var(--stroke-subtle)",
          justifyContent: "space-between",
          fontSize: "0.82rem",
          marginBottom: 20,
        }}
      >
        <span>
          Live Health: <strong>{state?.health?.score ?? 0}</strong> / 100
        </span>
        <span>
          Video: <strong>{state?.lastVideoQuality || "1080p"}</strong>
        </span>
        <span>
          Replication Lag: <strong>{state?.replicaLagMs ?? 0} ms</strong>
        </span>
        <span>
          Route: <strong>{state?.activeRoute || "origin"}</strong>
        </span>
        <span>
          Cut Links: <strong>{net.failedLinks?.length || 0}</strong>
        </span>
      </div>

      {/* RESULT FEEDBACK MODAL / BANNER */}
      {activeResult && (
        <div
          className={`panel comment ${activeResult.success ? "ok" : "warn"}`}
          style={{ marginBottom: 20, border: "2px solid", padding: 18 }}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, color: activeResult.success ? "var(--green)" : "var(--amber)" }}>
              {activeResult.success ? "Mission Accomplished! ★★★" : "Target Conditions Not Yet Met"}
            </h3>
            <button className="btn ghost" style={{ padding: "2px 8px" }} onClick={() => setActiveResult(null)}>
              Dismiss ✕
            </button>
          </div>
          <p style={{ margin: "8px 0" }}>
            {activeResult.success
              ? "You successfully engineered the exact network condition and verified the cloud service response."
              : "Review the mission objective and live feedback below. Adjust the network parameters in the Stress Lab and re-test."}
          </p>
          <div className="mono" style={{ fontSize: "0.76rem", opacity: 0.85 }}>
            Telemetry Evaluation: {JSON.stringify(activeResult.details || {})}
          </div>
        </div>
      )}

      {/* MISSIONS GRID */}
      <div className="cards">
        {catalog.map((m, idx) => {
          const live = getLiveStatus(m.id);
          const hasPassed = runs.some((r) => r.challenge_id === m.id && r.success === 1);

          return (
            <article key={m.id} className="panel mission" style={{ borderColor: hasPassed ? "var(--green)" : "var(--stroke)" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <span className={`mission-status-badge ${hasPassed ? "passed" : "pending"}`}>
                  {hasPassed ? "COMPLETED ✓" : `MISSION 0${idx + 1}`}
                </span>
                {live.ready && !hasPassed && (
                  <span className="mono" style={{ color: "var(--cyan)", fontSize: "0.72rem", fontWeight: "bold" }}>
                    ● READY TO CHECK
                  </span>
                )}
              </div>

              <h3 style={{ margin: "6px 0", fontSize: "1.2rem" }}>{m.title}</h3>
              <p style={{ margin: "4px 0 10px", fontSize: "0.92rem", fontWeight: "500" }}>{m.objective}</p>

              <div
                style={{
                  background: "rgba(0, 0, 0, 0.35)",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--stroke-subtle)",
                  fontSize: "0.78rem",
                  marginBottom: 10,
                }}
              >
                <span className="mono" style={{ color: "var(--muted)", display: "block", fontSize: "0.7rem" }}>
                  LIVE TRACKER:
                </span>
                <span className="mono" style={{ color: live.ready ? "var(--green)" : "var(--amber)" }}>
                  {live.text}
                </span>
              </div>

              <p className="lede" style={{ fontSize: "0.82rem", margin: "4px 0 14px", flex: 1 }}>
                <strong>Hint:</strong> {m.hint}
              </p>

              <div className="row" style={{ marginTop: "auto", gap: 8 }}>
                <button
                  className="btn ghost"
                  style={{ flex: 1, fontSize: "0.78rem", padding: "6px 8px" }}
                  onClick={() => handleSetup(m.id)}
                  title="Apply recommended baseline starting network conditions"
                >
                  Setup Starting Lab
                </button>
                <button
                  className={`btn ${live.ready ? "primary" : ""}`}
                  style={{ flex: 1, fontSize: "0.78rem", padding: "6px 8px" }}
                  disabled={checkingId === m.id}
                  onClick={() => handleCheck(m.id)}
                >
                  {checkingId === m.id ? "Checking…" : "Check My Lab"}
                </button>
              </div>

              {m.concept && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--stroke-subtle)" }}>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                    CONCEPT: {m.concept}
                  </span>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ATTEMPT HISTORY TABLE */}
      <div className="panel" style={{ marginTop: 28 }}>
        <div className="kicker">Audit Trail</div>
        <h3>Mission Attempt Log</h3>
        <table>
          <thead>
            <tr>
              <th>Mission ID</th>
              <th>Status</th>
              <th>Timestamp</th>
              <th>Evaluation Details</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted mono" style={{ textAlign: "center", padding: 18 }}>
                  No mission attempts recorded yet. Click "Check My Lab" on any mission above.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{r.challenge_id}</td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        color: r.success ? "var(--green)" : "var(--amber)",
                        borderColor: r.success ? "rgba(34, 197, 94, 0.4)" : "rgba(245, 158, 11, 0.4)",
                      }}
                    >
                      {r.success ? "PASSED" : "FAILED"}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: "0.76rem" }}>{r.completed_at || r.started_at}</td>
                  <td className="mono" style={{ fontSize: "0.74rem", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.details || "—"}
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
