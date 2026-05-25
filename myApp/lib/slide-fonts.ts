export const SUPPORTED_SLIDE_FONTS = [
  'Inter',
  'Roboto',
  'Playfair Display',
  'Montserrat',
  'Lora',
  'Poppins',
  'Dancing Script',
] as const

export type SupportedSlideFont = (typeof SUPPORTED_SLIDE_FONTS)[number]

const FONT_VAR_MAP: Record<SupportedSlideFont, string> = {
  Inter: 'var(--font-slide-inter), Inter, Arial, sans-serif',
  Roboto: 'var(--font-slide-roboto), Roboto, Arial, sans-serif',
  'Playfair Display': 'var(--font-slide-playfair), "Playfair Display", Georgia, serif',
  Montserrat: 'var(--font-slide-montserrat), Montserrat, Arial, sans-serif',
  Lora: 'var(--font-slide-lora), Lora, Georgia, serif',
  Poppins: 'var(--font-slide-poppins), Poppins, Arial, sans-serif',
  'Dancing Script': 'var(--font-slide-dancing), "Dancing Script", cursive',
}

export function isSupportedSlideFont(value: string): value is SupportedSlideFont {
  return SUPPORTED_SLIDE_FONTS.includes(value as SupportedSlideFont)
}

export function resolveSlideFontFamily(fontName?: string | null) {
  const safe = String(fontName || 'Inter').trim()
  return isSupportedSlideFont(safe) ? FONT_VAR_MAP[safe] : FONT_VAR_MAP.Inter
}

export function normalizeSlideFont(fontName?: string | null): SupportedSlideFont {
  const safe = String(fontName || 'Inter').trim()
  return isSupportedSlideFont(safe) ? safe : 'Inter'
}
