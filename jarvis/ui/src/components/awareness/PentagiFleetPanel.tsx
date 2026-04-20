import React, { useState, useEffect } from "react";
import "../../styles/pentagi.css";

type AgentState = "idle" | "running" | "paused" | "error";

interface SubAgent {
  id: string;
  name: string;
  role: string;
  state: AgentState;
  currentTask: string | null;
  cpu: number;
  memory: number;
}

interface TaskNode {
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "failed";
  children: TaskNode[];
}

const mockAgents: SubAgent[] = [
  { id: "ag-01", name: "Cipher", role: "Security Auditor", state: "running", currentTask: "Scanning network interfaces", cpu: 45, memory: 1024 },
  { id: "ag-02", name: "Nexus", role: "Orchestrator", state: "idle", currentTask: null, cpu: 5, memory: 256 },
  { id: "ag-03", name: "Ghost", role: "Reconnaissance", state: "paused", currentTask: "Awaiting user input", cpu: 0, memory: 512 },
  { id: "ag-04", name: "Forge", role: "Payload Generator", state: "error", currentTask: "Compiling exploit", cpu: 100, memory: 2048 },
];

const mockTaskTree: TaskNode = {
  id: "t-00",
  label: "Operation PentAGI",
  status: "active",
  children: [
    {
      id: "t-01",
      label: "Phase 1: Recon",
      status: "completed",
      children: [{ id: "t-01a", label: "Port Scan", status: "completed", children: [] }]
    },
    {
      id: "t-02",
      label: "Phase 2: Exploit",
      status: "active",
      children: [
        { id: "t-02a", label: "Generate Payload", status: "failed", children: [] },
        { id: "t-02b", label: "Deliver Payload", status: "pending", children: [] }
      ]
    }
  ]
};

const mockLogs = [
  "[SYS] Agent Fleet Master initialized.",
  "[Cipher] Initiating network scan on eth0...",
  "[Cipher] Found active host: 192.168.1.100",
  "[Nexus] Dispatching Ghost to investigate 192.168.1.100",
  "[Ghost] Scraping service headers... found SSH 8.2p1",
  "[Forge] Error: Failed to compile payload buffer overflow.",
  "[SYS] WARNING: Resource spike detected on AG-04 (Forge)."
];

export function PentagiFleetPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < mockLogs.length) {
        setLogs(prev => [...prev, mockLogs[i]!]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const renderTaskTree = (node: TaskNode) => (
    <div key={node.id} className="pentagi-task-node">
      <div className={`pentagi-task-label status-${node.status}`}>
        <span className="task-icon">{node.status === "completed" ? "✓" : node.status === "failed" ? "✗" : node.status === "active" ? "↻" : "○"}</span>
        {node.label}
      </div>
      {node.children.length > 0 && (
        <div className="pentagi-task-children">
          {node.children.map(renderTaskTree)}
        </div>
      )}
    </div>
  );

  return (
    <div className="pentagi-dashboard">
      <div className="pentagi-main-grid">
        {/* Fleet Status */}
        <div className="pentagi-panel fleet-panel">
          <h3 className="pentagi-panel-title">Fleet Orchestration</h3>
          <div className="pentagi-agents-grid">
            {mockAgents.map(agent => (
              <div key={agent.id} className={`pentagi-agent-card state-${agent.state}`}>
                <div className="agent-header">
                  <span className="agent-id">{agent.id}</span>
                  <span className="agent-state-badge">{agent.state}</span>
                </div>
                <div className="agent-name">{agent.name}</div>
                <div className="agent-role">{agent.role}</div>
                <div className="agent-task">
                  {agent.currentTask ? `> ${agent.currentTask}` : "> Awaiting orders"}
                </div>
                <div className="agent-metrics">
                  <div className="metric"><span>CPU:</span> {agent.cpu}%</div>
                  <div className="metric"><span>MEM:</span> {agent.memory}MB</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Graph */}
        <div className="pentagi-panel task-graph-panel">
          <h3 className="pentagi-panel-title">Task Graph</h3>
          <div className="pentagi-tree-container">
            {renderTaskTree(mockTaskTree)}
          </div>
        </div>
      </div>

      {/* Console Logs */}
      <div className="pentagi-panel console-panel">
        <h3 className="pentagi-panel-title">Telemetry & Traces</h3>
        <div className="pentagi-console-output">
          {logs.map((log, idx) => (
            <div key={idx} className={`console-line ${log.includes("Error") || log.includes("WARNING") ? "log-error" : "log-info"}`}>
              {log}
            </div>
          ))}
          <div className="console-cursor">_</div>
        </div>
      </div>
    </div>
  );
}
