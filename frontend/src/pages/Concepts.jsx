import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLab } from "../LabContext.jsx";

const CONCEPTS = [
  {
    id: "latency",
    title: "01. Network Latency & RTT",
    summary: "Latency is the propagation delay of signals traveling through optical fiber at ~200,000 km/s. It is bound by the speed of light.",
    apply: { latencyMs: 180, lossPct: 0.2, bandwidthKbps: 30000, jitterMs: 10, failedLinks: [] },
    result: "Transatlantic RTT ~360 ms. Every handshake waits 180 ms each way.",
    takeaway: "You cannot optimize past the speed of light in fiber; data centers must be located geographically closer to users.",
    metric: "RTT: 360 ms",
  },
  {
    id: "bandwidth",
    title: "02. Bandwidth vs Throughput",
    summary: "Bandwidth is the maximum theoretical capacity of a link (width of the pipe). Throughput is the actual data delivered per second.",
    apply: { bandwidthKbps: 800, latencyMs: 30, lossPct: 0, failedLinks: [] },
    result: "At 800 kbps, high-definition 1080p chunks (~560 KB) take ~5.6 seconds each, exceeding video playback rate.",
    takeaway: "High bandwidth does not cure high latency; low bandwidth enforces an absolute bottleneck ceiling.",
    metric: "Capacity: 800 kbps",
  },
  {
    id: "loss",
    title: "03. Packet Loss",
    summary: "Packets are dropped when router queues overflow (congestion) or wireless links suffer interference and bit flips.",
    apply: { lossPct: 15, latencyMs: 35, bandwidthKbps: 20000, failedLinks: [] },
    result: "15% loss triggers TCP congestion backoff; effective goodput collapses to a fraction of available capacity.",
    takeaway: "Even modest packet loss (5-10%) causes exponential perceived latency in reliable protocols.",
    metric: "Drop Rate: 15%",
  },
  {
    id: "retransmission",
    title: "04. TCP Retransmissions & Timeout",
    summary: "Unlike UDP, TCP guarantees reliable ordered delivery. When an ACK is not received, the sender must wait for RTO and retransmit.",
    apply: { lossPct: 22, latencyMs: 80, bandwidthKbps: 15000, failedLinks: [] },
    result: "Each dropped segment costs 1-2 additional RTTs. A 200 KB upload requires multiple retransmission rounds.",
    takeaway: "The reliability guarantee of TCP turns packet drops directly into latency penalties.",
    metric: "Retries: High",
  },
  {
    id: "congestion",
    title: "05. Congestion & Bufferbloat",
    summary: "When traffic arrival rate exceeds egress link capacity, router memory buffers fill up, dramatically inflating queuing delay.",
    apply: { latencyMs: 85, jitterMs: 50, lossPct: 4, bandwidthKbps: 1200, failedLinks: [] },
    result: "Campus network buffers fill to capacity; jitter jumps to 50 ms and video streaming playhead starves.",
    takeaway: "Excessive queuing in network buffers causes high latency variance and jitter without dropping packets.",
    metric: "Jitter: 50 ms",
  },
  {
    id: "routing",
    title: "06. Routing & Link Failover",
    summary: "The internet uses dynamic routing protocols (BGP/OSPF) to steer traffic around severed physical links and cable cuts.",
    apply: { failedLinks: ["core-lb"], secondDcEnabled: true, cdnEnabled: false },
    result: "Primary WAN link is cut; traffic reroutes through the Secondary Data Center WAN link automatically.",
    takeaway: "Resilient cloud infrastructure relies on multi-homed BGP routes to survive backbone cable cuts.",
    metric: "Failover: Active",
  },
  {
    id: "dns",
    title: "07. DNS Resolution",
    summary: "Domain Name System translates human-readable hostnames into IP addresses via root, TLD, and authoritative nameservers.",
    apply: { latencyMs: 120, lossPct: 0, bandwidthKbps: 40000, failedLinks: [] },
    result: "Cold DNS resolution takes 1-2 round trips before the client can even initiate a connection to the cloud.",
    takeaway: "DNS caching (TTL) is critical to prevent cold-lookup penalties on every cloud transaction.",
    metric: "DNS Overhead: ~75 ms",
  },
  {
    id: "tcp_handshake",
    title: "08. TCP 3-Way Handshake",
    summary: "Before transmitting HTTP data, TCP requires SYN -> SYN-ACK -> ACK to synchronize sequence numbers and allocate socket buffers.",
    apply: { latencyMs: 140, lossPct: 0, bandwidthKbps: 50000, failedLinks: [] },
    result: "Handshake takes exactly 1 full RTT (140 ms). Zero application bytes have transferred yet.",
    takeaway: "Keep-Alive and connection pooling prevent the 1-RTT connection setup penalty on every API request.",
    metric: "Cost: 1 RTT",
  },
  {
    id: "tls",
    title: "09. TLS / SSL Encryption Overhead",
    summary: "Transport Layer Security negotiates cipher suites, validates x509 certificates, and derives session keys using Diffie-Hellman.",
    apply: { latencyMs: 110, lossPct: 0, bandwidthKbps: 50000, failedLinks: [] },
    result: "TLS 1.2 requires 2 RTTs; TLS 1.3 optimizes to 1 RTT. At 110 ms latency, security negotiation costs 150-200 ms.",
    takeaway: "Modern TLS 1.3 and session tickets minimize encryption latency over high-RTT links.",
    metric: "TLS Delay: ~165 ms",
  },
  {
    id: "load_balancing",
    title: "10. Cloud Load Balancing",
    summary: "Reverse proxy load balancers distribute incoming requests across backend application instances and perform health checks.",
    apply: { failedLinks: ["lb-app"], cdnEnabled: false, secondDcEnabled: false },
    result: "When the link to the app tier fails, the load balancer detects 502/504 health check failure and sheds traffic.",
    takeaway: "Load balancers isolate clients from backend server failures, but represent a critical hop in the network path.",
    metric: "Routing: Layer 7",
  },
  {
    id: "cdn",
    title: "11. Content Delivery Networks (CDN)",
    summary: "CDNs cache static assets and video chunks in Points of Presence (POPs) located directly inside local ISP networks.",
    apply: { failedLinks: ["core-lb"], cdnEnabled: true, secondDcEnabled: false },
    result: "Origin data center is completely cut off, yet video stream continues playing from nearest CDN edge cache.",
    takeaway: "CDNs terminate connections close to the user, eliminating long-distance backbone RTTs for cached media.",
    metric: "Edge Cache: Hit",
  },
  {
    id: "redundancy",
    title: "12. Multi-Datacenter Redundancy",
    summary: "Mission-critical applications operate across multiple active-active or active-passive cloud regions to survive regional disasters.",
    apply: { failedLinks: ["core-lb"], secondDcEnabled: true, cdnEnabled: false },
    result: "Primary region cut off; Secondary DC automatically takes over incoming requests without downtime.",
    takeaway: "True cloud reliability requires redundant physical networking across independent power and transit corridors.",
    metric: "DC2: Active",
  },
  {
    id: "replication",
    title: "13. Database Replication & Lag",
    summary: "Writing to a primary database requires streaming write-ahead logs (WAL) across the WAN to standby read replicas.",
    apply: { latencyMs: 220, lossPct: 3, replicaEnabled: true, failedLinks: [] },
    result: "Replication lag jumps past 2000 ms. Standby replicas serve stale data (eventual consistency window widens).",
    takeaway: "The CAP theorem in practice: network partition or delay forces a choice between write latency and replica freshness.",
    metric: "Lag: > 2000 ms",
  },
];

