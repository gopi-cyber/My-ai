import React from "react";
import { format } from "date-fns";
import { useIdentity } from "../../contexts/IdentityContext";

export interface EvolutionEvent {
  id: string;
  timestamp: string;
  type: 'optimization' | 'crash_fix' | 'learning' | 'failover';
  target?: string;
  summary: string;
  details?: string;
  status: 'pending' | 'success' | 'failed' | 'rolled_back';
  stability_impact: number;
}

interface EvolutionListProps {
  logs: EvolutionEvent[];
  loading: boolean;
}

export function EvolutionList({ logs, loading }: EvolutionListProps) {
  const { name } = useIdentity();
  if (loading) {
    return <div className="ev-loading">Scanning system history...</div>;
  }

  if (logs.length === 0) {
    return (
      <div className="ev-empty">
        <div className="ev-empty-icon">🌱</div>
        <p>No autonomous updates recorded yet. {name} is monitoring for optimizations.</p>
      </div>
    );
  }

  return (
    <div className="ev-list">
      {logs.map((log) => (
        <div key={log.id} className={`ev-card status-${log.status}`}>
          <div className="ev-card-header">
            <span className={`ev-badge type-${log.type}`}>
              {log.type.replace('_', ' ')}
            </span>
            <span className="ev-time">
              {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
            </span>
            <div className="ev-status-indicator">
              <span className={`status-dot ${log.status}`} />
              {log.status}
            </div>
          </div>
          
          <div className="ev-card-body">
            <h3 className="ev-summary">{log.summary}</h3>
            {log.target && (
              <div className="ev-target">
                <strong>Target:</strong> <code>{log.target}</code>
              </div>
            )}
            {log.details && (
              <pre className="ev-details">{log.details}</pre>
            )}
          </div>

          {log.stability_impact !== 0 && (
            <div className="ev-impact">
              Stability Impact: 
              <span className={log.stability_impact > 0 ? "positive" : "negative"}>
                {log.stability_impact > 0 ? "+" : ""}{log.stability_impact}%
              </span>
            </div>
          )}
        </div>
      ))}

      <style>{`
        .ev-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 10px 0;
        }
        .ev-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .ev-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .ev-card.status-success {
          border-left: 4px solid #10B981;
        }
        .ev-card.status-failed {
          border-left: 4px solid #EF4444;
        }
        .ev-card.status-pending {
          border-left: 4px solid #F59E0B;
        }
        
        .ev-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 12px;
        }
        .ev-badge {
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .type-optimization { background: rgba(59, 130, 246, 0.2); color: #60A5FA; }
        .type-crash_fix { background: rgba(239, 68, 68, 0.2); color: #F87171; }
        .type-learning { background: rgba(167, 139, 250, 0.2); color: #C084FC; }
        .type-failover { background: rgba(245, 158, 11, 0.2); color: #FBBF24; }

        .ev-time { color: rgba(255,255,255,0.4); }
        .ev-status-indicator {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(255,255,255,0.6);
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot.success { background: #10B981; box-shadow: 0 0 8px #10B981; }
        .status-dot.failed { background: #EF4444; box-shadow: 0 0 8px #EF4444; }
        .status-dot.pending { background: #F59E0B; box-shadow: 0 0 8px #F59E0B; animation: pulse 1.5s infinite; }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }

        .ev-summary {
          margin: 0 0 8px 0;
          font-size: 16px;
          color: rgba(255,255,255,0.95);
        }
        .ev-target {
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          margin-bottom: 8px;
        }
        .ev-target code {
          background: rgba(0,0,0,0.3);
          padding: 2px 4px;
          border-radius: 4px;
          color: #22D3EE;
        }
        .ev-details {
          background: rgba(0,0,0,0.2);
          padding: 10px;
          border-radius: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          max-height: 120px;
          overflow-y: auto;
          white-space: pre-wrap;
          font-family: inherit;
        }
        .ev-impact {
          margin-top: 12px;
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          display: flex;
          gap: 8px;
        }
        .ev-impact .positive { color: #34D399; font-weight: 600; }
        .ev-impact .negative { color: #F87171; font-weight: 600; }

        .ev-empty {
          text-align: center;
          padding: 60px 20px;
          color: rgba(255,255,255,0.4);
        }
        .ev-empty-icon {
          font-size: 40px;
          margin-bottom: 16px;
          filter: grayscale(1) opacity(0.5);
        }
      `}</style>
    </div>
  );
}
