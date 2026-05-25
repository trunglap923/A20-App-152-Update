'use client'

import type { SlideShow } from './types'
import { createClient } from './supabaseClient'

export const MINDMAP_SLIDE_IMAGE_EVENT = 'mindmap-slide-image-updated'
const SLIDE_ASSETS_BUCKET = 'slide-assets'

type SlideDeckRecord = {
  item_id: string
  user_id: string
  slideshow?: SlideShow | null
  mindmap_image_path?: string | null
  mindmap_image?: string | null
  updated_at?: string
}

type PersistedSlideDeck = {
  slideshow: SlideShow | null
  mindmapImage: string | null
  updatedAt: string | null
}

export type SyncResult = {
  status: 'cloud' | 'cache'
  message?: string | null
  savedAt?: string | null
}

function normalizeItemId(itemId?: string) {
  return String(itemId || '').trim()
}

function normalizeStorageSegment(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default'
}

function isDataUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(value || '').trim())
}

function isSupabasePersistenceMissing(message: string) {
  const normalized = String(message || '').toLowerCase()
  return (
    normalized.includes('relation') ||
    normalized.includes('does not exist') ||
    normalized.includes('not found') ||
    normalized.includes('permission') ||
    normalized.includes('bucket')
  )
}

function dataUrlToBlob(dataUrl: string) {
  const [header, body] = String(dataUrl).split(',', 2)
  const mimeType = header.match(/data:(.*?);base64/i)?.[1] || 'image/png'
  const binary = window.atob(body || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

function getMindmapStoragePath(itemId: string, userId: string) {
  return `${normalizeStorageSegment(userId)}/mindmaps/${normalizeStorageSegment(itemId)}.png`
}

export function getSlideshowStorageKey(itemId?: string) {
  return `nexus.slides.slideshow.${normalizeItemId(itemId) || 'unknown'}`
}

export function getMindmapSlideImageStorageKey(itemId?: string) {
  return `slides:mindmap-image:${normalizeItemId(itemId) || 'default'}`
}

function dispatchMindmapImageEvent(itemId?: string, dataUrl?: string | null) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(MINDMAP_SLIDE_IMAGE_EVENT, {
      detail: { itemId: normalizeItemId(itemId) || 'default', dataUrl: String(dataUrl || '').trim() || null },
    }),
  )
}

export function loadSlideshowFromCache(itemId?: string): SlideShow | null {
  if (typeof window === 'undefined') return null
  try {
    const rawValue = window.localStorage.getItem(getSlideshowStorageKey(itemId))
    if (!rawValue) return null
    const parsed = JSON.parse(rawValue) as { slideshow?: SlideShow } | SlideShow
    const candidate = (parsed as any)?.slideshow ?? parsed
    if (!candidate || typeof candidate !== 'object') return null
    if (!Array.isArray((candidate as any).slides)) return null
    if (typeof (candidate as any).title !== 'string') return null
    return candidate as SlideShow
  } catch {
    return null
  }
}

function loadSlideshowCacheMeta(itemId?: string): { slideshow: SlideShow | null; savedAt: string | null } {
  if (typeof window === 'undefined') return { slideshow: null, savedAt: null }
  try {
    const rawValue = window.localStorage.getItem(getSlideshowStorageKey(itemId))
    if (!rawValue) return { slideshow: null, savedAt: null }
    const parsed = JSON.parse(rawValue) as { slideshow?: SlideShow; at?: number } | SlideShow
    const candidate = (parsed as any)?.slideshow ?? parsed
    if (!candidate || typeof candidate !== 'object') return { slideshow: null, savedAt: null }
    if (!Array.isArray((candidate as any).slides)) return { slideshow: null, savedAt: null }
    if (typeof (candidate as any).title !== 'string') return { slideshow: null, savedAt: null }
    const savedAt = typeof (parsed as any)?.at === 'number' ? new Date((parsed as any).at).toISOString() : null
    return { slideshow: candidate as SlideShow, savedAt }
  } catch {
    return { slideshow: null, savedAt: null }
  }
}

export function saveSlideshowToCache(slideshow: SlideShow | null, itemId?: string) {
  if (typeof window === 'undefined' || !slideshow) return
  try {
    window.localStorage.setItem(
      getSlideshowStorageKey(itemId),
      JSON.stringify({ v: 1, at: Date.now(), slideshow }),
    )
  } catch {
    // ignore cache persistence failures
  }
}

