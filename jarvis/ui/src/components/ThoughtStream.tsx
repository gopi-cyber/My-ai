import React, { useState, useEffect } from "react";
import { useWebSocket } from "../hooks/useWebSocket";

type ThoughtEvent = {
  timestamp: number;
  thought: string;
  type: 'reasoning' | 'tool' | 'reflection' | 'status';
};

type Props = {
  messages: any[];
  isConnected: boolean;
};

export function ThoughtStream({ messages, isConnected }: Props) {
  const [thoughts, setThoughts] = useState<ThoughtEvent[]>([]);

  useEffect(() => {
    // In a real implementation, this would subscribe to a specific 'thought' event 
    // from the WebSocket. For now, we extract "thoughts" from the messages.
    const newThoughts: ThoughtEvent[] = [];
    messages.forEach(msg => {
      if (msg.role === 'assistant' && msg.content?.includes('Thinking:')) {
        const thought = msg.content.split('Thinking:')[1].split('\n')[0];
        newThoughts.push({
          timestamp: Date.now(),
          thought: thought.trim(),
          type: 'reasoning',
        });
      }
    });
    setThoughts(prev => [...prev, ...newThoughts].slice(-50));
  }, [messages]);

  if (thoughts.length === 0) return null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--j-accent)', letterSpacing: '1px' }}>
          COGNITIVE STREAM
        </span>
        <div style={liveDot} />
      </div>
      <div style={listStyle}>
        {thoughts.map((t, i) => (
          <div key={i} style={thoughtItemStyle}>
            <span style={timeStyle}>{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span style={thoughtStyle}>{t.thought}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  width: '300px',
  maxHeight: '400px',
  background: 'var(--j-glass-bg)',
  backdropFilter: 'blur(12px)',
  border: '1px solid var(--j-glass-border)',
  borderRadius: '12px',
  boxShadow: 'var(--j-glow)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 100,
  pointerEvents: 'none',
  transition: 'all 0.3s ease',
};

const headerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--j-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const liveDot: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: 'var(--j-success)',
  boxShadow: '0 0 8px var(--j-success)',
  animation: 'pulse 2s infinite',
};

const listStyle: React.CSSProperties = {
  padding: '12px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const thoughtItemStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--j-text-dim)',
  display: 'flex',
  gap: '8px',
  lineHeight: '1.4',
};

const timeStyle: React.CSSProperties = {
  color: 'var(--j-text-muted)',
  fontWeight: 600,
  minWidth: '65px',
};

const thoughtStyle: React.CSSProperties = {
  color: 'var(--j-text)',
};
