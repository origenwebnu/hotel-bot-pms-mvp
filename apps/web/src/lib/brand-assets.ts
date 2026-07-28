/**
 * Static brand files in `public/brand/`. Replace those files to update branding —
 * never inline or regenerate SVG in React components.
 */
export const BRAND = {
  logoFullLight: '/brand/logo-full-light.svg',
  logoFullDark: '/brand/logo-full-dark.png',
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
