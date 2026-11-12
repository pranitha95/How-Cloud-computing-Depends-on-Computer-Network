# Cloud Under Stress ⚡🌩️
> **Interactive Educational Platform: The Cloud is Only as Reliable as the Network Connecting It.**

Cloud Under Stress demonstrates the direct physical relationship between computer networks and cloud service reliability.
Through real-time network impairment shaping, students can inject latency, packet loss, bandwidth bottlenecks, jitter, and physical link cuts, and observe how cloud uploads, adaptive video streaming, and multi-region database replication degrade or recover in real time.

---

## 🏛️ System Architecture

Cloud Under Stress is built on a responsive 3-tier architecture:

```
[ Browser / Client ] 
        ↕ (WebSocket /ws/live + REST HTTP /api/*)
[ Express & Network Simulation Engine (Node.js 22+) ]
        ↕ (Internal In-Process Shaper & Timer Loop)
[ SQLite WAL Database (lab.db via node:sqlite DatabaseSync) ]
```

### Path Topology
```
[User / Client]
       ↓ (Last Mile)
     [ISP]
       ↓ (Internet Backbone)
 [Internet Core]
   ├──→ [CDN Edge] ──→ (Cached Media Delivery)
   ├──→ [Primary WAN] ──→ [Load Balancer] ──→ [Cloud App] ──→ [Primary DB] ──→ [Replica DB]
   └──→ [Secondary DC] ──┘ (Redundant WAN Failover Path)
```

---

## 📂 Project Structure

```
cloud-under-stress/
├── backend/
│   ├── data/
│   │   ├── lab.db                  # Embedded SQLite WAL database
│   │   └── uploads/                # Uploaded cloud files directory
│   ├── src/
│   │   ├── db.js                   # Database initialization and prepared SQL statements
│   │   ├── network.js              # Network emulator, goodput formulas, and 7-stage flow engine
│   │   └── index.js                # Express API endpoints and WebSocket live broadcast server
│   ├── tests/
│   │   ├── network.test.js         # Mathematical model and failover logic tests
│   │   └── api.test.js             # End-to-end HTTP API integration tests
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── PacketMap.jsx       # SVG dynamic topology with link cuts and animated packets
│   │   ├── pages/
│   │   │   ├── Briefing.jsx        # Landing page with interactive loss slider demo
│   │   │   ├── Lab.jsx             # Stress Lab: sliders, health gauge, upload, video, replica
│   │   │   ├── Missions.jsx        # 6 Interactive missions with live progress evaluation
│   │   │   ├── Anatomy.jsx         # Hidden Path of a Request (7 sequential stages)
│   │   │   ├── Concepts.jsx        # 13 Interactive Mini-Lessons in the Concepts Arcade
│   │   │   ├── Experiments.jsx     # Telemetry graphing, session logging, and CSV export
│   │   │   └── HowItWorks.jsx      # Architecture, math models, and viva defense cheat sheet
│   │   ├── api.js                  # Fetch wrapper and WebSocket client
│   │   ├── LabContext.jsx          # Reactive global context with theme persistence
│   │   ├── App.jsx                 # Top-level router and radar navigation
│   │   ├── main.jsx                # React root bootstrap
│   │   └── index.css               # Mission-control radar/storm/exhibit themes
│   ├── index.html
│   ├── vite.config.js              # Vite server configured for port 5173 with API proxy
│   └── package.json
├── package.json                    # Root workspace orchestration scripts
├── .env.example
├── README.md                       # Comprehensive project documentation
└── PROJECT_HANDOVER.md             # Developer handover and verification report
```

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite 6, React Router 7, IBM Plex Mono & Outfit typography.
- **Backend**: Node.js 22+, Express 5, WebSocket (`ws`), Multer.
- **Database**: Embedded SQLite using Node's native `node:sqlite` (`DatabaseSync`) with Write-Ahead Logging (`WAL`). No native C++ compilation dependencies required.
- **Network Simulation Engine**: Deterministic RTT queuing, packet drop Bernoulli trails, TCP window backoff models, and Adaptive Bitrate (ABR) ladder selection.

---

## 🚀 Getting Started (Windows PowerShell)

### Prerequisites
- Node.js 22.0.0 or higher (`node -v` to verify).
- npm 10+ (`npm -v` to verify).

### 1. Installation
Run from the root directory:
```powershell
# Install root orchestration tools
npm install

# Install all frontend and backend dependencies
npm run install:all
```

### 2. Database Initialization
The database initializes automatically on first run in `backend/data/lab.db` with full schema and WAL mode enabled. No manual SQL migrations or database setup steps are needed.

### 3. Run Automated Tests
```powershell
# Run the 21 automated unit and integration tests
npm test
```

### 4. Start the Application
You can run both backend and frontend concurrently with one command:
```powershell
npm run dev
```

Or open two separate PowerShell terminals:

**Terminal 1 (Backend API):**
```powershell
cd "backend"
npm run dev
```
*Backend runs on: `http://localhost:4000`*

**Terminal 2 (Frontend Client):**
```powershell
cd "frontend"
npm run dev
```
*Frontend runs on: `http://localhost:5173`*

