import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:4000";
let serverInstance = null;

describe("API endpoint integration tests", () => {
  before(async () => {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      const mod = await import("../src/index.js");
      serverInstance = mod.server;
      await new Promise((r) => setTimeout(r, 400));
    }
  });

  after(async () => {
    if (serverInstance) {
      if (serverInstance.wss) {
        try { serverInstance.wss.close(); } catch {}
      }
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });
  it("GET /api/health returns healthy status and metrics", async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.health);
    assert.equal(typeof data.health.score, "number");
    assert.ok(data.network);
    assert.ok(Array.isArray(data.links));
  });

  it("PUT /api/network clamps and applies settings", async () => {
    const res = await fetch(`${BASE}/api/network`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latencyMs: 65, lossPct: 4, bandwidthKbps: 8000 }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.network.latencyMs, 65);
    assert.equal(data.network.lossPct, 4);
    assert.equal(data.network.bandwidthKbps, 8000);
  });

  it("POST /api/network/reset restores defaults", async () => {
    const res = await fetch(`${BASE}/api/network/reset`, { method: "POST" });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.network.latencyMs, 15);
    assert.equal(data.network.lossPct, 0);
  });

  it("POST /api/network/preset applies known preset", async () => {
    const res = await fetch(`${BASE}/api/network/preset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "transatlantic" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.network.latencyMs, 180);
  });

  it("POST /api/upload supports synthetic test blobs", async () => {
    const res = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syntheticBytes: 25000 }),
    });
    assert.ok([201, 503].includes(res.status));
    const data = await res.json();
    assert.ok(data.id);
    assert.equal(data.size, 25000);

    // Verify GET /api/uploads/:id
    const single = await fetch(`${BASE}/api/uploads/${data.id}`);
    assert.equal(single.status, 200);
    const singleData = await single.json();
    assert.equal(singleData.id, data.id);
  });

  it("GET /api/video/status and /api/video/manifest work", async () => {
    const manifest = await fetch(`${BASE}/api/video/manifest`);
    assert.equal(manifest.status, 200);
    const mData = await manifest.json();
    assert.ok(Array.isArray(mData.ladder));

    const status = await fetch(`${BASE}/api/video/status`);
    assert.equal(status.status, 200);
    const sData = await status.json();
    assert.ok(sData.currentQuality);
    assert.ok(typeof sData.goodputKbps === "number");
  });

  it("Database writes, lists records, and deletes records", async () => {
    const writeRes = await fetch(`${BASE}/api/db/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "integration-test-record" }),
    });
    assert.ok([201, 503].includes(writeRes.status));
    const writeData = await writeRes.json();
    assert.ok(writeData.id);

    const listRes = await fetch(`${BASE}/api/db/records`);
    assert.equal(listRes.status, 200);
    const records = await listRes.json();
    assert.ok(Array.isArray(records));
    assert.ok(records.some((r) => r.id === writeData.id));

    const delRes = await fetch(`${BASE}/api/db/records/${writeData.id}`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.ok, true);
  });

  it("POST /api/request-flow/simulate returns 7 stages", async () => {
    const res = await fetch(`${BASE}/api/request-flow/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "api" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.steps.length, 7);
  });

  it("Missions catalog contains all 6 missions and supports setup and completion", async () => {
    const res = await fetch(`${BASE}/api/challenges`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.catalog.length, 6);

    // Setup mission-1
    const setup = await fetch(`${BASE}/api/challenges/mission-1/setup`, { method: "POST" });
    assert.equal(setup.status, 200);

    // Check completion
    const complete = await fetch(`${BASE}/api/challenges/mission-1/complete`, { method: "POST" });
    assert.equal(complete.status, 200);
    const cData = await complete.json();
    assert.ok("success" in cData);
  });

  it("Experiments can be created, sampled, stopped, and exported to CSV", async () => {
    const expRes = await fetch(`${BASE}/api/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "test-run", notes: "testing csv export" }),
    });
    assert.equal(expRes.status, 201);
    const exp = await expRes.json();

    const stopRes = await fetch(`${BASE}/api/experiments/${exp.id}/stop`, { method: "POST" });
    assert.equal(stopRes.status, 200);

    const csvRes = await fetch(`${BASE}/api/experiments/${exp.id}/export.csv`);
    assert.equal(csvRes.status, 200);
    const csv = await csvRes.text();
    assert.ok(csv.includes("ts,latency_ms,loss_pct"));

    // Cleanup
    await fetch(`${BASE}/api/experiments/${exp.id}`, { method: "DELETE" });
  });
});
