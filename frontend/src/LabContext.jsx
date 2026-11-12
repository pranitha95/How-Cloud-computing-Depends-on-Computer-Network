import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, liveSocket } from "./api.js";

const LabContext = createContext(null);

const THEMES = {
  radar: { name: "Radar" },
  storm: { name: "Storm" },
  exhibit: { name: "Exhibition High Contrast" },
};

export function LabProvider({ children }) {
  const [state, setState] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("cloud_stress_theme") || "radar");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [healthHistory, setHealthHistory] = useState([]);
  const retryRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cloud_stress_theme", theme);
  }, [theme]);

  useEffect(() => {
    closedRef.current = false;
    let ws;

    const apply = (data) => {
      if (!data?.network) return;
      setState(data);
      setConnected(true);
      setError("");
      const score = data.health?.score ?? 0;
      setHealthHistory((h) => [...h, score].slice(-48));
    };

    api("/api/health")
      .then(apply)
      .catch((e) => setError(e.message));

    const connect = () => {
      if (closedRef.current) return;
      ws = liveSocket((msg) => {
        if (msg.type === "state" || msg.network) apply(msg);
      });
      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closedRef.current) {
          retryRef.current += 1;
          setTimeout(connect, Math.min(4000, 800 + retryRef.current * 400));
        }
      };
      ws.onerror = () => setConnected(false);
    };
    connect();
    return () => {
      closedRef.current = true;
      ws?.close();
    };
  }, []);

  const applyServer = (data) => {
    if (data?.network) setState(data);
    return data;
  };

  const setNetwork = (partial) => {
    setState((s) => (s ? { ...s, network: { ...s.network, ...partial } } : s));
  };

  const patchNetwork = async (partial) => {
    const next = { ...(state?.network || {}), ...partial };
    setNetwork(partial);
    return applyServer(await api("/api/network", { method: "PUT", body: next }));
  };

  const command = async (path, options) => applyServer(await api(path, options));

  const value = useMemo(
    () => ({
      state,
      connected,
      error,
      theme,
      setTheme,
      themes: THEMES,
      healthHistory,
      setNetwork,
      patchNetwork,
      command,
    }),
    [state, connected, error, theme, healthHistory]
  );

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLab() {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error("useLab outside provider");
  return ctx;
}
