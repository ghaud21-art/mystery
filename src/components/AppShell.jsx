import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { MoonIcon, SunIcon } from "./icons.jsx";
import { NAV_ITEMS } from "./nav.js";
import { displayAvatar, displayName } from "../lib/profileDisplay.js";
import "../styles/shell.css";

export default function AppShell() {
  const { profile } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark">M</div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>머더미스터리</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">
            {displayAvatar(profile) || (profile?.photoURL ? <img src={profile.photoURL} alt="" /> : "🔍")}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{displayName(profile)}</span>
          <button
            className="sidebar-theme-toggle"
            onClick={toggleTheme}
            aria-label="테마 전환"
            title="라이트/다크 전환"
          >
            {theme === "dark" ? <SunIcon width={15} height={15} /> : <MoonIcon width={15} height={15} />}
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="tabbar">
        <div className="tabbar-inner">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}
            >
              <Icon width={20} height={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
