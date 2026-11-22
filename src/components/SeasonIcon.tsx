import { Flower2, Leaf, Snowflake, Sun } from 'lucide-react';
import type { Season } from '../lib/types';

export const SEASON_ICON = { winter: Snowflake, spring: Flower2, summer: Sun, autumn: Leaf } as const;

export function SeasonIcon({ season, size = 20, className = '' }: { season: Season; size?: number; className?: string }) {
  const I = SEASON_ICON[season];
  return <I size={size} className={className} aria-hidden="true" />;
}
