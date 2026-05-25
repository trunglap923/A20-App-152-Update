'use client'

import { Play, Youtube } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

interface VideoPlayerProps {
  type: 'video' | 'youtube' | 'audio' | 'pdf'
  url: string
  activeQuote?: { keyword: string, quote: string, media_timestamp?: string | null } | null
}

// Convert "MM:SS" or "HH:MM:SS" or "SS" to seconds
function parseTimestampToSeconds(timestamp: string): number {
  if (!timestamp) return 0;
  
  // Clean up timestamp (sometimes AI adds spaces or extra chars)
  const cleanTs = timestamp.replace(/[^0-9:]/g, '');
  const parts = cleanTs.split(':').map(Number);
  
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // SS
    return parts[0];
  }
  return 0;
}

export function VideoPlayer({ type, url, activeQuote }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [youtubeStart, setYoutubeStart] = useState<number>(0)

  // Listen to activeQuote changes to seek
  useEffect(() => {
    if (activeQuote && activeQuote.media_timestamp) {
      const seconds = parseTimestampToSeconds(activeQuote.media_timestamp);
      
      if (type === 'video' && videoRef.current) {
        videoRef.current.currentTime = seconds;
        videoRef.current.play().catch(e => console.log("Auto-play prevented", e));
      } else if (type === 'audio' && audioRef.current) {
        audioRef.current.currentTime = seconds;
        audioRef.current.play().catch(e => console.log("Auto-play prevented", e));
      } else if (type === 'youtube') {
        setYoutubeStart(seconds);
      }
    }
  }, [activeQuote, type]);

  if (type === 'pdf') return null
  if (!url) return null

  const isYoutube = type === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : null
  }

  if (isYoutube) {
    const videoId = getYoutubeId(url)
    if (!videoId) return null

    // For YouTube, we append start param and use a key to force re-render iframe if start changes
    const youtubeUrl = `https://www.youtube.com/embed/${videoId}?start=${youtubeStart}&autoplay=${youtubeStart > 0 ? 1 : 0}`

    return (
      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-black shadow-lg">
        <div className="aspect-video w-full">
          <iframe
            key={youtubeStart} // Force reload iframe when timestamp changes
            src={youtubeUrl}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="flex items-center gap-2 bg-card px-4 py-2 text-xs text-muted-foreground">
          <Youtube className="h-3 w-3" />
          <span>YouTube Video (Mốc: {youtubeStart}s)</span>
        </div>
      </div>
    )
  }

  if (type === 'audio') {
    return (
      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Play className="h-4 w-4 text-primary" />
          <span>Bản ghi âm / File âm thanh</span>
        </div>
        <audio ref={audioRef} src={url} controls className="w-full" />
      </div>
    )
  }

  // Local Video
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-black shadow-lg">
      <div className="aspect-video w-full">
        <video ref={videoRef} src={url} controls className="h-full w-full" />
      </div>
      <div className="flex items-center gap-2 bg-card px-4 py-2 text-xs text-muted-foreground">
        <Play className="h-3 w-3" />
        <span>Video Uploaded</span>
      </div>
    </div>
  )
}
