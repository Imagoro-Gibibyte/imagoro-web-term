import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { termOptions } from "../theme";
import type { Session } from "../types";
import {
  AgentConnection,
  agentUrlFromEnv,
  type AgentHandlers
} from "./agentClient";
import { DemoShell } from "./demo";

interface Props {
  session: Session;
  /** Only the active tab should be visible; keep others mounted but hidden. */
  active: boolean;
  onExit: (id: string) => void;
}

export function TerminalView({ session, active, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<string>("connecting");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm(termOptions);
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* webgl optional; canvas fallback is fine */
    }
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    let conn: AgentConnection | null = null;
    let disposed = false;

    const fitAndResize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      conn?.resize(term.cols, term.rows);
    };

    if (session.kind === "demo") {
      const demo = new DemoShell((s) => term.write(s));
      setStatus("demo");
      demo.start();
      const sub = term.onData((d) => demo.input(d));
      const onResize = () => fitAndResize();
      const ro = new ResizeObserver(onResize);
      ro.observe(host);
      return () => {
        sub.dispose();
        ro.disconnect();
        term.dispose();
        termRef.current = null;
      };
    }

    const handlers: AgentHandlers = {
      onOutput: (data) => term.write(data),
      onReady: (info) => {
        setStatus(`${info.platform} · ${info.shell}`);
        term.focus();
      },
      onExit: (code) => {
        term.write(`\r\n\x1b[2m[session exited: ${code}]\x1b[0m\r\n`);
        setStatus("exited");
      },
      onError: (message) => {
        setStatus("error");
        term.write(`\r\n\x1b[31m[${message}]\x1b[0m\r\n`);
      },
      onClose: () => {
        if (!disposed) {
          setStatus("disconnected");
          term.write("\r\n\x1b[2m[disconnected]\x1b[0m\r\n");
        }
      }
    };

    conn = new AgentConnection(agentUrlFromEnv(), handlers);
    setStatus("connecting");
    conn.connect({
      cols: term.cols,
      rows: term.rows,
      shell: session.shell,
      session: session.id
    });
    term.onData((d) => conn?.input(d));

    const onVisibility = () => {
      if (!document.hidden) fitAndResize();
    };
    const ro = new ResizeObserver(() => fitAndResize());
    ro.observe(host);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      conn?.close();
      term.dispose();
      termRef.current = null;
    };
  }, [session.id, session.kind, session.shell]);

  useEffect(() => {
    if (active) {
      fitRef.current?.fit();
      termRef.current?.focus();
    }
  }, [active]);

  return (
    <div className="term-pane" data-active={active}>
      <div className="term-host" ref={hostRef} />
      <div className="term-status" title="session status">
        <span className="dot" data-status={status.split(" ")[0]} />
        {status}
        {(status === "exited" || status === "disconnected") && (
          <button className="link" onClick={() => onExit(session.id)}>
            close
          </button>
        )}
      </div>
    </div>
  );
}
