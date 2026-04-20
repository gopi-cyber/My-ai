import React from "react";
import "../styles/mobile-navbar.css";

type Route = "dashboard" | "chat" | "goals" | "workflows" | "sites";

interface NavEntry {
  icon: string;
  label: string;
  route: Route;
}

const PRIMARY_NAV: NavEntry[] = [
  { icon: "\u25C7", label: "Home",  route: "dashboard" },
  { icon: "\u25CE", label: "Chat",  route: "chat" },
  { icon: "\u25C6", label: "Goals", route: "goals" },
  { icon: "\u2B21", label: "Work",  route: "workflows" },
  { icon: "\u25A0", label: "Build", route: "sites" },
];

interface MobileNavbarProps {
  activeRoute: string;
  onNavigate: (route: string) => void;
}

const MobileNavbar: React.FC<MobileNavbarProps> = ({ activeRoute, onNavigate }) => {
  return (
    <nav className="mobile-navbar">
      {PRIMARY_NAV.map((item) => (
        <button
          key={item.route}
          className={`mobile-nav-item ${activeRoute === item.route ? "active" : ""}`}
          onClick={() => onNavigate(item.route)}
        >
          <span className="mobile-nav-icon">{item.icon}</span>
          <span className="mobile-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default MobileNavbar;