Open your browser at **[http://localhost:5173](http://localhost:5173)**.

---

## 📡 API Overview

### Network & Telemetry
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Live snapshot: network profile, health breakdown, commentary, routes |
| `GET` | `/api/network` | Current network profile and link states |
| `PUT` | `/api/network` | Update latency, loss, bandwidth, jitter, toggles |
| `POST` | `/api/network/preset` | Apply preset (`healthy`, `wifi`, `campus`, `transatlantic`, `cut`, `storm`) |
| `POST` | `/api/network/reset` | Restore pristine low-latency baseline |
| `POST` | `/api/network/link` | Sever or restore a specific link by ID |
| `POST` | `/api/network/chaos` | Toggle automated chaos mode |

### Cloud File Uploads
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a file or synthetic test blob shaped by network state |
| `GET` | `/api/uploads` | List recent uploaded files and transfer telemetry |
| `GET` | `/api/uploads/:id` | Fetch metadata for a specific uploaded object |
| `DELETE` | `/api/uploads/:id` | Delete uploaded file from storage and database |

### Adaptive Video Streaming
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/video/manifest` | Fetch video quality ladder (1080p, 720p, 480p, 240p) and suggested rung |
| `GET` | `/api/video/status` | Current streaming status, goodput, buffer state, and starving flag |
| `GET` | `/api/video/chunk` | Download chunk shaped with delay and drop probability |

### Cloud Database Replication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/db/write` | Commit transaction to primary SQLite database |
| `GET` | `/api/db/status` | Primary vs replica sync status, replication lag (ms), pending queue |
| `GET` | `/api/db/records` | List recent primary records and replication state |
| `DELETE` | `/api/db/records/:id` | Delete record and cascade delete replica record |

### Request Flow Simulation
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/request-flow/simulate` | Returns 7 sequential stages with simulated timing |
| `GET` | `/api/trace` | Query request stage timing for specified service |

### Missions & Challenges
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/challenges` | List 6 guided engineering missions and past runs |
| `POST` | `/api/challenges/:id/setup` | Apply recommended starting network conditions |
| `POST` | `/api/challenges/:id/complete` | Evaluate mission completion against live state |

### Experiment Sessions & CSV Export
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/experiments` | List recorded experiments |
| `POST` | `/api/experiments` | Start a new recording session |
| `GET` | `/api/experiments/:id` | Fetch session details and all samples |
| `POST` | `/api/experiments/:id/stop` | Finalize session and compute averages |
| `GET` | `/api/experiments/:id/export.csv` | Download verified CSV dataset |
| `DELETE` | `/api/experiments/:id` | Delete experiment and sample records |

---

## 🎯 The 6 Guided Missions

1. **Mission 1: Starve the Player**: Force adaptive video to buffer or drop to 240p without severing any physical cables.
2. **Mission 2: Desync the Replica**: Cause database replication lag to exceed 2000 ms and verify replica drift.
3. **Mission 3: Survive a Cable Cut**: Cut the primary WAN link, but keep cloud traffic surviving via Edge CDN or Secondary DC failover.
4. **Mission 4: Recover from Packet Storm**: Bring Cloud Health Score back to ≥ 85 after severe packet loss.
5. **Mission 5: Sweet Spot for 720p**: Tune bandwidth to the exact threshold required for stable 720p playback (2200–5000 kbps).
6. **Mission 6: Campus Congestion Study**: Observe throughput and health degradation on a congested campus network.

---

## 🔬 Simulation Assumptions & Formulas

1. **Effective Goodput**:
   $$\text{Goodput} \approx \text{Bandwidth} \times (1 - p)^2 \times \frac{1}{1 + \frac{\text{RTT}}{200}}$$
2. **TCP Retransmission Overhead**:
   $$\text{Extra RTTs} \approx \frac{p}{1 - p} \quad (\text{for drop rate } p)$$
3. **Transfer Duration**:
   $$\text{Total ms} = \frac{\text{Bytes}}{\text{Bandwidth}} \times 1000 + \text{RTT} \times (1 + \text{Extra RTTs})$$
4. **Cloud Health Score (0–100)**:
   $$\text{Health} = 100 - \text{LatencyPen} - \text{LossPen} - \text{BwPen} - \text{JitterPen} - \text{LinkPen} - \text{ReplicaPen} + \text{RedundancyBonus}$$

---

## 🛡️ Troubleshooting

- **Port 4000 Already in Use (`EADDRINUSE`)**:
  Kill any lingering background node process:
  ```powershell
  Get-Process node | Stop-Process -Force
  ```
- **PowerShell File Uploads**:
  PowerShell 5.1 does not support `-Form`. Use `curl.exe` (built-in on Windows 10/11) or use the built-in synthetic upload endpoint:
  ```powershell
  # Using curl:
  curl.exe -F "file=@path\to\file.bin" http://localhost:4000/api/upload

  # Using PowerShell JSON synthetic blob:
  Invoke-RestMethod -Uri "http://localhost:4000/api/upload" -Method Post -ContentType "application/json" -Body '{"syntheticBytes": 200000}'
  ```
