import type { Level } from './freshness'

/** The level colors where a surface draws SVG (no theme keys there); mid tones that read on light and dark. */
const LEVEL_HEX: Record<Level, string> = {
  green: '#22A06B',
  blue: '#3B82F6',
  yellow: '#EAB308',
  orange: '#F97316',
  red: '#EF4444',
}

/** The level's dot, 12×12, with a soft halo. */
export function dotSvg(level: Level): string {
  const hex = LEVEL_HEX[level]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.5" fill="${hex}" fill-opacity="0.25"/><circle cx="6" cy="6" r="3.5" fill="${hex}"/></svg>`
}
