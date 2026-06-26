export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bookichat-theme';
export const SIDEBAR_STORAGE_KEY = 'bookichat-sidebar-collapsed';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
}
