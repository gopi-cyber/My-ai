import React, { useState } from "react";
import { useIdentity } from "../../contexts/IdentityContext";

type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  description: string;
  verification?: {
    status: 'passed' | 'failed';
    evidence: string;
    timestamp: string;
  };
};

type AgentManagerProps = {
  projectId: string | null;
  onSwitchToEditor: () => void;
};

export function AgentManager({ projectId, onSwitchToEditor }: AgentManagerProps) {
  const { name: assistantName } = useIdentity();
  const [goal, setGoal] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);

  const handleVerifyTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !projectId) return;

    try {
      const response = await fetch("/api/sites/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, taskDescription: task.title }),
      });

      if (!response.ok) throw new Error("Verification failed");

      const result = await response.json();
      setTasks(prev => prev.map(t => 
        t.id === taskId 
          ? { ...t, verification: result, status: result.status === 'passed' ? 'completed' : t.status } 
          : t
      ));
    } catch (err) {
      console.error("Verification error:", err);
    }
  };
  const handleSetGoal = async () => {
    if (!projectId || !goal.trim()) return;
    setIsPlanning(true);
    
    try {
      const response = await fetch("/api/sites/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, goal }),
      });
      
      if (!response.ok) throw new Error("Failed to generate plan");
      
      const data = await response.json();
      setTasks(data.tasks);
    } catch (err) {
      console.error("Planning error:", err);
      // Fallback to mock for demo if API fails
      setTasks([
        { id: "1", title: "Project Initialization", status: "completed", description: "Set up basic project structure and dependencies" },
        { id: "2", title: "Core Layout Design", status: "in_progress", description: "Implementing the main responsive layout and navigation" },
        { id: "3", title: "Content Integration", status: "pending", description: "Adding the requested content and assets" },
        { id: "4", title: "Styling & Polish", status: "pending", description: "Applying theme colors and refining typography" },
        { id: "5", title: "Final Verification", status: "pending", description: "Automated testing and final check" },
      ]);
    } finally {
      setIsPlanning(false);
    }
  };

  return (
    <div style={containerStyle}>
      {/* Top Bar */}
      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={statusIndicator} />
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--j-text)" }}>
            Agent Manager <span style={{ fontSize: "12px", color: "var(--j-text-muted)", fontWeight: 400, marginLeft: "8px" }}>Mission Control</span>
          </h2>
        </div>
        <button onClick={onSwitchToEditor} style={switchBtnStyle}>
          Switch to Editor
        </button>
      </div>

      <div style={{ display: "flex", gap: "20px", padding: "24px", height: "calc(100% - 60px)" }}>
        {/* Left Column: Goal Setting */}
        <div style={{ width: "350px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={cardStyle}>
            <label style={labelStyle}>Current Objective</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Build a professional landing page for a coffee shop with a modern dark theme..."
              style={textareaStyle}
            />
            <button 
              onClick={handleSetGoal} 
              disabled={isPlanning || !goal.trim()} 
              style={actionBtnStyle}
            >
              {isPlanning ? "Planning..." : "Initialize Mission"}
            </button>
          </div>

          <div style={infoCardStyle}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--j-accent)", marginBottom: "8px" }}>
              AGENT STATUS: {assistantName.toUpperCase()}
            </div>
            <div style={{ fontSize: "11px", color: "var(--j-text-muted)", lineHeight: "1.6" }}>
              The agent is operating across the Editor, Terminal, and Browser. 
              Current mode: <span style={{ color: "var(--j-text)" }}>Autonomous Planning</span>
            </div>
          </div>
        </div>

        {/* Right Column: Task Board */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--j-text)" }}>Implementation Plan</h3>
            <div style={{ fontSize: "11px", color: "var(--j-text-muted)" }}>
              {tasks.filter(t => t.status === "completed").length} / {tasks.length} Tasks Completed
            </div>
          </div>

          <div style={taskBoardStyle}>
            {tasks.length === 0 ? (
              <div style={emptyTasksStyle}>
                {isPlanning ? (
                  <div style={spinnerStyle} />
                ) : (
                  "No active mission. Set a goal to begin planning."
                )}
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} style={taskItemStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                    <div style={{ ...statusDotStyle, background: getStatusColor(task.status) }} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--j-text)" }}>{task.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--j-text-muted)" }}>{task.description}</div>
                      {task.verification && (
                        <div style={{ 
                          marginTop: "8px", 
                          fontSize: "10px", 
                          padding: "4px 8px", 
                          borderRadius: "4px", 
                          background: task.verification.status === 'passed' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: task.verification.status === 'passed' ? 'var(--j-success)' : 'var(--j-error)',
                          border: `1px solid ${task.verification.status === 'passed' ? 'var(--j-success)' : 'var(--j-error)'}`
                        }}>
                          <strong>{task.verification.status === 'passed' ? '✅ Verified' : '❌ Failed'}:</strong> {task.verification.evidence}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {task.status !== 'completed' && (
                      <button 
                        onClick={() => handleVerifyTask(task.id)} 
                        style={verifyBtnStyle}
                      >
                        Verify
                      </button>
                    )}
                    <div style={{ fontSize: "10px", fontWeight: 600, color: getStatusColor(task.status), textTransform: "uppercase" }}>
                      {task.status.replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status: TaskStatus) {
  switch (status) {
    case "completed": return "var(--j-success)";
    case "in_progress": return "var(--j-accent)";
    case "pending": return "var(--j-text-muted)";
    case "failed": return "var(--j-error)";
    default: return "var(--j-text-muted)";
  }
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--j-bg)",
  color: "var(--j-text)",
};

const topBarStyle: React.CSSProperties = {
  height: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 24px",
  borderBottom: "1px solid var(--j-border)",
  background: "var(--j-surface)",
};

const switchBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: "12px",
  fontWeight: 600,
  background: "rgba(0, 212, 255, 0.1)",
  border: "1px solid var(--j-accent)",
  borderRadius: "6px",
  color: "var(--j-accent)",
  cursor: "pointer",
  transition: "all 0.2s",
};