export function loadMindmapSlideImageFromCache(itemId?: string) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getMindmapSlideImageStorageKey(itemId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { dataUrl?: string } | string
    if (typeof parsed === 'string') return parsed
    return typeof parsed?.dataUrl === 'string' ? parsed.dataUrl : null
  } catch {
    return null
  }
}

function loadMindmapSlideImageCacheMeta(itemId?: string): { dataUrl: string | null; savedAt: string | null } {
  if (typeof window === 'undefined') return { dataUrl: null, savedAt: null }
  try {
    const raw = window.localStorage.getItem(getMindmapSlideImageStorageKey(itemId))
    if (!raw) return { dataUrl: null, savedAt: null }
    const parsed = JSON.parse(raw) as { dataUrl?: string; at?: number } | string
    if (typeof parsed === 'string') return { dataUrl: parsed, savedAt: null }
    const savedAt = typeof parsed?.at === 'number' ? new Date(parsed.at).toISOString() : null
    return { dataUrl: typeof parsed?.dataUrl === 'string' ? parsed.dataUrl : null, savedAt }
  } catch {
    return { dataUrl: null, savedAt: null }
  }
}

export function saveMindmapSlideImageToCache(dataUrl: string, itemId?: string) {
  if (typeof window === 'undefined') return
  const safeDataUrl = String(dataUrl || '').trim()
  if (!safeDataUrl) return
  try {
    window.localStorage.setItem(
      getMindmapSlideImageStorageKey(itemId),
      JSON.stringify({ at: Date.now(), dataUrl: safeDataUrl }),
    )
  } catch {
    // ignore cache persistence failures
  }
  dispatchMindmapImageEvent(itemId, safeDataUrl)
}

async function getCurrentUserId() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return String(session?.user?.id || '').trim() || null
}

async function fetchSlideDeckRecord(itemId?: string): Promise<SlideDeckRecord | null> {
  const safeItemId = normalizeItemId(itemId)
  if (!safeItemId) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('slide_decks')
    .select('item_id, user_id, slideshow, mindmap_image_path, mindmap_image, updated_at')
    .eq('item_id', safeItemId)
    .maybeSingle()

  if (error) {
    if (isSupabasePersistenceMissing(error.message || '')) {
      return null
    }
    throw error
  }

  return (data as SlideDeckRecord | null) || null
}

