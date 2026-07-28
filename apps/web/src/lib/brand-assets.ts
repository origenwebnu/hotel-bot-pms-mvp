/** Static brand assets in `public/brand/` — do not inline SVG in components. */
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
