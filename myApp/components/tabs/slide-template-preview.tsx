'use client'

import { buildSlideTemplate, SLIDE_H_IN, SLIDE_W_IN, type TemplateElement } from './slide-template'
import type { Slide, SlideShow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { resolveSlideFontFamily } from '@/lib/slide-fonts'

function hexToRgba(hex: string, opacity = 1) {
  const raw = hex.trim().replace('#', '')
  const normalized =
    raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padStart(6, '0').slice(0, 6)
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function ptToPx(pt: number) {
  return pt * (96 / 72)
}

function boxStyle(x: number, y: number, w: number, h: number) {
  return {
    left: `${(x / SLIDE_W_IN) * 100}%`,
    top: `${(y / SLIDE_H_IN) * 100}%`,
    width: `${(w / SLIDE_W_IN) * 100}%`,
    height: `${(h / SLIDE_H_IN) * 100}%`,
  } as const
}

function renderElement(el: TemplateElement, idx: number) {
  if (el.kind === 'image') {
    const borderRadius = el.radius != null ? `${((el.radius ?? 0.26) / SLIDE_W_IN) * 100}%` : '14px'
    return (
      <img
        key={`img-${idx}`}
        src={el.src}
        className="absolute"
        style={{
          ...boxStyle(el.x, el.y, el.w, el.h),
          objectFit: el.fit || 'cover',
          objectPosition: 'center',
          borderRadius,
          opacity: 0.95,
          overflow: 'hidden',
          background: el.fit === 'contain' ? 'rgba(255,255,255,0.04)' : undefined,
        }}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }
  if (el.kind === 'shape') {
    const fill = hexToRgba(el.fill, el.fillOpacity ?? 1)
    const stroke = el.stroke ? hexToRgba(el.stroke, el.strokeOpacity ?? 1) : 'transparent'
    const borderRadius =
      el.shape === 'ellipse'
        ? '9999px'
        : el.shape === 'roundRect'
          ? `${((el.radius ?? 0.18) / SLIDE_W_IN) * 100}%`
          : '0px'
    return (
      <div
        key={`shape-${idx}`}
        className="absolute"
        style={{
          ...boxStyle(el.x, el.y, el.w, el.h),
          background: fill,
          border: `1px solid ${stroke}`,
          borderRadius,
          overflow: 'hidden',
          backdropFilter: el.role === 'panel-main' ? 'blur(12px)' : undefined,
          WebkitBackdropFilter: el.role === 'panel-main' ? 'blur(12px)' : undefined,
          boxShadow:
            el.role === 'panel-main'
              ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)'
              : el.role === 'panel-shadow'
                ? '0 18px 42px rgba(0,0,0,0.35)'
                : el.role === 'image-frame'
                  ? '0 8px 24px rgba(2,8,23,0.42)'
                  : undefined,
        }}
      />
    )
  }

  const fontWeight = el.bold ? 700 : 400
  const fontStyle = el.italic ? 'italic' : 'normal'
  const textAlign = el.align ?? 'left'
  const justifyContent = el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start'
  const letterSpacing = el.letterSpacing != null ? `${el.letterSpacing}px` : undefined
  const lineHeight = el.lineHeight != null ? el.lineHeight : 1.35
  return (
    <div
      key={`text-${idx}`}
      className="absolute"
      style={{
        ...boxStyle(el.x, el.y, el.w, el.h),
        display: 'flex',
        flexDirection: 'column',
        justifyContent,
        boxSizing: 'border-box',
        padding: '3px 4px 2px 4px',
        fontFamily: resolveSlideFontFamily(el.fontFace),
        fontSize: `${ptToPx(el.fontSize)}px`,
        fontWeight,
        fontStyle,
        color: `#${el.color}`,
        textAlign,
        lineHeight,
        letterSpacing,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        overflow: 'hidden',
      }}
    >
      {el.text}
    </div>
  )
}

export function SlideTemplatePreview(props: {
  slide: Slide
  slideIndex: number
  slideCount: number
  slideshowTitle: string
  style: NonNullable<SlideShow['style']>
  className?: string
}) {
  const template = buildSlideTemplate({
    slide: props.slide,
    slideIndex: props.slideIndex,
    slideCount: props.slideCount,
    slideshowTitle: props.slideshowTitle,
    style: props.style,
  })

  return (
    <div className={cn('absolute inset-0', props.className)}>
      <div className="absolute inset-0" style={{ background: `#${template.background}` }} />
      {template.elements.map((el, idx) => renderElement(el, idx))}
    </div>
  )
}
