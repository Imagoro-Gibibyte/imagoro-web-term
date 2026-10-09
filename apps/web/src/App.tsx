import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TabBar } from "./components/TabBar";
import { TerminalView } from "./terminal/Terminal";
import { agentUrlFromEnv, fetchAgentInfo } from "./terminal/agentClient";
import type { AgentInfo, Session } from "./types";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}`;
}

export function App() {
  const [sessions, setSessions] = useState<Session[]>(() => [
    { id: newId(), title: "demo", kind: "demo" }
  ]);
  const [activeId, setActiveId] = useState<string>(() => sessions[0]!.id);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const counter = useRef(1);

  const agentUrl = useMemo(() => agentUrlFromEnv(), []);

  useEffect(() => {
    let cancelled = false;
    fetchAgentInfo(agentUrl).then((info) => {
      if (!cancelled) setAgentInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [agentUrl]);

  const addSession = useCallback((kind: Session["kind"], shell?: string) => {
    const id = newId();
    const title =
      kind === "demo" ? `demo ${++counter.current}` : shell ?? "agent";
    setSessions((prev) => [...prev, { id, title, kind, shell }]);
    setActiveId(id);
    setMenuOpen(false);
  }, []);

  const pickNeighbor = (list: Session[], removedIdx: number): string =>
    list[Math.max(0, removedIdx - 1)]!.id;

  const closeSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) return;
      const idx = sessions.findIndex((s) => s.id === id);
      const next = sessions.filter((s) => s.id !== id);
      setSessions(next);
      if (activeId === id) setActiveId(pickNeighbor(next, idx));
    },
    [sessions, activeId]
  );

  // Exit never leaves the app empty: replacing the last tab with a fresh demo.
  const exitSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) {
        const fresh: Session = { id: newId(), title: "demo", kind: "demo" };
        setSessions([fresh]);
        setActiveId(fresh.id);
        return;
      }
      const idx = sessions.findIndex((s) => s.id === id);
      const next = sessions.filter((s) => s.id !== id);
      setSessions(next);
      if (activeId === id) setActiveId(pickNeighbor(next, idx));
    },
    [sessions, activeId]
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▚</span>
          <span className="brand-name">Imagoro Web Term</span>
        </div>
        <div className="agent-chip" data-online={!!agentInfo}>
          <span className="dot" data-status={agentInfo ? "ready" : "disconnected"} />
          {agentInfo
            ? `agent · ${agentInfo.platform}`
            : "no agent (demo only)"}
        </div>
      </header>

      <div className="tabrow">
        <TabBar
          sessions={sessions}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeSession}
          onAdd={() => setMenuOpen((v) => !v)}
          menuOpen={menuOpen}
        />
        {menuOpen && (
          <div className="add-menu" role="menu">
            <button role="menuitem" onClick={() => addSession("demo")}>
              Demo shell
            </button>
            {agentInfo ? (
              agentInfo.shells.map((sh) => (
                <button key={sh} role="menuitem" onClick={() => addSession("agent", sh)}>
                  {sh}
                </button>
              ))
            ) : (
              <button role="menuitem" disabled title="run `pnpm agent` first">
                Agent shells (no agent found)
              </button>
            )}
          </div>
        )}
      </div>

      <main className="term-area">
        {sessions.map((s) => (
          <TerminalView
            key={s.id}
            session={s}
            active={s.id === activeId}
            onExit={exitSession}
          />
        ))}
      </main>
    </div>
  );
}
