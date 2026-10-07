import { clamp } from './format'
import type { Level } from './format'

/** Fill colors where a surface draws SVG (no theme keys there); mid tones that read on light and dark. */
const KIND_HEX: Record<string, string> = {
  five_hour: '#7C9CF5',
  seven_day: '#A78BFA',
}
const LEVEL_HEX: Record<Exclude<Level, 'ok'>, string> = { high: '#EAB308', critical: '#EF4444' }
const FALLBACK_HEX = '#5EC4C4'

export const BAR_WIDTH = 1000
export const BAR_HEIGHT = 12

export const fillHex = (kind: string, lvl: Level) =>
  lvl === 'ok' ? (KIND_HEX[kind] ?? FALLBACK_HEX) : LEVEL_HEX[lvl]

/** A rounded track with the used share filled in, stretched to whatever width the slot gives it. */
export function barSvg(kind: string, percent: number, lvl: Level): string {
  const used = (clamp(percent) / 100) * BAR_WIDTH
  const hex = fillHex(kind, lvl)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH}" height="${BAR_HEIGHT}" viewBox="0 0 ${BAR_WIDTH} ${BAR_HEIGHT}" preserveAspectRatio="none">` +
    `<defs><clipPath id="t"><rect width="${BAR_WIDTH}" height="${BAR_HEIGHT}" rx="3"/></clipPath></defs>` +
    `<g clip-path="url(#t)">` +
    `<rect width="${BAR_WIDTH}" height="${BAR_HEIGHT}" fill="#8A93A6" fill-opacity="0.18"/>` +
    (used > 0 ? `<rect width="${used.toFixed(1)}" height="${BAR_HEIGHT}" fill="${hex}"/>` : '') +
    `</g></svg>`
  )
}