const cardStyle: React.CSSProperties = {
  background: "var(--j-surface)",
  border: "1px solid var(--j-border)",
  borderRadius: "12px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const infoCardStyle: React.CSSProperties = {
  background: "rgba(0, 212, 255, 0.03)",
  border: "1px solid rgba(0, 212, 255, 0.1)",
  borderRadius: "12px",
  padding: "16px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--j-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  height: "120px",
  background: "var(--j-bg)",
  border: "1px solid var(--j-border)",
  borderRadius: "8px",
  color: "var(--j-text)",
  padding: "12px",
  fontSize: "13px",
  outline: "none",
  resize: "none",
  boxSizing: "border-box",
};

const actionBtnStyle: React.CSSProperties = {
  padding: "10px",
  background: "var(--j-accent)",
  border: "none",
  borderRadius: "8px",
  color: "#000",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
};

const taskBoardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const taskItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  background: "var(--j-surface)",
  border: "1px solid var(--j-border)",
  borderRadius: "8px",
  transition: "border-color 0.2s",
};

const statusDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const verifyBtnStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "10px",
  background: "rgba(0, 212, 255, 0.1)",
  border: "1px solid var(--j-accent)",
  borderRadius: "4px",
  color: "var(--j-accent)",
  cursor: "pointer",
};

const emptyTasksStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "300px",
  color: "var(--j-text-muted)",
  fontSize: "13px",
  textAlign: "center",
  gap: "12px",
};

const statusIndicator: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: "var(--j-success)",
  boxShadow: "0 0 8px var(--j-success)",
};

const spinnerStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  border: "2px solid var(--j-border)",
  borderTop: "2px solid var(--j-accent)",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};
