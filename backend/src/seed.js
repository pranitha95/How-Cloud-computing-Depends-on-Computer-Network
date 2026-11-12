import { prisma } from "./db.js";

const PRESETS = [
  {
    name: "Healthy campus",
    description: "Low delay, fat pipe — how the cloud feels on a good day.",
    latencyMs: 18,
    jitterMs: 2,
    lossPct: 0,
    bandwidthKbps: 80000,
    failedLinks: "[]",
  },
  {
    name: "Transatlantic",
    description: "Physics of distance: ~80ms one-way to another continent.",
    latencyMs: 90,
    jitterMs: 8,
    lossPct: 0.4,
    bandwidthKbps: 40000,
    failedLinks: "[]",
  },
  {
    name: "Bad Wi-Fi",
    description: "Lossy last mile. TCP keeps retransmitting.",
    latencyMs: 40,
    jitterMs: 35,
    lossPct: 18,
    bandwidthKbps: 6000,
    failedLinks: "[]",
  },
  {
    name: "Congested campus",
    description: "Everyone is on the network. Bandwidth collapses.",
    latencyMs: 55,
    jitterMs: 20,
    lossPct: 4,
    bandwidthKbps: 900,
    failedLinks: "[]",
  },
  {
    name: "Cable cut",
    description: "Primary DC path is down. Without redundancy the cloud vanishes.",
    latencyMs: 25,
    jitterMs: 0,
    lossPct: 0,
    bandwidthKbps: 50000,
    failedLinks: '["core-dc1"]',
  },
];

export async function seed() {
  for (const preset of PRESETS) {
    await prisma.preset.upsert({
      where: { name: preset.name },
      update: preset,
      create: preset,
    });
  }
}
