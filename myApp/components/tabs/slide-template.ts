import type { Slide, SlideShow } from '@/lib/types'

export const SLIDE_W_IN = 13.333
export const SLIDE_H_IN = 7.5

export type TemplateShapeType = 'rect' | 'roundRect' | 'ellipse'

export type TemplateElement =
  | {
      kind: 'shape'
      shape: TemplateShapeType
      x: number
      y: number
      w: number
      h: number
      fill: string
      fillOpacity?: number
      stroke?: string
      strokeOpacity?: number
      radius?: number
      role?: 'glow' | 'panel-shadow' | 'panel-main' | 'panel-accent' | 'image-frame' | 'divider'
    }
  | {
      kind: 'text'
      x: number
      y: number
      w: number
      h: number
      text: string
      fontFace: string
      fontSize: number
      color: string
      bold?: boolean
      italic?: boolean
      align?: 'left' | 'center' | 'right'
      valign?: 'top' | 'middle' | 'bottom'
      letterSpacing?: number
      lineHeight?: number
    }
  | {
      kind: 'image'
      x: number
      y: number
      w: number
      h: number
      src: string
      radius?: number
      fit?: 'cover' | 'contain'
    }

export type SlideTemplate = {
  background: string
  elements: TemplateElement[]
}

type SectionTitleAlign = 'left' | 'center'
type DecorativeMode = 'academic' | 'business' | 'creative' | 'children'
type ThemeGlow = {
  x: number
  y: number
  w: number
  h: number
  color: string
  opacity: number
}
type SlideTheme = {
  bg: string
  ink: string
  muted: string
  muted2: string
  panelFill: string
  panelStroke: string
  panelShadow: string
  panelFillOpacity: number
  panelStrokeOpacity: number
  panelShadowOpacity: number
  sectionGap: number
  denseHeaderThreshold: number
  panelRadius: number
  sectionTitleAlign: SectionTitleAlign
  accentLineW: number
  accentLineH: number
  decorativeMode: DecorativeMode
  glows: ThemeGlow[]
}

function normalizeHex(input: string, fallback: string) {
  const raw = (input || '').trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return hex
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase()
  return normalizeHex(fallback, '000000')
}

function extractBulletsFromContent(raw: string) {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const bullets = lines
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)
  return bullets
}

function extractIdeaBullets(raw: string, maxItems = 3) {
  const explicit = extractBulletsFromContent(raw)
  if (explicit.length) return explicit.slice(0, maxItems)

  const parts = String(raw || '')
    .split(/\n+|(?<=[\.\!\?;:])\s+/)
    .map((x) => x.trim().replace(/^[-*•]\s+/, ''))
    .filter(Boolean)

  const bullets: string[] = []
  for (const part of parts) {
    if (part.length < 12) continue
    bullets.push(part)
    if (bullets.length >= maxItems) break
  }
  return bullets
}

function estimateTextLines(text: string, widthIn: number, fontSizePt: number, maxLines: number) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  const charsPerLine = Math.max(9, Math.floor((widthIn * 72) / Math.max(1, fontSizePt * 0.7)))
  const parts = normalized.split('\n').map((part) => part.trim())
  let lines = 0
  for (const part of parts) {
    if (!part) {
      lines += 1
      continue
    }
    lines += Math.max(1, Math.ceil(part.length / charsPerLine))
  }
  return Math.min(maxLines, Math.max(1, lines))
}

function estimateTextHeight(text: string, widthIn: number, fontSizePt: number, lineHeight: number, minH: number, maxH: number) {
  const lines = estimateTextLines(text, widthIn, fontSizePt, 4)
  if (!lines) return 0
  const rawHeight = lines * ((fontSizePt / 72) * lineHeight) + 0.12
  return Math.max(minH, Math.min(maxH, rawHeight))
}

function fitBodyFont(text: string, widthIn: number, baseFont: number, maxLines: number, minFont = 9.6) {
  let nextFont = baseFont
  while (nextFont > minFont && estimateTextLines(text, widthIn, nextFont, maxLines + 2) > maxLines) {
    nextFont -= 0.4
  }
  return Number(nextFont.toFixed(1))
}

function resolveTitleMetricsByCategory(text: string, widthIn: number, category: string, center = false) {
  const cat = String(category || 'academic').toLowerCase()
  let baseFont = center ? 34 : 21
  let midFont = center ? 30 : 19
  let minFont = center ? 26 : 17
  let lineHeight = center ? 1.02 : 1.08
  let minH = center ? 1.9 : 1.28
  let maxH = center ? 3.0 : 2.45

  if (cat === 'business') {
    baseFont = center ? 32 : 20
    midFont = center ? 28 : 18
    minFont = center ? 24 : 16
    lineHeight = center ? 1.02 : 1.06
    minH = center ? 1.82 : 1.2
    maxH = center ? 2.8 : 2.28
  } else if (cat === 'creative') {
    baseFont = center ? 36 : 22
    midFont = center ? 32 : 20
    minFont = center ? 28 : 18
    lineHeight = center ? 1.04 : 1.1
    minH = center ? 2.0 : 1.32
    maxH = center ? 3.15 : 2.55
  } else if (cat === 'children') {
    baseFont = center ? 32 : 20
    midFont = center ? 29 : 18
    minFont = center ? 26 : 16
    lineHeight = center ? 1.08 : 1.12
    minH = center ? 2.0 : 1.34
    maxH = center ? 3.0 : 2.55
  }

  const baseLines = estimateTextLines(text, widthIn, baseFont, 4)
  let fontSize = baseFont
  if (baseLines > 1) fontSize = midFont
  if (baseLines > 2) fontSize = minFont

  const height = estimateTextHeight(text, widthIn, fontSize, lineHeight, minH, maxH)
  return { fontSize, lineHeight, height }
}

