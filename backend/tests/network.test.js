import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampProfile,
  healthBreakdown,
  pathOpen,
  transferMs,
  retransmissionRtts,
  handshakeTimeline,
  simulateRequestFlow,
  pickQuality,
  defaultState,
  PRESETS,
} from "../src/network.js";

describe("network emulator math & failover logic", () => {
  it("clamps hostile input", () => {
    const p = clampProfile({ latencyMs: 99999, lossPct: -4, bandwidthKbps: 1, failedLinks: ["nope", "core-lb"] });
    assert.equal(p.latencyMs, 2000);
    assert.equal(p.lossPct, 0);
    assert.equal(p.bandwidthKbps, 64);
    assert.deepEqual(p.failedLinks, ["core-lb"]);
  });

  it("drops health when loss and delay rise", () => {
    const good = healthBreakdown(defaultState()).score;
    const bad = healthBreakdown({ ...defaultState(), latencyMs: 200, lossPct: 20, bandwidthKbps: 500 }).score;
    assert.ok(good > 90);
    assert.ok(bad < good - 30);
  });

  it("blocks origin when the cable is cut without backup, allows CDN video", () => {
    const cut = { ...defaultState(), failedLinks: ["core-lb"], cdnEnabled: true, secondDcEnabled: false };
    assert.equal(pathOpen(cut, "api").ok, false);
    assert.equal(pathOpen(cut, "video").ok, true);
    assert.equal(pathOpen(cut, "video").via, "cdn");
  });

  it("routes origin traffic through secondary DC when primary WAN is cut and backup is enabled", () => {
    const cutWithBackup = { ...defaultState(), failedLinks: ["core-lb"], secondDcEnabled: true };
    const route = pathOpen(cutWithBackup, "api");
    assert.equal(route.ok, true);
    assert.equal(route.via, "secondary-dc");
  });

  it("models slower transfers on skinny pipes", () => {
    const fat = transferMs(1_000_000, { bandwidthKbps: 80000 });
    const thin = transferMs(1_000_000, { bandwidthKbps: 800 });
    assert.ok(thin > fat * 50);
  });

  it("adds retransmission RTTs as loss grows", () => {
    assert.ok(retransmissionRtts({ lossPct: 20 }) > retransmissionRtts({ lossPct: 1 }));
  });

  it("handshake total grows with latency", () => {
    const near = handshakeTimeline({ latencyMs: 10, lossPct: 0, bandwidthKbps: 40000 }).total;
    const far = handshakeTimeline({ latencyMs: 180, lossPct: 0, bandwidthKbps: 40000 }).total;
    assert.ok(far > near);
  });

  it("simulates 7-stage request flow with DNS, TCP, TLS, LB, App, DB, and Response", () => {
    const flow = simulateRequestFlow(defaultState(), "db");
    assert.equal(flow.ok, true);
    assert.equal(flow.steps.length, 7);
    assert.equal(flow.steps[0].name, "DNS lookup");
    assert.equal(flow.steps[1].name, "TCP connection handshake");
    assert.equal(flow.steps[2].name, "TLS handshake");
    assert.equal(flow.steps[3].name, "Load balancer");
    assert.equal(flow.steps[4].name, "Cloud application");
    assert.equal(flow.steps[5].name, "Database request");
    assert.equal(flow.steps[6].name, "Response returned to client");
    assert.ok(flow.totalMs > 0);
  });

  it("picks lower video rungs when goodput collapses", () => {
    assert.equal(pickQuality(8000, 5).id, "1080p");
    assert.equal(pickQuality(300, 0.4).id, "240p");
  });

  it("isolates the replica when the sync link is cut", () => {
    const cut = { ...defaultState(), failedLinks: ["db-replica"] };
    assert.equal(pathOpen(cut, "replica").ok, false);
    assert.equal(pathOpen(cut, "db").ok, true);
  });

  it("includes expected built-in presets", () => {
    assert.ok(PRESETS.healthy);
    assert.ok(PRESETS.wifi);
    assert.ok(PRESETS.campus);
    assert.ok(PRESETS.transatlantic);
    assert.ok(PRESETS.cut);
    assert.ok(PRESETS.storm);
  });
});
