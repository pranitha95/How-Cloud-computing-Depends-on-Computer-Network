export default function HowItWorks() {
  return (
    <div className="page">
      <div className="kicker">System Architecture & Academic Viva Guide</div>
      <h2>How Cloud Under Stress Works</h2>
      <p className="lede">
        A technical breakdown of the full-stack architecture, network emulation mathematics, database persistence layer,
        and key answers for academic viva examinations.
      </p>

      {/* THREE-TIER ARCHITECTURE CARD */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="kicker">System Architecture</div>
        <h3>Three-Tier Reactive Architecture</h3>
        <div className="cards" style={{ marginTop: 14 }}>
          <div style={{ background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 12, border: "1px solid var(--stroke-subtle)" }}>
            <span className="mono" style={{ color: "var(--cyan)", fontWeight: "bold" }}>01. CLIENT (FRONTEND)</span>
            <p style={{ fontSize: "0.88rem", margin: "6px 0 0" }}>
              React 19 SPA built with Vite. Consumes REST APIs and maintains an active WebSocket link for live telemetry (health score, packet animations, active routes).
            </p>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 12, border: "1px solid var(--stroke-subtle)" }}>
            <span className="mono" style={{ color: "var(--green)", fontWeight: "bold" }}>02. ENGINE (BACKEND)</span>
            <p style={{ fontSize: "0.88rem", margin: "6px 0 0" }}>
              Node.js Express API with in-process network shaping. Every file upload, video chunk fetch, and database write is throttled and dropped according to physical network physics.
            </p>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 12, border: "1px solid var(--stroke-subtle)" }}>
            <span className="mono" style={{ color: "var(--amber)", fontWeight: "bold" }}>03. STORAGE (SQLITE WAL)</span>
            <p style={{ fontSize: "0.88rem", margin: "6px 0 0" }}>
              Embedded SQLite using Node 22+ built-in `node:sqlite` DatabaseSync with Write-Ahead Logging (WAL). Persists network profiles, presets, uploads, DB records, and telemetry.
            </p>
          </div>
        </div>
      </div>

      {/* HONEST SIMULATION MATHEMATICS */}
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="kicker">Network Physics & Mathematical Models</div>
        <h3>Defensible Simulation Mathematics</h3>

        <div className="cards" style={{ marginTop: 14 }}>
          <div style={{ background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 12, border: "1px solid var(--stroke-subtle)" }}>
            <strong style={{ color: "var(--cyan)" }}>1. Transfer Time & Bandwidth</strong>
            <pre className="mono" style={{ fontSize: "0.76rem", margin: "8px 0" }}>
{`transferTimeMs = (bytes / (bandwidthKbps * 1024 / 8)) * 1000`}
            </pre>
            <p style={{ fontSize: "0.84rem", margin: 0, color: "var(--muted)" }}>
              Bandwidth defines the transmission rate ceiling. A 560 KB chunk at 800 kbps takes ~5.6 seconds.
            </p>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 12, border: "1px solid var(--stroke-subtle)" }}>
            <strong style={{ color: "var(--red)" }}>2. TCP Retransmissions & Packet Loss</strong>
            <pre className="mono" style={{ fontSize: "0.76rem", margin: "8px 0" }}>
{`p = lossPct / 100
extraRtts = p / (1 - p)
totalDelay = baseRtt * (1 + extraRtts)`}
            </pre>
            <p style={{ fontSize: "0.84rem", margin: 0, color: "var(--muted)" }}>
              Expected retransmissions scale non-linearly. At 20% loss, ~0.25 extra RTTs are required per segment.
            </p>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 12, border: "1px solid var(--stroke-subtle)" }}>
            <strong style={{ color: "var(--green)" }}>3. Cloud Health Score Algorithm</strong>
            <pre className="mono" style={{ fontSize: "0.76rem", margin: "8px 0" }}>
{`Health = 100 - LatencyPenalty - LossPenalty
       - BandwidthPenalty - LinkCutPenalty
       - ReplicaLagPenalty + RedundancyBonus`}
            </pre>
            <p style={{ fontSize: "0.84rem", margin: 0, color: "var(--muted)" }}>
              Deterministic scoring from actual simulation state, not random numbers. Clamped between 0 and 100.
            </p>
          </div>
        </div>
      </div>

      {/* VIVA PREPARATION & CHEAT SHEET */}
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="kicker">Viva Defense Cheat Sheet</div>
        <h3>Key Examination Questions & Answers</h3>

        <div style={{ marginTop: 12 }}>
          <div className="comment info" style={{ marginBottom: 12 }}>
            <strong>Q1: Why does packet loss hurt cloud uploads more than low bandwidth?</strong>
            <p style={{ margin: "4px 0 0" }}>
              TCP interprets packet loss as congestion. When a packet drops, TCP halves its congestion window (CWND)
              and waits for an ACK timeout (RTO) before retransmitting. High loss destroys TCP throughput even on a gigabit link.
            </p>
          </div>

          <div className="comment info" style={{ marginBottom: 12 }}>
            <strong>Q2: Why does an adaptive video player downgrade from 1080p to 240p under jitter?</strong>
            <p style={{ margin: "4px 0 0" }}>
              Video players maintain a playhead buffer (e.g. 4-8 seconds). High jitter causes bursts and starvation where chunks arrive late.
              To avoid playhead freeze (buffering), Adaptive Bitrate (ABR) ladders step down to lower bitrate chunks (720p → 480p → 240p).
            </p>
          </div>

          <div className="comment info" style={{ marginBottom: 12 }}>
            <strong>Q3: How does database replication lag violate strict consistency?</strong>
            <p style={{ margin: "4px 0 0" }}>
              Asynchronous replication sends transaction logs across the network after the primary commits. Under network delay or partition,
              the replica falls behind (replication lag). Clients reading from the replica see stale state—illustrating the CAP theorem.
            </p>
          </div>

          <div className="comment info">
            <strong>Q4: How does a Content Delivery Network (CDN) survive origin datacenter cuts?</strong>
            <p style={{ margin: "4px 0 0" }}>
              CDNs terminate TCP/TLS connections at edge Points of Presence (POPs) close to users and cache popular media chunks.
              If the backbone WAN cable to the origin datacenter is severed, cached video reads continue serving directly from the edge cache.
            </p>
          </div>
        </div>
      </div>

      {/* RUN COMMANDS & ENVIRONMENT */}
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="kicker">Execution Instructions</div>
        <h3>How to Run and Test</h3>

        <pre className="mono" style={{ background: "rgba(0, 0, 0, 0.4)", padding: 14, borderRadius: 10, fontSize: "0.82rem" }}>
{`# 1. From Project Root:
npm install
npm run install:all
npm test --prefix backend

# 2. Run Both Services Concurrently:
npm run dev

# 3. Or run in two separate PowerShell terminals:
# Terminal A (Backend):
cd backend
npm install
node src/index.js

# Terminal B (Frontend):
cd frontend
npm install
npm run dev`}
        </pre>
        <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "8px 0 0" }}>
          Default Development Ports: Backend on <strong>http://localhost:4000</strong> · Frontend on <strong>http://localhost:5173</strong>
        </p>
      </div>
    </div>
  );
}
