import React, { useState, useEffect } from "react";
import { useIdentity } from "../contexts/IdentityContext";
import { api } from "../hooks/useApi";
import "./SystemHealthOverlay.css";

type ServiceStatus = {
  id: string;
  name: string;
  status: "ok" | "warning" | "error" | "loading";
  message?: string;
  latency?: number;
  config?: Record<string, any>;
};

type HealthMetrics = {
  cpu: number;
  memory: string;
  uptime: string;
  version: string;
};

export function SystemHealthOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { name, wakeWord } = useIdentity();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const data = await api<any>("/api/health");
      
      // Map backend services to UI format
      const serviceList: ServiceStatus[] = [
        { 
          id: "llm", 
          name: "LLM Provider", 
          status: data.llm?.connected ? "ok" : "error", 
          message: data.llm?.error,
          config: data.llm?.config
        },
        { 
          id: "stt", 
          name: "Speech-to-Text", 
          status: data.stt?.active ? "ok" : "warning",
          message: data.stt?.error,
          config: data.stt?.config
        },
        { 
          id: "tts", 
          name: "Text-to-Speech", 
          status: data.tts?.active ? "ok" : "warning",
          message: data.tts?.error,
          config: data.tts?.config
        },
        { 
          id: "db", 
          name: "Knowledge Base", 
          status: data.database?.connected ? "ok" : "error",
          message: data.database?.error 
        },
        { 
          id: "search", 
          name: "Web Search", 
          status: data.search?.connected ? "ok" : "warning",
          message: data.search?.error 
        }
      ];

      setServices(serviceList);
      setMetrics({
        cpu: data.system?.cpu || 0,
        memory: data.system?.memoryUsed || "0MB",
        uptime: formatUptime(data.uptime),
        version: data.version || "1.0.0"
      });
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch health", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
      const interval = setInterval(fetchHealth, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="health-overlay-backdrop" onClick={onClose}>
      <div className="health-overlay-window" onClick={e => e.stopPropagation()}>
        <div className="health-header">
          <div className="health-title">
            <span className="health-pulse"></span>
            System Diagnostics
          </div>
          <button className="health-close" onClick={onClose}>&times;</button>
        </div>

        <div className="health-grid">
          <div className="health-main">
            <h3>Service Status</h3>
            <div className="service-list">
              {services.map(s => (
                <div key={s.id} className={`service-item ${s.status}`}>
                  <div className="service-info">
                    <div className="service-name">{s.name}</div>
                    <div className="service-msg">{s.message || (s.status === "ok" ? "Operational" : "Check Configuration")}</div>
                  </div>
                  <div className="service-actions">
                    <div className={`status-pill ${s.status}`}>{s.status.toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="health-sidebar">
            <div className="metric-box">
              <div className="metric-label">Uptime</div>
              <div className="metric-value">{metrics?.uptime || "--"}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Memory</div>
              <div className="metric-value">{metrics?.memory || "--"}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Version</div>
              <div className="metric-value">{metrics?.version || "--"}</div>
            </div>
            
            <div className="security-mask-zone">
              <h4>Secure Credentials</h4>
              <p>API keys are masked and stored on host machine.</p>
              <div className="key-mask">••••••••••••••••</div>
              <button className="test-all-btn" onClick={fetchHealth}>Run Full Diagnostic</button>
            </div>
          </div>
        </div>

        <div className="health-footer">
          <div className="stt-check">
            <strong>STT Test:</strong> Speak "{wakeWord || `Hey ${name}`}" to verify audio input pipeline.
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
