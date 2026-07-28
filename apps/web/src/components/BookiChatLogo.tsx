const BRAND_PURPLE = '#7B61FF';
const ON_DARK_BG = '#FFFFFF';
const ON_LIGHT_BG = '#141428';

export type BookiChatLogoVariant = 'wordmark' | 'mark';
export type BookiChatLogoBackground = 'dark' | 'light';

interface BookiChatLogoProps {
  variant?: BookiChatLogoVariant;
  /** Background the logo sits on — picks the correct contrast variant */
  forBackground?: BookiChatLogoBackground;
  height?: number;
  className?: string;
  title?: string;
}

function logoColor(forBackground: BookiChatLogoBackground): string {
  return forBackground === 'dark' ? ON_DARK_BG : ON_LIGHT_BG;
}

function LogoMark({
  color,
  height,
  className,
  title,
}: {
  color: string;
  height: number;
  className?: string;
  title?: string;
}) {
  const width = height * 1.05;

  return (
    <svg
      viewBox="0 0 100 100"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={title ?? 'BookiChat'}
    >
      {title ? <title>{title}</title> : null}
      <rect x="8" y="12" width="18" height="76" rx="3" fill={color} />
      <line
        x1="26"
        y1="50"
        x2="82"
        y2="12"
        stroke={color}
        strokeWidth="18"
        strokeLinecap="round"
      />
      <line
        x1="26"
        y1="50"
        x2="82"
        y2="88"
        stroke={color}
        strokeWidth="18"
        strokeLinecap="round"
      />
      <circle cx="86" cy="10" r="9" fill={BRAND_PURPLE} />
    </svg>
  );
}

function LogoWordmark({
  color,
  height,
  className,
  title,
}: {
  color: string;
  height: number;
  className?: string;
  title?: string;
}) {
  const width = height * 4.85;

  return (
    <svg
      viewBox="0 0 290 50"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={title ?? 'BookiChat'}
    >
      {title ? <title>{title}</title> : null}
      <text
        x="0"
        y="38"
        fontFamily="DM Sans, system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="36"
        fill={color}
      >
        Book
      </text>
      <text
        x="108"
        y="38"
        fontFamily="DM Sans, system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="36"
        fill={color}
      >
        ı
      </text>
      <circle cx="118" cy="11" r="5.5" fill={BRAND_PURPLE} />
      <text
        x="124"
        y="38"
        fontFamily="DM Sans, system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="36"
        fill={color}
      >
        Chat
      </text>
    </svg>
  );
}

export function BookiChatLogo({
  variant = 'wordmark',
  forBackground = 'dark',
  height = 28,
  className,
  title = 'BookiChat',
}: BookiChatLogoProps) {
  const color = logoColor(forBackground);

  if (variant === 'mark') {
    return <LogoMark color={color} height={height} className={className} title={title} />;
  }

  return <LogoWordmark color={color} height={height} className={className} title={title} />;
}
