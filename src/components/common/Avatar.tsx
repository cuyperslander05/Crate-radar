import { useState } from 'react';

interface AvatarProps {
  /** null is accepted: the API returns null for a missing avatar or name. */
  src?: string | null;
  name?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<string, string> = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-[88px] h-[88px]',
};

const textClasses: Record<string, string> = {
  sm: 'text-[10px]',
  md: 'text-sm',
  lg: 'text-2xl',
};

function initialsOf(name?: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Renders a user avatar with a graceful fallback. If no `src` is provided or
 * the image fails, it shows a circular badge with the user's initials on a
 * Terracotta background with Krijt text.
 */
export function Avatar({ src, name, className = '', size = 'md' }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  // An explicit w-/h- in `className` wins over the preset, so callers can size
  // avatars precisely for dense desktop layouts.
  const hasCustomSize = /(^|\s)[wh]-/.test(className);
  const sizeCls = `${hasCustomSize ? '' : (sizeClasses[size] || sizeClasses.md)} ${textClasses[size] || textClasses.md}`;

  if (!src || hasError) {
    return (
      <div
        role="img"
        aria-label={name || 'avatar'}
        className={`flex items-center justify-center rounded-full bg-terracotta/90 text-krijt font-bold ${sizeCls} ${className}`}
      >
        {initialsOf(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || 'avatar'}
      onError={() => setHasError(true)}
      className={`rounded-full object-cover ${sizeCls} ${className}`}
    />
  );
}