export function buildSlideTemplate(params: {
  slide: Slide
  slideIndex: number
  slideCount: number
  slideshowTitle: string
  style: NonNullable<SlideShow['style']>
}): SlideTemplate {
  const palette = params.style.colorPalette?.length ? params.style.colorPalette : ['#0EA5E9', '#38BDF8', '#1D4ED8']
  const accent = normalizeHex(palette[0] || '#0EA5E9', '0EA5E9')
  const accent2 = normalizeHex(palette[1] || '#38BDF8', '38BDF8')
  const accent3 = normalizeHex(palette[2] || '#1D4ED8', '1D4ED8')
  const fontFace = String(params.style.font || 'Inter')
  const category = String(params.style.category || 'academic').toLowerCase()
  const theme: SlideTheme = (() => {
    const baseForm = {
      panelFillOpacity: 0.7,
      panelStrokeOpacity: 0.15,
      panelShadowOpacity: 0.3,
      sectionGap: 0.16,
      denseHeaderThreshold: 2.6,
      panelRadius: 0.24,
      sectionTitleAlign: 'left' as SectionTitleAlign,
      accentLineW: 1.05,
      accentLineH: 0.05,
    }
    if (category === 'business') {
      return {
        bg: '0B1220',
        ink: 'F8FAFC',
        muted: 'CBD5E1',
        muted2: '94A3B8',
        panelFill: '1E293B',
        panelStroke: 'FFFFFF',
        panelShadow: '000000',
        ...baseForm,
        decorativeMode: 'business',
        glows: [
          { x: -2.1, y: -1.8, w: 7.0, h: 6.4, color: accent2, opacity: 0.09 },
          { x: 8.0, y: -1.2, w: 5.8, h: 5.4, color: accent, opacity: 0.11 },
          { x: 4.7, y: 3.4, w: 8.0, h: 5.0, color: accent3, opacity: 0.07 },
        ],
      }
    }
    if (category === 'creative') {
      return {
        bg: '140B24',
        ink: 'FEF7FF',
        muted: 'E9D5FF',
        muted2: 'C4B5FD',
        panelFill: '26153A',
        panelStroke: accent2,
        panelShadow: '12081E',
        ...baseForm,
        decorativeMode: 'creative',
        glows: [
          { x: -2.1, y: -1.8, w: 7.0, h: 6.4, color: accent2, opacity: 0.1 },
          { x: 8.0, y: -1.2, w: 5.8, h: 5.4, color: accent, opacity: 0.12 },
          { x: 4.7, y: 3.4, w: 8.0, h: 5.0, color: accent3, opacity: 0.09 },
        ],
      }
    }
    if (category === 'children') {
      return {
        bg: '102A43',
        ink: 'F8FBFF',
        muted: 'D9F0FF',
        muted2: '9DD6FF',
        panelFill: '1D4E89',
        panelStroke: 'FFFFFF',
        panelShadow: '081A2E',
        ...baseForm,
        decorativeMode: 'children',
        glows: [
          { x: -2.1, y: -1.8, w: 7.0, h: 6.4, color: accent2, opacity: 0.1 },
          { x: 8.0, y: -1.2, w: 5.8, h: 5.4, color: accent, opacity: 0.12 },
          { x: 4.7, y: 3.4, w: 8.0, h: 5.0, color: accent3, opacity: 0.09 },
        ],
      }
    }
    return {
      bg: '111827',
      ink: 'F8FAFC',
      muted: 'D6E2F0',
      muted2: '94A3B8',
      panelFill: '182538',
      panelStroke: 'C7D2FE',
      panelShadow: '020617',
      ...baseForm,
      decorativeMode: 'academic',
      glows: [
        { x: -2.1, y: -1.8, w: 7.0, h: 6.4, color: accent2, opacity: 0.08 },
        { x: 8.0, y: -1.2, w: 5.8, h: 5.4, color: accent, opacity: 0.1 },
        { x: 4.7, y: 3.4, w: 8.0, h: 5.0, color: accent3, opacity: 0.06 },
      ],
    }
  })()

  const bg = theme.bg
  const ink = theme.ink
  const muted = theme.muted
  const muted2 = theme.muted2
  const panelFill = theme.panelFill
  const panelStroke = theme.panelStroke
  const panelShadow = theme.panelShadow
  const safeX = 0.8
  const safeW = 11.5
  const contentBottom = 5.96
  const sectionGap = Math.max(0.12, theme.sectionGap)
  const denseHeaderThreshold = theme.denseHeaderThreshold - 0.16
  const minContentTop = 2.02
  const density = {
    subtitleFontCenter: 10,
    subtitleFontDefault: 9,
    cardTitleFont: 11.5,
    cardBodyFont: 9.5,
    quizFont: 11,
    bodyFont: 11.2,
    splitLabelFont: 12,
    splitBodyFont: 11.4,
    fullFont: 13,
    imageBodyFont: 10.8,
  }

  const elements: TemplateElement[] = []

  const addGlow = (x: number, y: number, w: number, h: number, color: string, opacity: number) => {
    elements.push({
      kind: 'shape',
      shape: 'ellipse',
      x,
      y,
      w,
      h,
      fill: color,
      fillOpacity: opacity,
      strokeOpacity: 0,
      role: 'glow',
    })
  }

  theme.glows.forEach((glow) => addGlow(glow.x, glow.y, glow.w, glow.h, glow.color, glow.opacity))

  const slideTitle = String(params.slide.title || `Slide ${params.slideIndex + 1}`)
  const isTitleSlide = params.slideIndex === 0 || params.slide.layout === 'title-only'
  const isQuizSlide =
    String(params.slide.id || '').trim().toLowerCase() === 'slide-quiz' ||
    ['câu hỏi', 'quiz', 'trắc nghiệm'].some((token) => slideTitle.toLowerCase().includes(token))
  const isClosingSlide =
    String(params.slide.id || '').trim().toLowerCase() === 'slide-closing' ||
    ['cảm ơn', 'cam on', 'thank'].some((token) => slideTitle.toLowerCase().includes(token))
  const isMindmapSlide = String(params.slide.id || '').trim().toLowerCase() === 'slide-mindmap'
  const hasMindmapImage = isMindmapSlide && Boolean(String(params.slide.image || '').trim())
  const slideSubtitle = String(params.slide.subtitle || params.slide.content || '').trim()
  const derivedBullets = (params.slide.bullets?.length ? params.slide.bullets : extractIdeaBullets(String(params.slide.content || ''), 3))
    .map((x) => String(x))
    .filter(Boolean)
  const textDensity = {
    cardTitleMaxLines: 2,
    cardBodyMaxLines: 4,
    splitColMaxLines: 6,
    imageBodyMaxLines: 6,
  }

  const addPanel = (x: number, y: number, w: number, h: number, radius = theme.panelRadius) => {
    elements.push({
      kind: 'shape',
      shape: 'roundRect',
      x: x + 0.08,
      y: y + 0.11,
      w,
      h,
      fill: panelShadow,
      fillOpacity: theme.panelShadowOpacity,
      strokeOpacity: 0,
      radius,
      role: 'panel-shadow',
    })
    elements.push({
      kind: 'shape',
      shape: 'roundRect',
      x,
      y,
      w,
      h,
      fill: panelFill,
      fillOpacity: theme.panelFillOpacity,
      stroke: panelStroke,
      strokeOpacity: theme.panelStrokeOpacity,
      radius,
      role: 'panel-main',
    })
  }

  const addAccentLine = (x: number, y: number, w: number, opacity = 0.95) => {
    elements.push({
      kind: 'shape',
      shape: 'roundRect',
      x,
      y,
      w,
      h: theme.accentLineH,
      fill: accent,
      fillOpacity: opacity,
      strokeOpacity: 0,
      radius: 0.12,
      role: 'divider',
    })
  }

  const addSectionTitle = (title: string, subtitle?: string, center = false) => {
    const preferCenteredSection = theme.sectionTitleAlign === 'center'
    const useCenter = center || preferCenteredSection
    if (useCenter) {
      const titleY = 1.28
      const titleMetrics = resolveTitleMetricsByCategory(title, 11.5, category, true)
      const titleH = titleMetrics.height
      const accentY = titleY + titleH + 0.12
      const subtitleFont = titleMetrics.fontSize <= 32 ? density.subtitleFontCenter : density.subtitleFontCenter + 1
      const subtitleH = subtitle ? estimateTextHeight(subtitle, 10.1, subtitleFont, 1.28, 0.48, 0.9) : 0
      const subtitleY = accentY + 0.32

      if (theme.decorativeMode === 'creative') {
        elements.push({
          kind: 'shape',
          shape: 'roundRect',
          x: 2.4,
          y: titleY - 0.18,
          w: 8.5,
          h: titleH + 0.34,
          fill: accent2,
          fillOpacity: 0.12,
          strokeOpacity: 0,
          radius: 0.42,
          role: 'panel-accent',
        })
      } else if (theme.decorativeMode === 'children') {
        elements.push({
          kind: 'shape',
          shape: 'roundRect',
          x: 2.05,
          y: titleY - 0.16,
          w: 9.1,
          h: titleH + 0.3,
          fill: accent,
          fillOpacity: 0.16,
          stroke: panelStroke,
          strokeOpacity: 0.12,
          radius: 0.5,
          role: 'panel-accent',
        })
      }

      elements.push({
        kind: 'text',
        x: 0.9,
        y: titleY,
        w: 11.5,
        h: titleH,
        text: title,
        fontFace,
        fontSize: titleMetrics.fontSize,
        bold: true,
        align: 'center',
        valign: 'top',
        color: ink,
        lineHeight: titleMetrics.lineHeight,
      })
      addAccentLine(6.0, accentY, theme.accentLineW, 0.88)
      if (theme.decorativeMode === 'creative') {
        addAccentLine(5.55, accentY + 0.12, theme.accentLineW * 0.72, 0.5)
      } else if (theme.decorativeMode === 'children') {
        elements.push({
          kind: 'shape',
          shape: 'ellipse',
          x: 4.85,
          y: accentY - 0.04,
          w: 0.18,
          h: 0.18,
          fill: accent2,
          fillOpacity: 0.95,
          strokeOpacity: 0,
          role: 'panel-accent',
        })
        elements.push({
          kind: 'shape',
          shape: 'ellipse',
          x: 8.25,
          y: accentY - 0.04,
          w: 0.18,
          h: 0.18,
          fill: accent3,
          fillOpacity: 0.9,
          strokeOpacity: 0,
          role: 'panel-accent',
        })
      }
      if (subtitle) {
        elements.push({
          kind: 'text',
          x: 1.6,
          y: subtitleY,
          w: 10.1,
          h: subtitleH,
          text: subtitle,
          fontFace,
          fontSize: subtitleFont,
          align: 'center',
          valign: 'top',
          color: muted2,
          lineHeight: 1.28,
        })
      }
      return {
        contentTop: subtitle ? subtitleY + subtitleH + 0.34 : accentY + 0.28,
      }
    }

    const titleY = 0.78
    const titleMetrics = resolveTitleMetricsByCategory(title, safeW, category, false)
    const titleH = titleMetrics.height
    const accentY = titleY + titleH + 0.12
    const subtitleFont = titleMetrics.fontSize <= 21 ? density.subtitleFontDefault : density.subtitleFontDefault + 1
    const subtitleH = subtitle ? estimateTextHeight(subtitle, 8.4, subtitleFont, 1.28, 0.42, 0.82) : 0
    const subtitleY = accentY + 0.28

    if (theme.decorativeMode === 'creative') {
      elements.push({
        kind: 'shape',
        shape: 'roundRect',
        x: safeX,
        y: titleY - 0.1,
        w: Math.min(6.8, Math.max(4.6, title.length * 0.18)),
        h: titleH + 0.24,
        fill: accent2,
        fillOpacity: 0.1,
        strokeOpacity: 0,
        radius: 0.38,
        role: 'panel-accent',
      })
    } else if (theme.decorativeMode === 'children') {
      elements.push({
        kind: 'shape',
        shape: 'roundRect',
        x: safeX,
        y: titleY - 0.08,
        w: Math.min(7.2, Math.max(4.8, title.length * 0.19)),
        h: titleH + 0.2,
        fill: accent,
        fillOpacity: 0.14,
        stroke: panelStroke,
        strokeOpacity: 0.12,
        radius: 0.46,
        role: 'panel-accent',
      })
    }

    elements.push({
      kind: 'text',
      x: safeX,
      y: titleY,
      w: safeW,
      h: titleH,
      text: title,
      fontFace,
      fontSize: titleMetrics.fontSize,
      bold: true,
      align: preferCenteredSection ? 'center' : 'left',
      valign: 'top',
      color: ink,
      lineHeight: titleMetrics.lineHeight,
    })
    if (subtitle) {
      elements.push({
        kind: 'text',
        x: preferCenteredSection ? 1.55 : safeX,
        y: subtitleY,
        w: preferCenteredSection ? 10.1 : 8.4,
        h: subtitleH,
        text: subtitle,
        fontFace,
        fontSize: subtitleFont,
        align: preferCenteredSection ? 'center' : 'left',
        valign: 'top',
        color: muted2,
        lineHeight: 1.3,
      })
    }
    addAccentLine(preferCenteredSection ? 5.95 : safeX, accentY, theme.accentLineW, 0.82)
    if (theme.decorativeMode === 'creative' && !center) {
      addAccentLine((preferCenteredSection ? 5.95 : safeX) + 0.18, accentY + 0.12, theme.accentLineW * 0.78, 0.46)
    }
    return {
      contentTop: subtitle ? subtitleY + subtitleH + 0.32 : accentY + 0.26,
    }
  }

  const addCard = (x: number, y: number, w: number, h: number, index: number, title: string, body: string, iconColor: string) => {
    addPanel(x, y, w, h, theme.panelRadius + 0.04)
    const cardTitleFont = fitBodyFont(title, Math.max(1, w - 0.84), density.cardTitleFont, 2, 10.2)
    const cardBodyFont = fitBodyFont(body, Math.max(1, w - 0.84), density.cardBodyFont, 4, 8.8)
    if (theme.decorativeMode === 'creative') {
      elements.push({
        kind: 'shape',
        shape: 'roundRect',
        x: x + 0.26,
        y: y + 0.24,
        w: Math.min(1.35, w - 0.52),
        h: 0.12,
        fill: iconColor,
        fillOpacity: 0.9,
        strokeOpacity: 0,
        radius: 0.14,
        role: 'panel-accent',
      })
    }
    if (theme.decorativeMode === 'children') {
      elements.push({
        kind: 'shape',
        shape: 'ellipse',
        x: x + 0.28,
        y: y + 0.28,
        w: 0.56,
        h: 0.42,
        fill: iconColor,
        fillOpacity: 0.22,
        stroke: iconColor,
        strokeOpacity: 0.28,
        role: 'panel-accent',
      })
    }
    elements.push({
      kind: 'text',
      x: theme.decorativeMode === 'children' ? x + 0.37 : x + 0.42,
      y: y + 0.38,
      w: 0.6,
      h: 0.3,
      text: String(index).padStart(2, '0'),
      fontFace,
      fontSize: 9,
      color: iconColor,
      bold: true,
      valign: 'top',
      letterSpacing: 0.8,
    })
    elements.push({
      kind: 'text',
      x: x + 0.42,
      y: y + 0.86,
      w: w - 0.84,
      h: 0.8,
      text: title,
      fontFace,
      fontSize: cardTitleFont,
      color: ink,
      bold: true,
      valign: 'top',
      lineHeight: 1.15,
    })
    addBodyText(body, x + 0.42, y + 1.7, w - 0.84, Math.max(1.8, h - 2.02), cardBodyFont, {
      color: muted,
      lineHeight: 1.38,
    })
  }

  const addQuizRow = (x: number, y: number, w: number, h: number, index: number, text: string, color: string) => {
    addPanel(x, y, w, h, theme.decorativeMode === 'children' ? 0.38 : theme.panelRadius)
    elements.push({
      kind: 'shape',
      shape: theme.decorativeMode === 'children' ? 'ellipse' : 'roundRect',
      x: x + 0.22,
      y: y + 0.18,
      w: 0.9,
      h: Math.max(0.36, h - 0.36),
      fill: color,
      fillOpacity: 0.18,
      stroke: color,
      strokeOpacity: 0.35,
      radius: 0.18,
      role: 'panel-accent',
    })
    elements.push({
      kind: 'text',
      x: x + 0.3,
      y: y + 0.24,
      w: 0.7,
      h: Math.max(0.24, h - 0.42),
      text: String(index).padStart(2, '0'),
      fontFace,
      fontSize: 10,
      color: color,
      bold: true,
      align: 'center',
      valign: 'middle',
      letterSpacing: 0.9,
    })
    elements.push({
      kind: 'text',
      x: x + 1.36,
      y: y + 0.2,
      w: w - 1.7,
      h: Math.max(0.3, h - 0.38),
      text,
      fontFace,
      fontSize: density.quizFont,
      color: ink,
      bold: true,
      valign: 'middle',
      lineHeight: 1.2,
    })
  }

  const addBodyText = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize: number,
    opts?: {
      lineHeight?: number
      color?: string
      valign?: 'top' | 'middle' | 'bottom'
      align?: 'left' | 'center' | 'right'
    },
  ) => {
    elements.push({
      kind: 'text',
      x,
      y,
      w,
      h,
      text,
      fontFace,
      fontSize,
      color: opts?.color ?? muted,
      valign: opts?.valign ?? 'top',
      align: opts?.align,
      lineHeight: opts?.lineHeight ?? 1.42,
    })
  }

  const addFittedBodyText = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize: number,
    maxLines: number,
    opts?: {
      lineHeight?: number
      color?: string
      valign?: 'top' | 'middle' | 'bottom'
      align?: 'left' | 'center' | 'right'
      minFont?: number
    },
  ) => {
    const effectiveFont = fitBodyFont(text, w, fontSize, maxLines, opts?.minFont ?? Math.max(9.2, fontSize - 1.8))
    addBodyText(text, x, y, w, h, effectiveFont, {
      ...opts,
      lineHeight: opts?.lineHeight ?? 1.4,
    })
  }

  const addBulletListPanel = (items: string[], x: number, y: number, w: number, h: number, fontSize = 15) => {
    const text = items.map((item) => `• ${item}`).join('\n\n')
    const effectiveFont = fitBodyFont(text, Math.max(1, w - 0.76), fontSize, 8, Math.max(9.4, fontSize - 1.6))
    const lines = estimateTextLines(text, Math.max(1, w - 0.76), effectiveFont, 12)
    const idealH = Math.max(1.15, Math.min(h, lines * ((effectiveFont / 72) * 1.42) + 0.9))
    addPanel(x, y, w, idealH, 0.34)
    addBodyText(text, x + 0.38, y + 0.34, w - 0.76, Math.max(0.6, idealH - 0.68), effectiveFont, {
      lineHeight: 1.42,
    })
  }

  const cardNeedsSafeLayout = (title: string, body: string, cardW: number) => {
    const titleLines = estimateTextLines(title, Math.max(1, cardW - 0.84), density.cardTitleFont, 4)
    const bodyLines = estimateTextLines(body, Math.max(1, cardW - 0.84), density.cardBodyFont, 8)
    return titleLines > textDensity.cardTitleMaxLines || bodyLines > textDensity.cardBodyMaxLines
  }

  const splitNeedsSafeLayout = (leftTitle: string, leftBody: string, rightTitle: string, rightBody: string, colW: number) => {
    const titleBudgetExceeded =
      estimateTextLines(leftTitle, Math.max(1, colW - 0.75), density.splitLabelFont, 3) > 1 ||
      estimateTextLines(rightTitle, Math.max(1, colW - 0.75), density.splitLabelFont, 3) > 1
    const bodyBudgetExceeded =
      estimateTextLines(leftBody, Math.max(1, colW - 0.75), density.splitBodyFont, 10) > textDensity.splitColMaxLines ||
      estimateTextLines(rightBody, Math.max(1, colW - 0.75), density.splitBodyFont, 10) > textDensity.splitColMaxLines
    return titleBudgetExceeded || bodyBudgetExceeded
  }

  const imageNeedsSafeTextOnly = (body: string) => {
    const bodyLines = estimateTextLines(body, 4.9, density.imageBodyFont, 10)
    return bodyLines > textDensity.imageBodyMaxLines
  }

  if (isClosingSlide) {
    const closingTitle = slideTitle
    const closingText = slideSubtitle || String(params.slide.content || '').trim()
    const titleY = 2.0
    const titleH = estimateTextHeight(closingTitle, 9.0, 28, 1.06, 0.68, 1.08)

    elements.push({
      kind: 'text',
      x: 1.2,
      y: titleY,
      w: 10.9,
      h: titleH,
      text: closingTitle,
      fontFace,
      fontSize: 28,
      bold: true,
      align: 'center',
      valign: 'middle',
      color: ink,
      lineHeight: 1.06,
    })

    addAccentLine(5.66, titleY + titleH + 0.26, 2.0, 0.9)
    addPanel(3.0, 4.0, 7.35, 0.9, 0.24)
    addBodyText(closingText, 3.35, 4.16, 6.65, 0.48, density.bodyFont - 1.5, {
      align: 'center',
      valign: 'middle',
      lineHeight: 1.22,
      color: muted,
    })
  } else if (isTitleSlide) {
    addSectionTitle(slideTitle, slideSubtitle, true)
  } else if (hasMindmapImage) {
    const header = addSectionTitle(slideTitle)
    const mediaTop = Math.max(minContentTop, header.contentTop + 0.1)
    const panelX = 1.0
    const panelW = 11.33
    const panelH = Math.max(3.95, contentBottom - mediaTop)
    addPanel(panelX, mediaTop, panelW, panelH, 0.32)
    elements.push({
      kind: 'shape',
      shape: 'roundRect',
      x: panelX + 0.34,
      y: mediaTop + 0.3,
      w: panelW - 0.68,
      h: Math.max(3.2, panelH - 0.6),
      fill: '0B1220',
      fillOpacity: 0.08,
      stroke: 'FFFFFF',
      strokeOpacity: 0.08,
      radius: 0.28,
      role: 'image-frame',
    })
    elements.push({
      kind: 'image',
      x: panelX + 0.34,
      y: mediaTop + 0.3,
      w: panelW - 0.68,
      h: Math.max(3.2, panelH - 0.6),
      src: String(params.slide.image),
      radius: 0.26,
      fit: 'contain',
    })
  } else if (isQuizSlide) {
    const header = addSectionTitle(slideTitle, slideSubtitle)
    const quizTop = Math.max(minContentTop, header.contentTop)
    const quizH = Math.max(3.7, contentBottom - quizTop)
    const questions = derivedBullets.slice(0, 3)

    if (!questions.length) {
      addPanel(safeX, quizTop, safeW, quizH, 0.3)
      addBodyText('• Chưa có câu hỏi ôn tập để hiển thị.', 1.18, quizTop + 0.38, 10.8, Math.max(2.4, quizH - 0.7), density.quizFont, {
        lineHeight: 1.45,
      })
    } else {
      const gap = 0.22
      const availableH = quizH - gap * (questions.length - 1)
      const rowH = Math.max(0.74, Math.min(1.22, availableH / questions.length))
      let y = quizTop
      questions.forEach((question, idx) => {
        const color = idx % 2 === 0 ? accent : accent2
        addQuizRow(safeX, y, safeW, rowH, idx + 1, question, color)
        y += rowH + gap
      })
    }
  } else if (params.slide.layout === 'grid') {
    const header = addSectionTitle(slideTitle, slideSubtitle)
    const gridTop = Math.max(minContentTop, header.contentTop + sectionGap)
    const gridH = Math.max(3.65, contentBottom - gridTop)
    const rawItems = derivedBullets.slice(0, 3)

    const cards = rawItems.map((line) => {
      const idx = line.indexOf(':')
      if (idx > 0) {
        return { title: line.slice(0, idx).trim(), body: line.slice(idx + 1).trim() }
      }
      return { title: line.trim(), body: '' }
    })
    const projectedCardW = cards.length >= 3 ? (safeW - 0.34 * 2) / 3 : cards.length === 2 ? (safeW - 0.48) / 2 : safeW
    const useSafeListLayout =
      header.contentTop >= denseHeaderThreshold ||
      gridH < 4.1 ||
      cards.some((card) => cardNeedsSafeLayout(card.title, card.body, projectedCardW))

    if (cards.length === 0) {
      const fallbackBullets = extractIdeaBullets(String(params.slide.content || slideSubtitle || ''), 3)
      addBulletListPanel(fallbackBullets.length ? fallbackBullets : [slideSubtitle], safeX, gridTop, safeW, gridH, density.bodyFont + 0.8)
    } else if (useSafeListLayout) {
      const items = cards.map((card) => [card.title, card.body].filter(Boolean).join(': ')).filter(Boolean)
      addBulletListPanel(items, safeX, gridTop, safeW, gridH, density.bodyFont)
    } else if (cards.length >= 3) {
      const y = gridTop
      const gap = 0.34
      const w = (safeW - gap * 2) / 3
      const h = gridH
      const x0 = safeX
      for (let i = 0; i < 3; i++) {
        const c = cards[i]
        addCard(x0 + i * (w + gap), y, w, h, i + 1, c.title, c.body, i === 0 ? accent : i === 1 ? accent2 : accent3)
      }
    } else if (cards.length === 2) {
      const y = gridTop
      const gap = 0.48
      const w = (safeW - gap) / 2
      const h = gridH
      const x0 = safeX
      for (let i = 0; i < 2; i++) {
        const c = cards[i]
        addCard(x0 + i * (w + gap), y, w, h, i + 1, c.title, c.body, i === 0 ? accent : accent2)
      }
    } else {
      const single = cards[0]
      const body = [single.title, single.body].filter(Boolean)
      addBulletListPanel(body, safeX, gridTop, safeW, gridH, density.bodyFont)
    }
  } else if (params.slide.layout === 'split') {
    const header = addSectionTitle(slideTitle, slideSubtitle)
    const splitTop = Math.max(minContentTop, header.contentTop + sectionGap)
    const splitH = Math.max(3.7, contentBottom - splitTop)
    const leftTitle = String(params.slide.leftTitle || 'Phần 1')
    const rightTitle = String(params.slide.rightTitle || 'Phần 2')
    const leftProvided = (params.slide.leftBullets || []).map((x) => String(x)).filter(Boolean)
    const rightProvided = (params.slide.rightBullets || []).map((x) => String(x)).filter(Boolean)

    const fallbackLines = (() => {
      const fromBullets = extractIdeaBullets(String(params.slide.content || ''), 3)
      if (fromBullets.length) return fromBullets
      const lines = String(params.slide.content || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length > 1) return lines
      const raw = slideSubtitle || String(params.slide.content || '')
      return raw ? [raw] : []
    })()

    const [leftBullets, rightBullets] = (() => {
      if (leftProvided.length || rightProvided.length) return [leftProvided, rightProvided]
      const mid = Math.ceil(fallbackLines.length / 2)
      return [fallbackLines.slice(0, mid), fallbackLines.slice(mid)]
    })()
    const splitPreviewW = (safeW - 0.5) / 2
    const useSafeStackLayout =
      header.contentTop >= denseHeaderThreshold ||
      splitH < 4.15 ||
      splitNeedsSafeLayout(
        leftTitle,
        leftBullets.map((b) => `• ${b}`).join('\n\n'),
        rightTitle,
        rightBullets.map((b) => `• ${b}`).join('\n\n'),
        splitPreviewW,
      )

    const hasTwoCols = leftBullets.length > 0 && rightBullets.length > 0
    if (!hasTwoCols) {
      const bodyItems = leftBullets.length ? leftBullets : slideSubtitle ? [slideSubtitle] : []
      addBulletListPanel(bodyItems, safeX, splitTop, safeW, splitH, density.bodyFont + 0.8)
    } else if (useSafeStackLayout) {
      const stackedItems = [
        ...leftBullets.map((b) => `${leftTitle}: ${b}`),
        ...rightBullets.map((b) => `${rightTitle}: ${b}`),
      ]
      addBulletListPanel(stackedItems, safeX, splitTop, safeW, splitH, density.bodyFont)
    } else {
      const x0 = safeX
      const gap = 0.5
      const w = (safeW - gap) / 2
      const y = splitTop
      const h = splitH
      addPanel(x0, y, w, h, 0.32)
      addPanel(x0 + w + gap, y, w, h, 0.32)
      addAccentLine(x0 + 0.38, y + 0.56, 0.95, 0.78)
      addAccentLine(x0 + w + gap + 0.38, y + 0.56, 0.95, 0.78)
      elements.push({
        kind: 'text',
        x: x0 + 0.38,
        y: y + 0.38,
        w: w - 0.7,
        h: 0.55,
        text: leftTitle,
        fontFace,
        fontSize: density.splitLabelFont,
        bold: true,
        color: accent,
        valign: 'top',
      })
      elements.push({
        kind: 'text',
        x: x0 + w + gap + 0.38,
        y: y + 0.38,
        w: w - 0.7,
        h: 0.55,
        text: rightTitle,
        fontFace,
        fontSize: density.splitLabelFont,
        bold: true,
        color: accent2,
        valign: 'top',
      })
      addFittedBodyText(leftBullets.map((b) => `• ${b}`).join('\n\n'), x0 + 0.38, y + 1.02, w - 0.75, Math.max(2.0, h - 1.28), density.splitBodyFont, 6, {
        lineHeight: 1.38,
        minFont: 9.2,
      })
      addFittedBodyText(rightBullets.map((b) => `• ${b}`).join('\n\n'), x0 + w + gap + 0.38, y + 1.02, w - 0.75, Math.max(2.0, h - 1.28), density.splitBodyFont, 6, {
        lineHeight: 1.38,
        minFont: 9.2,
      })
    }
  } else if (params.slide.layout === 'full') {
    const text = String(params.slide.quote || params.slide.content || '').trim()
    const header = addSectionTitle(slideTitle, slideSubtitle)
    const fullTop = Math.max(minContentTop, header.contentTop + sectionGap)
    const fullH = Math.max(3.5, contentBottom - fullTop)
    const useSafeBulletFull = header.contentTop >= denseHeaderThreshold || fullH < 4.0
    if (useSafeBulletFull) {
      const safeItems = derivedBullets.length ? derivedBullets : extractIdeaBullets(String(text || slideSubtitle || ''), 3)
      addBulletListPanel(safeItems.length ? safeItems : [text || slideSubtitle || slideTitle], safeX, fullTop, safeW, fullH, density.bodyFont)
    } else {
    addPanel(0.95, fullTop, 11.3, fullH, 0.36)
    elements.push({
      kind: 'text',
      x: 1.45,
      y: fullTop + 0.45,
      w: 10.3,
      h: Math.max(2.6, fullH - 0.9),
      text: text ? `“${text}”` : '',
      fontFace,
      fontSize: density.fullFont,
      italic: true,
      align: 'left',
      valign: 'top',
      color: ink,
      lineHeight: 1.4,
    })
    addAccentLine(1.45, Math.min(contentBottom - 0.18, fullTop + fullH - 0.3), 1.45, 0.86)
    }
  } else if (params.slide.layout === 'image-left' || params.slide.layout === 'image-right') {
    const header = addSectionTitle(slideTitle, slideSubtitle)
    const mediaTop = Math.max(minContentTop, header.contentTop + sectionGap)
    const mediaH = Math.max(3.7, contentBottom - mediaTop)
    const bullets = derivedBullets.slice(0, 3)
    const bodyText = bullets.length ? bullets.map((b) => `• ${b}`).join('\n\n') : slideSubtitle
    const hasResolvedImage = Boolean(String(params.slide.image || '').trim())
    const useSafeTextOnly = !hasResolvedImage && (header.contentTop >= denseHeaderThreshold || mediaH < 4.0 || imageNeedsSafeTextOnly(bodyText))

    const contentX = params.slide.layout === 'image-right' ? safeX : 6.75
    const imageX = params.slide.layout === 'image-right' ? 6.75 : safeX

    if (useSafeTextOnly) {
      addBulletListPanel(
        bullets.length ? bullets : extractIdeaBullets(String(params.slide.content || slideSubtitle || ''), 3),
        safeX,
        mediaTop,
        safeW,
        mediaH,
        density.bodyFont,
      )
    } else {
      addPanel(contentX, mediaTop, 5.55, mediaH, 0.34)
      const fittedImageBodyFont = fitBodyFont(bodyText, 4.9, density.imageBodyFont, 7, 9.6)
      addBodyText(bodyText, contentX + 0.35, mediaTop + 0.33, 4.9, Math.max(2.2, mediaH - 0.65), fittedImageBodyFont, {
        lineHeight: 1.38,
      })

      addPanel(imageX, mediaTop, 5.55, mediaH, 0.34)
      elements.push({
        kind: 'shape',
        shape: 'roundRect',
        x: imageX + 0.42,
        y: mediaTop + 0.38,
        w: 4.7,
        h: Math.max(2.9, mediaH - 0.72),
        fill: '0B1220',
        fillOpacity: 0.18,
        stroke: 'FFFFFF',
        strokeOpacity: 0.16,
        radius: 0.26,
        role: 'image-frame',
      })
      if (params.slide.image) {
        elements.push({
          kind: 'image',
          x: imageX + 0.42,
          y: mediaTop + 0.38,
          w: 4.7,
          h: Math.max(2.9, mediaH - 0.72),
          src: String(params.slide.image),
          radius: 0.26,
        })
      }
    }
  } else {
    const header = addSectionTitle(slideTitle, slideSubtitle)
    const contentTop = Math.max(minContentTop, header.contentTop + sectionGap)
    const contentH = Math.max(3.7, contentBottom - contentTop)
    addPanel(safeX, contentTop, safeW, contentH, 0.34)
    const rawBullets = derivedBullets.length ? derivedBullets : extractIdeaBullets(String(params.slide.subtitle || params.slide.content || ''), 3)
    const raw = rawBullets.length ? rawBullets.map((b) => `• ${b}`).join('\n\n') : String(params.slide.subtitle || params.slide.content || '').trim()
    const fittedDefaultFont = fitBodyFont(raw, 10.8, density.bodyFont, 8, 9.8)
    addBodyText(raw, 1.18, contentTop + 0.33, 10.8, Math.max(2.2, contentH - 0.84), fittedDefaultFont, {
      lineHeight: 1.36,
    })
  }

  elements.push({
    kind: 'text',
    x: 12.0,
    y: 6.9,
    w: 1.3,
    h: 0.25,
    text: `${params.slideIndex + 1} / ${params.slideCount}`,
    fontFace,
    fontSize: 7,
    align: 'right',
    valign: 'top',
    color: '94A3B8',
  })

  return { background: bg, elements }
}
