import { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface AlbumArtProps {
  /** null is accepted: the API returns null for missing artwork. */
  src?: string | null;
  alt: string;
  className?: string;
  iconSize?: number;
}

/**
 * Renders album artwork with a graceful fallback. If no `src` is provided or
 * the image fails to load, it shows a Disc3 icon on an Espresso/Mos background
 * so the UI never displays a broken-image glyph.
 */
export function AlbumArt({ src, alt, className = '', iconSize = 48 }: AlbumArtProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-espresso/80 border border-verweerd-mos/30 text-verweerd-mos ${className}`}
      >
        <Disc3 className="opacity-60" size={iconSize} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      className={`object-cover ${className}`}
    />
  );
}