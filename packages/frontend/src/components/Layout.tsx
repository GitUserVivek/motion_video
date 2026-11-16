import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', label: '🏠 Dashboard' },
  { to: '/create', label: '✏️ Create' },
  { to: '/history', label: '📂 History' },
  { to: '/settings', label: '⚙️ Settings' },
];

export function Layout({ children }: { children: React.ReactNode }): React.ReactElement {
  const { pathname } = useLocation();

  return (
    <div style={styles.root}>
      <nav style={styles.nav}>
        <div style={styles.logo}>🎬 EduMotion</div>
        <div style={styles.links}>
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              style={{
                ...styles.link,
                ...(pathname === l.to ? styles.activeLink : {}),
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#0f0f1a',
    color: '#e0e0e0',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 32,
    padding: '0 32px',
    height: 60,
    backgroundColor: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
    flexShrink: 0,
  },
  logo: {
    fontSize: 20,
    fontWeight: 800,
    color: '#4A90D9',
    marginRight: 16,
  },
  links: { display: 'flex', gap: 8 },
  link: {
    color: '#a0a0c0',
    textDecoration: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.15s',
  },
  activeLink: {
    backgroundColor: '#4A90D920',
    color: '#4A90D9',
  },
  main: {
    flex: 1,
    padding: 32,
    maxWidth: 960,
    width: '100%',
    margin: '0 auto',
  },
};
