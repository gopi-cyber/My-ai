import React, { useState } from "react";
import "../styles/aether-dock.css";

type Route = "dashboard" | "chat" | "tasks" | "pipeline" | "memory" | "calendar" | "office" | "knowledge" | "command" | "authority" | "awareness" | "workflows" | "goals" | "sites" | "settings";

interface NavEntry {
  icon: string;
  label: string;
  route: Route;
}

const PRIMARY_NAV: NavEntry[] = [
  { icon: "\u25C7", label: "Home",     route: "dashboard" },
  { icon: "\u25CE", label: "Chat",     route: "chat" },
  { icon: "\u25C6", label: "Goals",    route: "goals" },
  { icon: "\u2B21", label: "Work",     route: "workflows" },
  { icon: "\u25A0", label: "Build",    route: "sites" },
];

const SECONDARY_NAV: NavEntry[] = [
  { icon: "\u25B3", label: "Agents",    route: "office" },
  { icon: "\u2726", label: "Tasks",     route: "tasks" },
  { icon: "\u25A3", label: "Authority", route: "authority" },
  { icon: "\u25C8", label: "Memory",    route: "memory" },
  { icon: "\u25B6", label: "Pipeline",  route: "pipeline" },
  { icon: "\u25A1", label: "Calendar",  route: "calendar" },
  { icon: "\u2699", label: "Settings",  route: "settings" },
];

interface AetherDockProps {
  activeRoute: Route;
  onNavigate: (route: Route) => void;
  isConnected: boolean;
}

const AetherDock: React.FC<AetherDockProps> = ({ activeRoute, onNavigate, isConnected }) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="aether-dock-container">
      <nav className="aether-dock">
        {PRIMARY_NAV.map((item) => (
          <button
            key={item.route}
            className={`dock-item ${activeRoute === item.route ? "active" : ""}`}
            onClick={() => {
              onNavigate(item.route);
              setShowMenu(false);
            }}
            title={item.label}
          >
            <div className="dock-icon-wrap">
              <span className="dock-icon">{item.icon}</span>
            </div>
            <span className="dock-label">{item.label}</span>
          </button>
        ))}

        <div className="dock-divider" />

        {/* More Menu Trigger */}
        <button
          className={`dock-item dock-trigger ${showMenu ? "active" : ""}`}
          onClick={() => setShowMenu(!showMenu)}
          title="Applications"
        >
          <div className="dock-icon-wrap">
            <span className="dock-icon">\u22EE</span>
          </div>
          <span className="dock-label">Apps</span>
        </button>

        {/* Health Indicator integrated into Dock */}
        <div className="dock-health-wrap">
          <div className={`dock-health-dot ${isConnected ? "online" : "offline"}`} />
        </div>
      </nav>

      {/* Floating App Switcher Menu */}
      {showMenu && (
        <div className="aether-app-switcher animate-dock-slide">
          <div className="app-switcher-grid">
            {SECONDARY_NAV.map((item) => (
              <button
                key={item.route}
                className={`app-switcher-item ${activeRoute === item.route ? "active" : ""}`}
                onClick={() => {
                  onNavigate(item.route);
                  setShowMenu(false);
                }}
              >
                <span className="app-icon">{item.icon}</span>
                <span className="app-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AetherDock;
