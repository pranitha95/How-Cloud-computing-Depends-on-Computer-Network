import { NavLink, Route, Routes } from "react-router-dom";
import { useLab } from "./LabContext.jsx";
import Briefing from "./pages/Briefing.jsx";
import Lab from "./pages/Lab.jsx";
import Missions from "./pages/Missions.jsx";
import Concepts from "./pages/Concepts.jsx";
import Anatomy from "./pages/Anatomy.jsx";
import Experiments from "./pages/Experiments.jsx";
import HowItWorks from "./pages/HowItWorks.jsx";

export default function App() {
  const { connected, theme, setTheme, themes, error } = useLab();
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">CLOUD <span>UNDER STRESS</span></div>
        <NavLink to="/" end>Briefing</NavLink>
        <NavLink to="/lab">Stress Lab</NavLink>
        <NavLink to="/missions">Missions</NavLink>
        <NavLink to="/concepts">Concepts</NavLink>
        <NavLink to="/anatomy">Request Path</NavLink>
        <NavLink to="/experiments">Experiments</NavLink>
        <NavLink to="/how">How it works</NavLink>
        <div className="nav-right">
          <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
            {Object.entries(themes).map(([id, t]) => (
              <option key={id} value={id}>{t.name}</option>
            ))}
          </select>
          <span className={`pill ${connected ? "live" : "dead"}`}>{connected ? "LINK LIVE" : "RECONNECTING"}</span>
        </div>
      </nav>
      {error && <div className="page err">Backend: {error} — start the API on port 4000.</div>}
      <Routes>
        <Route path="/" element={<Briefing />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/missions" element={<Missions />} />
        <Route path="/concepts" element={<Concepts />} />
        <Route path="/anatomy" element={<Anatomy />} />
        <Route path="/experiments" element={<Experiments />} />
        <Route path="/how" element={<HowItWorks />} />
      </Routes>
    </div>
  );
}
