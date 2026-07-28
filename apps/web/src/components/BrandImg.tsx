import { brandAssetUrl } from '@/lib/brand-assets';

interface BrandImgProps {
  src: string;
  alt?: string;
  className?: string;
}

/** Solo referencia el archivo en public/brand — no altera el SVG. */
export function BrandImg({ src, alt = 'BookiChat', className }: BrandImgProps) {
  return <img src={brandAssetUrl(src)} alt={alt} className={className} />;
}
