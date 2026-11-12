import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProfile,
  healthScore,
  videoQuality,
  simulateTransfer,
  isServiceReachable,
  replicaLagMs,
  goodputKbps,
} from "./engine.js";

test("healthy network scores high and can stream HD", () => {
  const p = normalizeProfile({ latencyMs: 20, lossPct: 0, bandwidthKbps: 50000 });
  assert.ok(healthScore(p) >= 90);
  assert.equal(videoQuality(p), "1080p");
  assert.equal(isServiceReachable(p, "origin"), true);
});

test("20% loss slows transfers and hurts health", () => {
  const good = normalizeProfile({ latencyMs: 25, lossPct: 0, bandwidthKbps: 20000 });
  const bad = normalizeProfile({ latencyMs: 25, lossPct: 20, bandwidthKbps: 20000 });
  const a = simulateTransfer(good, 500_000, "upload");
  const b = simulateTransfer(bad, 500_000, "upload");
  assert.ok(b.simulatedMs > a.simulatedMs);
  assert.ok(healthScore(bad) < healthScore(good));
  assert.ok(goodputKbps(bad) < goodputKbps(good));
});

test("narrow bandwidth drops video quality", () => {
  const p = normalizeProfile({ latencyMs: 30, lossPct: 0, bandwidthKbps: 700 });
  assert.ok(["240p", "buffering"].includes(videoQuality(p)));
});

test("cut primary path without backup takes the origin down", () => {
  const p = normalizeProfile({ failedLinks: ["core-dc1"], secondDcEnabled: false, cdnEnabled: false });
  assert.equal(isServiceReachable(p, "origin"), false);
  assert.equal(isServiceReachable(p, "video"), false);
});

test("CDN keeps video up after origin cable cut", () => {
  const p = normalizeProfile({ failedLinks: ["core-dc1"], cdnEnabled: true });
  assert.equal(isServiceReachable(p, "video"), true);
  assert.equal(isServiceReachable(p, "origin"), false);
});

test("second DC failovers origin traffic", () => {
  const p = normalizeProfile({ failedLinks: ["core-dc1"], secondDcEnabled: true });
  assert.equal(isServiceReachable(p, "origin"), true);
  const blocked = normalizeProfile({ failedLinks: ["core-dc1", "dc2-lb"], secondDcEnabled: true });
  assert.equal(isServiceReachable(blocked, "origin"), false);
});

test("replica lag grows with RTT and a cut replica link never syncs", () => {
  const near = normalizeProfile({ latencyMs: 15, replicaEnabled: true });
  const far = normalizeProfile({ latencyMs: 200, replicaEnabled: true });
  assert.ok(replicaLagMs(far) > replicaLagMs(near));
  const cut = normalizeProfile({ failedLinks: ["dc1-replica"], replicaEnabled: true });
  assert.equal(isServiceReachable(cut, "replica"), false);
});