async function upsertSlideDeckRecord(
  itemId: string | undefined,
  patch: { slideshow?: SlideShow | null; mindmap_image_path?: string | null; mindmap_image?: string | null },
) {
  const safeItemId = normalizeItemId(itemId)
  if (!safeItemId) return
  const userId = await getCurrentUserId()
  if (!userId) return

  const supabase = createClient()
  let existing: SlideDeckRecord | null = null
  try {
    existing = await fetchSlideDeckRecord(safeItemId)
  } catch {
    existing = null
  }

  const payload: SlideDeckRecord = {
    item_id: safeItemId,
    user_id: userId,
    slideshow: patch.slideshow !== undefined ? patch.slideshow : existing?.slideshow ?? null,
    mindmap_image_path:
      patch.mindmap_image_path !== undefined ? patch.mindmap_image_path : existing?.mindmap_image_path ?? null,
    mindmap_image: patch.mindmap_image !== undefined ? patch.mindmap_image : existing?.mindmap_image ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('slide_decks')
    .upsert(payload, { onConflict: 'item_id' })

  if (error) {
    if (isSupabasePersistenceMissing(error.message || '')) {
      return
    }
    throw error
  }
}

function getMindmapPublicUrl(path: string) {
  const supabase = createClient()
  const { data } = supabase.storage.from(SLIDE_ASSETS_BUCKET).getPublicUrl(path)
  return String(data?.publicUrl || '').trim() || null
}

async function uploadMindmapImageToStorage(dataUrl: string, itemId?: string) {
  const safeItemId = normalizeItemId(itemId)
  if (!safeItemId || !isDataUrl(dataUrl)) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const filePath = getMindmapStoragePath(safeItemId, userId)
  const supabase = createClient()
  const blob = dataUrlToBlob(dataUrl)
  const { error } = await supabase.storage
    .from(SLIDE_ASSETS_BUCKET)
    .upload(filePath, blob, {
      upsert: true,
      contentType: blob.type || 'image/png',
    })

  if (error) {
    if (isSupabasePersistenceMissing(error.message || '')) {
      return null
    }
    throw error
  }

  return filePath
}

async function resolveMindmapImageFromRecord(record: SlideDeckRecord | null, itemId?: string) {
  const remotePath = String(record?.mindmap_image_path || '').trim()
  if (remotePath) {
    const publicUrl = getMindmapPublicUrl(remotePath)
    if (publicUrl) {
      saveMindmapSlideImageToCache(publicUrl, itemId)
      return publicUrl
    }
  }

  const legacyValue = String(record?.mindmap_image || '').trim()
  if (legacyValue) {
    saveMindmapSlideImageToCache(legacyValue, itemId)
    if (isDataUrl(legacyValue)) {
      void saveMindmapSlideImage(legacyValue, itemId)
    }
    return legacyValue
  }

  return null
}

export async function loadPersistedSlideDeck(itemId?: string): Promise<PersistedSlideDeck> {
  const cacheDeckMeta = loadSlideshowCacheMeta(itemId)
  const cacheMindmapMeta = loadMindmapSlideImageCacheMeta(itemId)
  const cacheDeck = cacheDeckMeta.slideshow
  const cacheMindmapImage = cacheMindmapMeta.dataUrl
  try {
    const record = await fetchSlideDeckRecord(itemId)
    if (!record) {
      return { slideshow: cacheDeck, mindmapImage: cacheMindmapImage, updatedAt: cacheDeckMeta.savedAt || cacheMindmapMeta.savedAt }
    }

    const slideshow = (record.slideshow as SlideShow | null) || cacheDeck
    const mindmapImage = (await resolveMindmapImageFromRecord(record, itemId)) || cacheMindmapImage

    if (slideshow) saveSlideshowToCache(slideshow, itemId)

    return {
      slideshow,
      mindmapImage,
      updatedAt: String(record.updated_at || '').trim() || cacheDeckMeta.savedAt || cacheMindmapMeta.savedAt,
    }
  } catch {
    return { slideshow: cacheDeck, mindmapImage: cacheMindmapImage, updatedAt: cacheDeckMeta.savedAt || cacheMindmapMeta.savedAt }
  }
}

export async function savePersistedSlideDeck(slideshow: SlideShow | null, itemId?: string): Promise<SyncResult> {
  if (!slideshow) return { status: 'cache', message: null, savedAt: null }
  saveSlideshowToCache(slideshow, itemId)
  const savedAt = new Date().toISOString()
  try {
    await upsertSlideDeckRecord(itemId, { slideshow })
    return { status: 'cloud', message: null, savedAt }
  } catch {
    // keep local cache as fallback
    return { status: 'cache', message: 'Không thể đồng bộ deck slide lên Supabase. Đang giữ bản cache cục bộ.', savedAt }
  }
}

export async function loadMindmapSlideImage(itemId?: string) {
  const cacheValue = loadMindmapSlideImageFromCache(itemId)
  try {
    const record = await fetchSlideDeckRecord(itemId)
    const remoteValue = await resolveMindmapImageFromRecord(record, itemId)
    if (remoteValue) {
      return remoteValue
    }
    return cacheValue
  } catch {
    return cacheValue
  }
}

export async function saveMindmapSlideImage(dataUrl: string, itemId?: string): Promise<SyncResult> {
  const safeDataUrl = String(dataUrl || '').trim()
  if (!safeDataUrl) return { status: 'cache', message: null, savedAt: null }
  saveMindmapSlideImageToCache(safeDataUrl, itemId)
  const savedAt = new Date().toISOString()
  try {
    const storagePath = await uploadMindmapImageToStorage(safeDataUrl, itemId)
    if (storagePath) {
      const publicUrl = getMindmapPublicUrl(storagePath)
      if (publicUrl) {
        saveMindmapSlideImageToCache(publicUrl, itemId)
      }
      await upsertSlideDeckRecord(itemId, {
        mindmap_image_path: storagePath,
        mindmap_image: null,
      })
      return { status: 'cloud', message: null, savedAt }
    }

    await upsertSlideDeckRecord(itemId, { mindmap_image: safeDataUrl })
    return {
      status: 'cache',
      message: 'Ảnh mindmap chưa upload được lên Storage, đang tạm giữ bản cache cục bộ.',
      savedAt,
    }
  } catch {
    // keep local cache as fallback
    return {
      status: 'cache',
      message: 'Không thể đồng bộ ảnh mindmap lên Supabase Storage. Đang giữ bản cache cục bộ.',
      savedAt,
    }
  }
}