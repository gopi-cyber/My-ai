import React, { useState, useEffect, useMemo } from "react";

type Command = {
  id: string;
  label: string;
  description: string;
  action: () => void;
  category: string;
  icon: string;
};

type Props = {
  onClose: () => void;
};

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = useMemo(() => [
    { 
      id: 'new-project', 
      label: 'New Project', 
      description: 'Create a new site builder project', 
      action: () => { console.log('New project'); onClose(); }, 
      category: 'Projects', 
      icon: '🚀' 
    },
    { 
      id: 'agent-manager', 
      label: 'Open Agent Manager', 
      description: 'Switch to mission control view', 
      action: () => { console.log('Agent manager'); onClose(); }, 
      category: 'Agents', 
      icon: '🤖' 
    },
    { 
      id: 'system-check', 
      label: 'Run System Check', 
      description: 'Verify all system components', 
      action: () => { console.log('System check'); onClose(); }, 
      category: 'System', 
      icon: '✅' 
    },
    { 
      id: 'clear-chat', 
      label: 'Clear Chat', 
      description: 'Wipe current conversation history', 
      action: () => { console.log('Clear chat'); onClose(); }, 
      category: 'Chat', 
      icon: '🗑️' 
    },
  ], []);

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase()) || 
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onClose]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={inputWrapperStyle}>
          <div style={iconStyle}>🔍</div>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands or actions..."
            style={inputStyle}
          />
          <div style={shortcutStyle}>ESC to close</div>
        </div>

        <div style={listStyle}>
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => (
              <div 
                key={cmd.id} 
                onClick={() => cmd.action()}
                style={{ 
                  ...itemStyle, 
                  background: idx === selectedIndex ? 'var(--j-surface-hover)' : 'transparent',
                  borderLeft: idx === selectedIndex ? '2px solid var(--j-accent)' : '2px solid transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '16px' }}>{cmd.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--j-text)' }}>{cmd.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--j-text-muted)' }}>{cmd.description}</span>
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--j-text-muted)', opacity: 0.6 }}>
                  {cmd.category}
                </div>
              </div>
            ))
          ) : (
            <div style={emptyStyle}>No commands found for "{query}"</div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '10vh',
};

const modalStyle: React.CSSProperties = {
  width: '600px',
  background: 'var(--j-surface)',
  border: '1px solid var(--j-border-bright)',
  borderRadius: '12px',
  boxShadow: '0 20px 50px rgba(0,0,0,0.5), var(--j-glow)',
  overflow: 'hidden',
  animation: 'modalSlideIn 0.2s ease-out',
};

const inputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '16px',
  borderBottom: '1px solid var(--j-border)',
  background: 'rgba(255,255,255,0.02)',
};

const iconStyle: React.CSSProperties = {
  fontSize: '18px',
  marginRight: '12px',
  opacity: 0.6,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--j-text)',
  fontSize: '16px',
  fontWeight: 400,
};

const shortcutStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--j-text-muted)',
  background: 'rgba(255,255,255,0.05)',
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid var(--j-border)',
  textTransform: 'uppercase',
};

const listStyle: React.CSSProperties = {
  maxHeight: '400px',
  overflowY: 'auto',
  padding: '8px',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'all 0.1s',
  marginBottom: '2px',
};

const emptyStyle: React.CSSProperties = {
  padding: '40px',
  textAlign: 'center',
  color: 'var(--j-text-muted)',
  fontSize: '14px',
};