export default function Concepts() {
  const { state, patchNetwork } = useLab();
  const navigate = useNavigate();
  const [activeConcept, setActiveConcept] = useState(null);

  return (
    <div className="page">
      <div className="kicker">Concepts Arcade</div>
      <h2>13 Core Principles of Cloud Networking</h2>
      <p className="lede">
        Interactive mini-lessons bridging networking theory with cloud system performance.
        Click "Test in Lab" on any card to inject those exact network conditions and observe the protocol mechanics live.
      </p>

      {/* Grid of all 13 concepts */}
      <div className="cards" style={{ marginTop: 24 }}>
        {CONCEPTS.map((c) => (
          <article
            key={c.id}
            className="panel mission"
            style={{
              borderColor: activeConcept === c.id ? "var(--cyan)" : "var(--stroke)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--cyan)", fontWeight: "bold" }}>
                {c.metric}
              </span>
              <span className="pill live" style={{ fontSize: "0.68rem", padding: "2px 8px" }}>
                INTERACTIVE
              </span>
            </div>

            <h3 style={{ margin: "4px 0 8px", fontSize: "1.15rem" }}>{c.title}</h3>
            <p style={{ margin: "0 0 10px", fontSize: "0.88rem", lineHeight: 1.45 }}>{c.summary}</p>

            <div
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--stroke-subtle)",
                fontSize: "0.76rem",
                marginBottom: 10,
              }}
            >
              <strong style={{ display: "block", color: "var(--cyan)", fontSize: "0.7rem", marginBottom: 2 }}>
                MEASURABLE RESULT:
              </strong>
              <span className="mono">{c.result}</span>
            </div>

            <p className="lede" style={{ fontSize: "0.82rem", margin: "0 0 14px", flex: 1 }}>
              <strong>Takeaway:</strong> {c.takeaway}
            </p>

            <button
              className="btn primary"
              style={{ width: "100%", fontSize: "0.82rem", padding: "8px" }}
              onClick={async () => {
                setActiveConcept(c.id);
                await patchNetwork(c.apply);
                navigate("/lab");
              }}
            >
              Test This in the Lab →
            </button>
          </article>
        ))}
      </div>

      <div
        className="row mono"
        style={{
          marginTop: 24,
          padding: "12px 18px",
          background: "rgba(0, 0, 0, 0.4)",
          borderRadius: 12,
          border: "1px solid var(--stroke-subtle)",
          justifyContent: "space-between",
          fontSize: "0.82rem",
        }}
      >
        <span>
          Current Lab Health: <strong>{state?.health?.score ?? 0}</strong> / 100
        </span>
        <span>
          Active Commentary: <strong>{state?.commentary?.title || "Healthy"}</strong>
        </span>
        <span>
          Latency: <strong>{state?.network?.latencyMs} ms</strong>
        </span>
        <span>
          Loss: <strong>{state?.network?.lossPct}%</strong>
        </span>
      </div>
    </div>
  );
}
