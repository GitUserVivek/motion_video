import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', label: '🏠 Dashboard', end: true },
  { to: '/create', label: '✏️ Create' },
  { to: '/history', label: '📂 History' },
  { to: '/settings', label: '⚙️ Settings' },
];

export function Layout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="app-root">
      <nav className="app-nav" aria-label="Main navigation">
        <Link to="/" className="app-brand">🎬 EduMotion</Link>
        <div className="app-nav-links">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}
