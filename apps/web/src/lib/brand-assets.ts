/**
 * Archivos estáticos en `public/brand/`. Sustituye esos archivos; no editar SVG en código.
 * Sincronizar desde brand-upload/: bash scripts/sync-brand-assets.sh
 */
export const BRAND_CACHE_VERSION = '20250728b';

export const BRAND = {
  logoFullLight: '/brand/logo-full-light.svg',
  logoFullDark: '/brand/logo-full-dark.svg',
  logoIconLight: '/brand/logo-icon-light.svg',
  logoIconDark: '/brand/logo-icon-dark.svg',
  faviconLight: '/brand/favicon-light.svg',
  faviconDark: '/brand/favicon-dark.svg',
} as const;

export function brandLogoFull(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? BRAND.logoFullDark : BRAND.logoFullLight;
}

export function brandLogoIcon(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? BRAND.logoIconDark : BRAND.logoIconLight;
}

export function brandAssetUrl(path: string): string {
  return `${path}?v=${BRAND_CACHE_VERSION}`;
}
