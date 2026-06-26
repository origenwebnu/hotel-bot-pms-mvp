'use client';

import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { SIDEBAR_STORAGE_KEY } from '@/lib/theme';

export interface AppNavItem {
  id: string;
  label: string;
  icon: string;
}

interface AppShellProps {
  title: string;
  subtitle?: string;
  navItems: AppNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  title,
  subtitle,
  navItems,
  activeId,
  onNavigate,
  onLogout,
  headerExtra,
  children,
}: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  const logoFull =
    theme === 'dark' ? '/brand/logo-full-dark.png' : '/brand/logo-full-light.svg';
  const logoIcon =
    theme === 'dark' ? '/brand/logo-icon-dark.svg' : '/brand/logo-icon-light.svg';

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`app-sidebar glass-panel ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className={`sidebar-top ${collapsed ? 'is-collapsed' : ''}`}>
          <div className="sidebar-brand">
            {collapsed ? (
              <Image
                src={logoIcon}
                alt="BookiChat"
                width={40}
                height={40}
                className="brand-icon"
                priority
              />
            ) : (
              <Image
                src={logoFull}
                alt="BookiChat"
                width={160}
                height={32}
                className="brand-full"
                priority
              />
            )}
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {subtitle && !collapsed && <p className="sidebar-subtitle">{subtitle}</p>}

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => {
                onNavigate(item.id);
                setMobileOpen(false);
              }}
              data-tooltip={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
            >
              <Image
                src={item.icon}
                alt=""
                width={22}
                height={22}
                className="nav-icon"
                aria-hidden
              />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item theme-toggle"
            onClick={toggleTheme}
            data-tooltip={
              collapsed ? (theme === 'light' ? 'Modo oscuro' : 'Modo claro') : undefined
            }
            aria-label={collapsed ? (theme === 'light' ? 'Modo oscuro' : 'Modo claro') : undefined}
          >
            <span className="theme-icon" aria-hidden>
              {theme === 'light' ? '🌙' : '☀️'}
            </span>
            {!collapsed && (
              <span>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</span>
            )}
          </button>
          <button
            type="button"
            className="nav-item logout"
            onClick={onLogout}
            data-tooltip={collapsed ? 'Cerrar sesión' : undefined}
            aria-label={collapsed ? 'Cerrar sesión' : undefined}
          >
            <span className="theme-icon" aria-hidden>
              ⎋
            </span>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header glass-panel">
          <div className="header-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <div>
              <h1>{title}</h1>
              {subtitle && <p className="header-subtitle">{subtitle}</p>}
            </div>
          </div>
          {headerExtra && <div className="header-extra">{headerExtra}</div>}
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
