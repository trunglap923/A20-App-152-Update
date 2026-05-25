import { useState, useRef, useEffect } from 'react'
import { AudioLines, Bot, Mic, MicOff, Send, X, ChevronLeft, Compass, MessageSquare, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkdownContent } from '@/components/ui/markdown-content'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { 
    chatWithAi, 
    fetchChatHistory, 
    synthesizeChatSpeech, 
    getAuthHeaders, 
    getAiHeaders 
} from '@/lib/api'
import { API_BASE_URL } from '@/lib/env'

type Message = {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    sources?: string[]
}

type Chat = {
    id: string
    title: string
    messages: Message[]
    updatedAt: Date
}

type SpeechRecognitionLike = {
    lang: string
    continuous: boolean
    interimResults: boolean
    onstart?: (() => void) | null
    onsoundstart?: (() => void) | null
    onspeechstart?: (() => void) | null
    onspeechend?: (() => void) | null
    onnomatch?: (() => void) | null
    onresult: ((event: any) => void) | null
    onerror: ((event: any) => void) | null
    onend: (() => void) | null
    start: () => void
    stop: () => void
}

type ListeningMode = 'manual' | 'conversation' | null

/** Giọng tự động + bốn preset vùng; hoặc voiceURI của giọng Việt trên thiết bị */
const TTS_KNOWN_PRESETS = new Set([
    'preset:nu_mien_bac',
    'preset:nu_mien_nam',
    'preset:nm_mien_bac',
    'preset:nm_mien_nam',
])

const TTS_PRESET_LABELS: Record<string, string> = {
    auto: 'Giọng tự động',
    'preset:nu_mien_bac': 'Nữ miền Bắc',
    'preset:nu_mien_nam': 'Nữ miền Nam',
    'preset:nm_mien_bac': 'Nam miền Bắc',
    'preset:nm_mien_nam': 'Nam miền Nam',
    'azure:vi-VN-HoaiMyNeural': 'Azure HoaiMy Neural',
    'azure:vi-VN-NamMinhNeural': 'Azure NamMinh Neural',
}

const AZURE_TTS_VOICE_OPTIONS = [
    { value: 'azure:vi-VN-HoaiMyNeural', label: 'Azure HoaiMy Neural' },
    { value: 'azure:vi-VN-NamMinhNeural', label: 'Azure NamMinh Neural' },
]

const isAzureBackedTtsSelection = (selection: string) =>
    selection === 'auto' || selection.startsWith('preset:') || selection.startsWith('azure:')

const VOICE_CHAT_GREETING = 'Chào bạn, mình đang ở đây để lắng nghe và hỗ trợ bạn. Bạn muốn bắt đầu từ đâu nhỉ?'

export function ChatTab({ itemId }: { itemId?: string }) {

    /** auto | preset:... | voiceURI (SpeechSynthesis) */
    const TTS_VOICE_STORAGE_KEY = 'chat_tts_voice_selection'

    /** Giọng cũ (trước khi có 4 preset) → map sang mới để không bị fallback auto */
    const LEGACY_PRESET_MAP: Record<string, string> = {
        'preset:female': 'preset:nu_mien_nam',
        'preset:male': 'preset:nm_mien_bac',
        'preset:south': 'preset:nu_mien_nam',
        'preset:north': 'preset:nm_mien_bac',
    }

    const [chats, setChats] = useState<Chat[]>([
        {
            id: '1',
            title: 'Cuộc trò chuyện mới',
            messages: [],
            updatedAt: new Date(),
        },
    ])
    const [activeChatId, setActiveChatId] = useState('1')
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [isAISpeaking, setIsAISpeaking] = useState(false)
    const [isSpeechSupported, setIsSpeechSupported] = useState(false)
    const [isVoiceConversationOpen, setIsVoiceConversationOpen] = useState(false)
    const [isVoiceConversationActive, setIsVoiceConversationActive] = useState(false)
    const isVoiceConversationActiveRef = useRef(false)
    const [voiceConversationStatus, setVoiceConversationStatus] = useState('Ready')
    const [ttsEngineMessage, setTtsEngineMessage] = useState<string | null>(null)
    const [thinkingStatus, setThinkingStatus] = useState<string | null>(null)

    useEffect(() => {
        isVoiceConversationActiveRef.current = isVoiceConversationActive
    }, [isVoiceConversationActive])

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
    const baseInputBeforeSpeechRef = useRef('')
    const speechFinalTranscriptRef = useRef('')
    const speechInterimTranscriptRef = useRef('')
    const currentListeningModeRef = useRef<ListeningMode>(null)
    const lastSpokenAssistantMessageIdRef = useRef<string | null>(null)
    const isSpeechSynthesisSupportedRef = useRef(false)
    const voiceConversationPendingNextListenRef = useRef(false)
    const activeChat = chats.find((c) => c.id === activeChatId)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const requestRef = useRef<number | null>(null)
    const audioAnalyserRef = useRef<AnalyserNode | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioStreamRef = useRef<MediaStream | null>(null)
    const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const [audioVolume, setAudioVolume] = useState(0)
    const audioVolumeLogThrottleRef = useRef<number>(0)
    const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([])
    const [selectedTtsVoiceUri, setSelectedTtsVoiceUri] = useState<string>('auto')
    const selectedTtsVoiceUriRef = useRef<string>('auto')
    const ttsSpeakTimeoutRef = useRef<number | null>(null)
    const activeAudioRef = useRef<HTMLAudioElement | null>(null)
    const activeAudioObjectUrlRef = useRef<string | null>(null)
    const ttsAudioCacheRef = useRef<Map<string, Blob>>(new Map())
    const ttsAudioPendingRef = useRef<Map<string, Promise<Blob>>>(new Map())
    const lastTtsPlainTextRef = useRef<string | null>(null)
    
    // --- SPEECH QUEUE SYSTEM ---
    const speechQueueRef = useRef<string[]>([])
    const isProcessingQueueRef = useRef(false)
    const lastProcessedIndexRef = useRef(0)
    const currentAssistantMessageIdRef = useRef<string | null>(null)

    useEffect(() => {
        selectedTtsVoiceUriRef.current = selectedTtsVoiceUri
    }, [selectedTtsVoiceUri])

    /**
     * Preset → rate/pitch. Khi máy chỉ có 1 giọng vi, engine vẫn là Microsoft An nhưng
     * phải tách bạch bằng prosody mạnh (Edge thường vẫn áp dụng được).
     */
    const getVoiceProsodyForSelection = (
        sel: string,
        opts: { singleViEngine: boolean }
    ): { rate: number; pitch: number } => {
        const { singleViEngine } = opts
        if (singleViEngine && sel.startsWith('preset:')) {
            switch (sel) {
                case 'preset:nu_mien_bac':
                    return { rate: 0.82, pitch: 1.55 }
                case 'preset:nu_mien_nam':
                    return { rate: 1.18, pitch: 1.28 }
                case 'preset:nm_mien_bac':
                    return { rate: 0.8, pitch: 0.58 }
                case 'preset:nm_mien_nam':
                    return { rate: 1.12, pitch: 0.7 }
                default:
                    return { rate: 1.0, pitch: 1.0 }
            }
        }
        switch (sel) {
            case 'preset:nu_mien_bac':
                return { rate: 0.98, pitch: 1.22 }
            case 'preset:nu_mien_nam':
                return { rate: 1.06, pitch: 1.12 }
            case 'preset:nm_mien_bac':
                return { rate: 0.94, pitch: 0.78 }
            case 'preset:nm_mien_nam':
                return { rate: 1.02, pitch: 0.82 }
            case 'auto':
                return { rate: 1.05, pitch: 1.02 }
            default:
                return { rate: 1.02, pitch: 1.0 }
        }
    }

    const getTtsTriggerLabel = (sel: string) => {
        if (TTS_PRESET_LABELS[sel]) return TTS_PRESET_LABELS[sel]
        const v = ttsVoices.find((x) => x.voiceURI === sel)
        return v ? v.name : 'Chọn giọng nói'
    }

    const pickVoiceUriByKeywords = (voices: SpeechSynthesisVoice[], keywords: string[]) => {
        const lowerKeywords = keywords.map((k) => k.toLowerCase())
        const match = voices.find((v) => {
            const hay = `${v.name} ${v.voiceURI} ${v.lang}`.toLowerCase()
            return lowerKeywords.every((kw) => hay.includes(kw))
        })
        return match?.voiceURI
    }

    const getPreferredAutoVoiceUri = (voices: SpeechSynthesisVoice[]) => {
        const viVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('vi'))
        if (viVoices.length === 0) return undefined

        // Prefer common Vietnamese voices if present (Windows/Edge/Chrome variants)
        const candidates = [
            // Female-ish common names
            ['hoaimi'],
            ['hoaimy'],
            ['linh'],
            ['female'],
            ['nữ'],
            ['google', 'tiếng việt'],
            // Fallback: any Vietnamese
        ]

        for (const kws of candidates) {
            const uri = pickVoiceUriByKeywords(viVoices, kws)
            if (uri) return uri
        }
        return viVoices[0]?.voiceURI
    }

    const pickAnyDifferentVoiceUri = (voices: SpeechSynthesisVoice[], excludedUri?: string) => {
        if (!voices.length) return undefined
        const found = voices.find((v) => v.voiceURI !== excludedUri)
        return found?.voiceURI
    }

    const isSouthernFemaleHints = (v: SpeechSynthesisVoice) => {
        const s = `${v.name} ${v.voiceURI}`.toLowerCase()
        return s.includes('hoaimi') || s.includes('hoaimy') || s.includes('loan')
    }

    const isNorthernMaleHints = (v: SpeechSynthesisVoice) => {
        const s = `${v.name} ${v.voiceURI}`.toLowerCase()
        return s.includes('namminh')
    }

    const isMaleHints = (v: SpeechSynthesisVoice) => {
        const s = `${v.name} ${v.voiceURI}`.toLowerCase()
        return isNorthernMaleHints(v) || /\bmale\b/.test(s) || s.includes('-male')
    }

    const resolvePresetToVoiceUri = (preset: string, voices: SpeechSynthesisVoice[]) => {
        const viVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('vi'))
        const autoUri = getPreferredAutoVoiceUri(voices)
        if (viVoices.length === 0) return undefined

        // Theo thứ tự ưu tiên tên thường gặp (Windows Edge): HoaiMi ≈ nam nữ miền Nam; NamMinh ≈ nam miền Bắc
        const maps: Record<string, string[][]> = {
            'preset:nu_mien_nam': [['hoaimi'], ['hoaimy'], ['loan']],
            // Không dùng "my" — dễ trùng substring trong HoaiMi; không dùng "minh" một mình — dễ trùng NamMinh
            'preset:nu_mien_bac': [['linh'], ['loan'], ['chi'], ['hoa'], ['thùy'], ['lan'], ['mai']],
            'preset:nm_mien_bac': [['namminh']],
            'preset:nm_mien_nam': [['nam '], ['nam-'], ['huy'], ['duy'], ['khoa'], ['phuc']],
        }

        let tries = maps[preset] ?? []

        // Nữ miền Bắc: tìm trong giọng vi không có dấu hiệu nữ miền Nam
        if (preset === 'preset:nu_mien_bac') {
            for (const kws of tries) {
                const uri = pickVoiceUriByKeywords(viVoices, kws)
                if (uri) {
                    const v = viVoices.find((x) => x.voiceURI === uri)!
                    if (!isSouthernFemaleHints(v) && !isNorthernMaleHints(v)) return uri
                }
            }
            const candidates = viVoices.filter((v) => !isSouthernFemaleHints(v) && !isMaleHints(v))
            if (candidates.length) return candidates[0].voiceURI
            return pickAnyDifferentVoiceUri(viVoices, autoUri) ?? viVoices[0]?.voiceURI
        }

        // Nam miền Nam: ưu tiên giọng nam không phải NamMinh
        if (preset === 'preset:nm_mien_nam') {
            const maleNotNorth = viVoices.filter((v) => isMaleHints(v) && !isNorthernMaleHints(v))
            const first = maleNotNorth[0]
            if (first) return first.voiceURI

            const withoutNorth = viVoices.filter((v) => !isNorthernMaleHints(v))
            const second = withoutNorth.find((v) => isMaleHints(v))
            if (second) return second.voiceURI

            for (const kws of tries) {
                const uri = pickVoiceUriByKeywords(viVoices, kws)
                if (uri) return uri
            }
            return pickAnyDifferentVoiceUri(viVoices, autoUri) ?? viVoices[0]?.voiceURI
        }

        const targetVoices = viVoices
        for (const kws of tries) {
            const uri = pickVoiceUriByKeywords(targetVoices, kws)
            if (uri) return uri
        }
        return pickAnyDifferentVoiceUri(targetVoices, autoUri) ?? targetVoices[0]?.voiceURI
    }

    const getLatestTtsVoices = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [] as SpeechSynthesisVoice[]
        const voices = window.speechSynthesis.getVoices() || []
        if (voices.length > 0) {
            setTtsVoices((prev) => {
                const prevUris = prev.map((voice) => voice.voiceURI).join('|')
                const nextUris = voices.map((voice) => voice.voiceURI).join('|')
                return prevUris === nextUris ? prev : voices
            })
        }
        return voices
    }

    const resolveSelectedVoice = (selection: string, voices: SpeechSynthesisVoice[]) => {
        const viVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('vi'))
        const singleViEngine = viVoices.length <= 1

        let effectiveUri: string | undefined
        if (selection === 'auto') {
            effectiveUri = getPreferredAutoVoiceUri(voices)
        } else if (selection.startsWith('preset:')) {
            effectiveUri = resolvePresetToVoiceUri(selection, voices)
        } else {
            effectiveUri = selection
        }

        let selectedVoice: SpeechSynthesisVoice | undefined
        if (effectiveUri) {
            selectedVoice = voices.find((v) => v.voiceURI === effectiveUri)
        }
        if (!selectedVoice && viVoices.length > 0) {
            selectedVoice = viVoices[0]
        }

        return {
            effectiveUri,
            selectedVoice,
            singleViEngine,
        }
    }

    const initAudioStream = async () => {
        if (audioContextRef.current && audioStreamRef.current) return true
        try {
            console.log("🎤 Requesting Microphone access...")
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            audioStreamRef.current = stream

            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
            const audioCtx = new AudioCtx()
            audioContextRef.current = audioCtx

            const analyser = audioCtx.createAnalyser()
            analyser.fftSize = 256
            const source = audioCtx.createMediaStreamSource(stream)
            source.connect(analyser)
            audioAnalyserRef.current = analyser

            if (audioCtx.state === 'suspended') {
                await audioCtx.resume()
            }
            console.log("✅ Audio initialized successfully. State:", audioCtx.state)
            return true
        } catch (err) {
            console.error("❌ Audio analysis init failed:", err)
            setVoiceConversationStatus("Không thể truy cập Microphone")
            return false
        }
    }

    useEffect(() => {
        if (!isVoiceConversationOpen) {
            if (requestRef.current) cancelAnimationFrame(requestRef.current)
            if (audioContextRef.current) {
                audioContextRef.current.close()
                audioContextRef.current = null
            }
            if (audioStreamRef.current) {
                audioStreamRef.current.getTracks().forEach(track => track.stop())
                audioStreamRef.current = null
            }
            return
        }

        const canvas = document.getElementById('voice-sphere-canvas') as HTMLCanvasElement
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const particles: { x: number; y: number; z: number; size: number; opacity: number; type: 'sphere' | 'ambient'; vx?: number; vy?: number; vz?: number }[] = []
        const particleCount = 20000
        const ambientCount = 2000
        const radius = 180

        // Fibonacci Sphere particles (10,000)
        for (let i = 0; i < particleCount; i++) {
            const y = 1 - (i / (particleCount - 1)) * 2
            const radiusAtY = Math.sqrt(1 - y * y)
            const theta = Math.PI * (1 + Math.sqrt(5)) * i

            // Add jitter to radius for "Image 1" look (thick and messy)
            const jitterRadius = radius + (Math.random() - 0.5) * 40

            particles.push({
                x: Math.cos(theta) * radiusAtY * jitterRadius,
                y: y * jitterRadius,
                z: Math.sin(theta) * radiusAtY * jitterRadius,
                size: 0.6 + Math.random() * 1.5,
                opacity: 0.15 + Math.random() * 0.45,
                type: 'sphere'
            })
        }

        // Ambient particles (500) - flying randomly
        for (let i = 0; i < ambientCount; i++) {
            particles.push({
                x: (Math.random() - 0.5) * 600,
                y: (Math.random() - 0.5) * 600,
                z: (Math.random() - 0.5) * 600,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                vz: (Math.random() - 0.5) * 0.5,
                size: 1 + Math.random() * 2,
                opacity: 0.2 + Math.random() * 0.4,
                type: 'ambient'
            })
        }

        let rotationY = 0
        let rotationX = 0
        let vortexProgress = 0
        let audioScale = 1

        const dataArray = new Uint8Array(audioAnalyserRef.current?.frequencyBinCount || 128)

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            const centerX = canvas.width / 2
            const centerY = canvas.height / 2

            // Get Real-time Audio Data
            if (audioAnalyserRef.current) {
                audioAnalyserRef.current.getByteFrequencyData(dataArray)
                let sum = 0
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i]
                }
                const average = sum / dataArray.length
                setAudioVolume(average)

                // Log volume periodically for diagnostics
                const now = Date.now()
                if (now - audioVolumeLogThrottleRef.current > 2000) {
                    console.log(`🎤 Current Mic Volume: ${average.toFixed(2)} (isListening: ${isListening})`)
                    audioVolumeLogThrottleRef.current = now
                }

                // Map volume (0-255) to scale (1.0 - 1.8)
                const targetAudioScale = 1 + (average / 255) * 0.8
                audioScale += (targetAudioScale - audioScale) * 0.3 // Faster response for speech
            } else if (isAISpeaking) {
                // Simulating a pulse for AI speaking
                const simulatedPulse = 1 + Math.sin(Date.now() * 0.01) * 0.15
                audioScale += (simulatedPulse - audioScale) * 0.1
            } else {
                audioScale += (1 - audioScale) * 0.1
            }

            // Speed up and add "vortex" effect when listening (Increased speed)
            const targetSpeed = isListening ? 0.04 : 0.008
            rotationY += targetSpeed

            if (isListening) {
                vortexProgress = Math.min(1, vortexProgress + 0.02)
                rotationX += 0.015
            } else {
                vortexProgress = Math.max(0.3, vortexProgress - 0.01) // Maintain at least 0.3 for jitter look
                rotationX += 0.002 // Add a tiny bit of X rotation even when not listening
            }

            ctx.fillStyle = isListening ? '#60a5fa' : '#3b82f6'

            const cosY = Math.cos(rotationY)
            const sinY = Math.sin(rotationY)
            const cosX = Math.cos(rotationX)
            const sinX = Math.sin(rotationX)

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i]

                let x, y, z;

                if (p.type === 'sphere') {
                    // Sphere logic: always has some vortex noise for the "Image 1" messy look
                    const radiusModifier = audioScale * (1 + (Math.sin(i * 0.1 + rotationY * 3) * 0.08 * vortexProgress))
                    x = p.x * radiusModifier
                    y = p.y * radiusModifier
                    z = p.z * radiusModifier
                } else {
                    // Ambient logic: update position based on velocity (Slowed down)
                    p.x += (p.vx || 0) * (isListening ? 1.2 : 0.6)
                    p.y += (p.vy || 0) * (isListening ? 1.2 : 0.6)
                    p.z += (p.vz || 0) * (isListening ? 1.2 : 0.6)

                    // Wrap around canvas bounds
                    if (Math.abs(p.x) > 400) p.x *= -0.95
                    if (Math.abs(p.y) > 400) p.y *= -0.95
                    if (Math.abs(p.z) > 400) p.z *= -0.95

                    x = p.x
                    y = p.y
                    z = p.z
                }

                // Common Rotation logic
                let tx = x * cosY - z * sinY
                let tz = x * sinY + z * cosY
                let ty = y * cosX - tz * sinX
                tz = y * sinX + tz * cosX

                // Perspective projection
                const perspective = 600 / (600 + tz)
                const px = centerX + tx * perspective
                const py = centerY + ty * perspective

                if (px < 0 || px > canvas.width || py < 0 || py > canvas.height) continue

                const finalOpacity = p.opacity * perspective * (isListening ? 1.4 : 1)
                ctx.globalAlpha = Math.max(0, Math.min(1, finalOpacity))

                const s = p.size * perspective * (isListening && p.type === 'sphere' ? 1.5 : 1)
                ctx.fillRect(px - s / 2, py - s / 2, s, s)
            }

            requestRef.current = requestAnimationFrame(animate)
        }

        requestRef.current = requestAnimationFrame(animate)
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current)
        }
    }, [isVoiceConversationOpen, isListening])

    const isVoiceEngaged = isListening || isAISpeaking || isLoading

    const clearActiveAudioPlayback = () => {
        const currentAudio = activeAudioRef.current
        if (currentAudio) {
            currentAudio.pause()
            currentAudio.onended = null
            currentAudio.onerror = null
            currentAudio.src = ''
        }
        activeAudioRef.current = null

        const currentUrl = activeAudioObjectUrlRef.current
        if (currentUrl) {
            URL.revokeObjectURL(currentUrl)
        }
        activeAudioObjectUrlRef.current = null
    }

    const handleAiSpeechFinished = () => {
        setIsAISpeaking(false)
        clearActiveAudioPlayback()
        // Listening restart is now handled by processSpeechQueue when the queue is fully drained
    }

    const stopAISpeaking = () => {
        if (typeof window === 'undefined') return
        if (ttsSpeakTimeoutRef.current) {
            window.clearTimeout(ttsSpeakTimeoutRef.current)
            ttsSpeakTimeoutRef.current = null
        }
        clearActiveAudioPlayback()
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel()
        }
        setIsAISpeaking(false)
        isProcessingQueueRef.current = false
        speechQueueRef.current = []
    }

    const processSpeechQueue = async () => {
        if (isProcessingQueueRef.current || speechQueueRef.current.length === 0) return
        
        isProcessingQueueRef.current = true
        while (speechQueueRef.current.length > 0) {
            const nextSentence = speechQueueRef.current.shift()
            if (nextSentence) {
                console.log("🔊 Processing sentence from queue:", nextSentence.slice(0, 30) + "...");
                try {
                    await new Promise<void>((resolve) => {
                        const timeout = setTimeout(() => {
                            console.warn("⚠️ Speech timeout for sentence:", nextSentence.slice(0, 30));
                            resolve();
                        }, 15000); // 15s safety timeout
                        
                        const onEnd = () => {
                            clearTimeout(timeout);
                            resolve();
                        };
                        speakAIText(nextSentence, onEnd);
                    });
                } catch (err) {
                    console.error("❌ Error playing sentence from queue:", err);
                }
            }
        }
        isProcessingQueueRef.current = false

        // Khi hàng đợi đã trống, kiểm tra xem có cần bật lại Mic không (User Turn)
        // Chúng ta cần đảm bảo là việc streaming văn bản cũng đã kết thúc (handled by voiceConversationPendingNextListenRef)
        if (isVoiceConversationActiveRef.current && voiceConversationPendingNextListenRef.current) {
            voiceConversationPendingNextListenRef.current = false
            console.log("🎤 Final sentence spoken, auto-restarting listening...")
            setTimeout(() => {
                if (isVoiceConversationActiveRef.current && !isAISpeaking && speechQueueRef.current.length === 0) {
                    startSpeechListening('conversation')
                }
            }, 500)
        }
    }

    const toPlainSpeechText = (raw: string) => {
        return raw
            .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
            .replace(/#+\s/g, '')
            .replace(/\s+/g, ' ')
            .trim()
    }

    const getTtsCacheKey = (plainText: string, selection: string) => `${selection}::${plainText}`

    const getOrCreateTtsAudio = async (plainText: string, selection: string) => {
        const cacheKey = getTtsCacheKey(plainText, selection)
        const cached = ttsAudioCacheRef.current.get(cacheKey)
        if (cached) return cached

        const pending = ttsAudioPendingRef.current.get(cacheKey)
        if (pending) return pending

        const requestPromise = synthesizeChatSpeech(plainText, selection, itemId)
            .then((blob) => {
                ttsAudioCacheRef.current.set(cacheKey, blob)
                if (ttsAudioCacheRef.current.size > 6) {
                    const oldestKey = ttsAudioCacheRef.current.keys().next().value
                    if (oldestKey) {
                        ttsAudioCacheRef.current.delete(oldestKey)
                    }
                }
                return blob
            })
            .finally(() => {
                ttsAudioPendingRef.current.delete(cacheKey)
            })

        ttsAudioPendingRef.current.set(cacheKey, requestPromise)
        return requestPromise
    }

    useEffect(() => {
        if (!isVoiceConversationOpen || !itemId) return
        const selection = selectedTtsVoiceUriRef.current
        if (!isAzureBackedTtsSelection(selection)) return
        const greetingText = toPlainSpeechText(VOICE_CHAT_GREETING)
        if (!greetingText) return
        void getOrCreateTtsAudio(greetingText, selection).catch((error) => {
            console.warn('⚠️ Không thể prefetch audio câu chào:', error)
        })
    }, [isVoiceConversationOpen, selectedTtsVoiceUri, itemId])

    const speakAIText = (text: string, onFinished?: () => void) => {
        if (typeof window === 'undefined') return
        const plainText = toPlainSpeechText(text)
        if (!plainText) {
            onFinished?.()
            return
        }

        if (ttsSpeakTimeoutRef.current) {
            window.clearTimeout(ttsSpeakTimeoutRef.current)
            ttsSpeakTimeoutRef.current = null
        }

        const selection = selectedTtsVoiceUriRef.current
        const mustUseAzureTts = isAzureBackedTtsSelection(selection)
        console.log('🔊 speakAIText called with selection:', selection, 'text chunk:', plainText.slice(0, 30) + "...")
        setTtsEngineMessage(mustUseAzureTts ? 'Đang chuẩn bị giọng AI...' : 'Đang dùng giọng trên thiết bị.')

        const synthesis = window.speechSynthesis
        // synthesis.cancel() // Don't cancel here as we might be in a queue
        clearActiveAudioPlayback()
        lastTtsPlainTextRef.current = plainText

        const runBrowserFallback = (voices: SpeechSynthesisVoice[]) => {
            if (!isSpeechSynthesisSupportedRef.current) return
            const utterance = new SpeechSynthesisUtterance(plainText)
            const { effectiveUri, selectedVoice, singleViEngine } = resolveSelectedVoice(selection, voices)

            console.log('🔊 Available voices:', voices.length, 'total, Vietnamese:', voices.filter(v => v.lang?.toLowerCase().startsWith('vi')).length)
            console.log('🔊 Effective URI:', effectiveUri)
            console.log('🔊 Final selected voice:', selectedVoice?.name, selectedVoice?.voiceURI, selectedVoice?.lang)

            utterance.lang = selectedVoice?.lang || 'vi-VN'
            if (selectedVoice) {
                utterance.voice = selectedVoice
                console.log('✅ Voice set successfully:', selectedVoice.name)
            }

            const prosody = selection.startsWith('preset:')
                ? getVoiceProsodyForSelection(selection, { singleViEngine })
                : selection === 'auto'
                    ? getVoiceProsodyForSelection('auto', { singleViEngine })
                    : { rate: 1.02, pitch: 1.0 }

            utterance.rate = prosody.rate
            utterance.pitch = prosody.pitch

            console.log('🔊 TTS final config:', {
                selected: selection,
                effectiveUri,
                voiceName: selectedVoice?.name,
                voiceURI: selectedVoice?.voiceURI,
                voiceLang: selectedVoice?.lang,
                utteranceVoiceSet: !!utterance.voice,
                utteranceLang: utterance.lang,
                rate: utterance.rate,
                pitch: utterance.pitch,
            })

            setIsAISpeaking(true)

            utterance.onstart = () => {
                console.log('🎤 Utterance started with voice:', selectedVoice?.name || utterance.lang)
                setTtsEngineMessage(`Đang đọc với giọng: ${selectedVoice?.name || 'Thiết bị của bạn'}`)
                setIsAISpeaking(true)
            }
            utterance.onend = () => {
                console.log("🔊 AI finished speaking (chunk)")
                ttsSpeakTimeoutRef.current = null
                handleAiSpeechFinished()
                onFinished?.()
            }
            utterance.onerror = (event: any) => {
                if (event.error === 'interrupted' || event.error === 'canceled') {
                    console.log(`🔊 AI speech ${event.error}`)
                } else {
                    console.error("🔊 AI speech error:", event.error, event)
                }
                ttsSpeakTimeoutRef.current = null
                setIsAISpeaking(false)
            }

            // Đợi một nhịp sau cancel để engine áp đúng voice thay vì rơi về mặc định.
            ttsSpeakTimeoutRef.current = window.setTimeout(() => {
                synthesis.cancel()
                synthesis.speak(utterance)
                synthesis.resume?.()
            }, 80)
        }

        void (async () => {
            try {
                const audioBlob = mustUseAzureTts
                    ? await getOrCreateTtsAudio(plainText, selection)
                    : await synthesizeChatSpeech(plainText, selection, itemId)
                const objectUrl = URL.createObjectURL(audioBlob)
                const audio = new Audio(objectUrl)
                audio.preload = 'auto'
                audio.load()

                activeAudioRef.current = audio
                activeAudioObjectUrlRef.current = objectUrl
                setTtsEngineMessage('Đã kết nối giọng AI.')
                setIsAISpeaking(true)

                audio.onended = () => {
                    console.log('🔊 Azure TTS finished speaking (chunk)')
                    handleAiSpeechFinished()
                    onFinished?.()
                }
                audio.onerror = (event) => {
                    console.error('🔊 Azure TTS playback error:', event)
                    setIsAISpeaking(false)
                    clearActiveAudioPlayback()
                    setTtsEngineMessage('Không phát được giọng AI.')
                    if (mustUseAzureTts) {
                        setVoiceConversationStatus('Không phát được giọng AI')
                        return
                    }
                    const latestVoices = getLatestTtsVoices()
                    if (latestVoices.length > 0) {
                        runBrowserFallback(latestVoices)
                    }
                }

                await audio.play()
                console.log('✅ Azure TTS audio started')
            } catch (error) {
                console.warn('⚠️ Azure TTS failed, fallback to browser TTS:', error)
                const message = error instanceof Error ? error.message : 'Giọng AI hiện chưa sẵn sàng.'
                setTtsEngineMessage(message)
                if (mustUseAzureTts) {
                    setVoiceConversationStatus(message)
                    setIsAISpeaking(false)
                    return
                }
                const latestVoices = getLatestTtsVoices()
                if (latestVoices.length > 0) {
                    runBrowserFallback(latestVoices)
                    return
                }

                ttsSpeakTimeoutRef.current = window.setTimeout(() => {
                    ttsSpeakTimeoutRef.current = null
                    runBrowserFallback(getLatestTtsVoices())
                }, 180)
            }
        })()
    }

    /** Đổi giọng → áp dụng luôn; nếu AI đang đọc thì huỷ và đọc lại ngay */
    const handleTtsVoiceChange = (next: string) => {
        selectedTtsVoiceUriRef.current = next
        setSelectedTtsVoiceUri(next)
        if (typeof window === 'undefined') return
        const txt = lastTtsPlainTextRef.current
        const wasSpeaking = ((('speechSynthesis' in window) && window.speechSynthesis.speaking) || !!activeAudioRef.current) && Boolean(txt?.trim?.())
        stopAISpeaking()
        if (wasSpeaking && txt?.trim?.()) queueMicrotask(() => speakAIText(txt))
    }

    useEffect(() => {
        if (typeof window === 'undefined') return
        const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        setIsSpeechSupported(Boolean(Ctor))
        isSpeechSynthesisSupportedRef.current = 'speechSynthesis' in window
    }, [])

    // Load & keep updated TTS voice list, and restore saved selection.
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (!('speechSynthesis' in window)) return

        const restore = () => {
            try {
                let saved = window.localStorage.getItem(TTS_VOICE_STORAGE_KEY)
                if (!saved) saved = window.localStorage.getItem('chat_tts_voice_uri')

                if (saved) {
                    const mapped =
                        LEGACY_PRESET_MAP[saved] ??
                        saved
                    if (mapped.startsWith('preset:') && !TTS_KNOWN_PRESETS.has(mapped)) {
                        setSelectedTtsVoiceUri('auto')
                    } else if (mapped.startsWith('azure:')) {
                        setSelectedTtsVoiceUri(mapped)
                    } else {
                        setSelectedTtsVoiceUri(mapped)
                    }
                }
            } catch { }
        }

        const refreshVoices = () => {
            const voices = window.speechSynthesis.getVoices() || []
            setTtsVoices(voices)

            // If currently selected voice doesn't exist anymore, fall back to auto.
            setSelectedTtsVoiceUri((prev) => {
                if (prev === 'auto') return prev
                if (prev.startsWith('azure:')) return prev
                if (prev.startsWith('preset:') && !TTS_KNOWN_PRESETS.has(prev)) {
                    return 'auto'
                }
                if (prev.startsWith('preset:')) return prev
                if (voices.some((v) => v.voiceURI === prev)) return prev
                try { window.localStorage.removeItem(TTS_VOICE_STORAGE_KEY) } catch { }
                try { window.localStorage.removeItem('chat_tts_voice_uri') } catch { }
                return 'auto'
            })
        }

        restore()
        refreshVoices()

        const onVoicesChanged = () => refreshVoices()
        window.speechSynthesis.addEventListener?.('voiceschanged', onVoicesChanged as any)
        // Some browsers use onvoiceschanged rather than addEventListener.
        ; (window.speechSynthesis as any).onvoiceschanged = onVoicesChanged

        return () => {
            window.speechSynthesis.removeEventListener?.('voiceschanged', onVoicesChanged as any)
            if ((window.speechSynthesis as any).onvoiceschanged === onVoicesChanged) {
                ; (window.speechSynthesis as any).onvoiceschanged = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, selectedTtsVoiceUri)
            try {
                window.localStorage.removeItem('chat_tts_voice_uri')
            } catch { }
        } catch { }
    }, [selectedTtsVoiceUri])

    useEffect(() => {
        return () => {
            speechRecognitionRef.current?.stop()
            speechRecognitionRef.current = null
            stopAISpeaking()
        }
    }, [])

    // Auto scroll xuống tin nhắn mới
    useEffect(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 150)
    }, [activeChat?.messages?.length, isLoading])

    // Load lịch sử từ backend theo item hiện tại.
    useEffect(() => {
        const loadHistory = async () => {
            if (!itemId) {
                setChats((prev) =>
                    prev.map((chat) =>
                        chat.id === activeChatId
                            ? { ...chat, messages: [], updatedAt: new Date() }
                            : chat
                    )
                )
                return
            }

            try {
                const history = await fetchChatHistory(itemId)
                const messages: Message[] = history.map((m) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    timestamp: new Date(m.created_at),
                    sources: m.sources,
                }))
                const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
                lastSpokenAssistantMessageIdRef.current = lastAssistant?.id ?? null
                setChats((prev) =>
                    prev.map((chat) =>
                        chat.id === activeChatId
                            ? {
                                ...chat,
                                messages,
                                updatedAt: new Date(),
                                title: messages.length > 0 ? messages[0].content.slice(0, 40) : chat.title,
                            }
                            : chat
                    )
                )
            } catch (error) {
                console.error('Không thể tải lịch sử chat:', error)
            }
        }

        void loadHistory()
    }, [itemId, activeChatId])

    // Remove the early-triggering useEffect for speech as we now handle it in the streaming loop

    const sendMessage = async (messageOverride?: string) => {
        if (!itemId || !activeChat || isLoading) return
        const normalizedInput = (messageOverride ?? input).trim()
        if (!normalizedInput) return false

        const currentInput = normalizedInput
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: currentInput,
            timestamp: new Date(),
        }

        // 1. Thêm tin nhắn user vào UI ngay lập tức
        setChats((prev) =>
            prev.map((chat) =>
                chat.id === activeChatId
                    ? {
                        ...chat,
                        messages: [...chat.messages, userMessage],
                        updatedAt: new Date(),
                        title: chat.messages.length === 0 ? currentInput.slice(0, 40) : chat.title
                    }
                    : chat
            )
        )

        setInput('')
        setIsLoading(true)
        stopAISpeaking()

        try {
            // 2. Lấy history (trừ tin nhắn vừa thêm)
            const history = activeChat.messages.map(m => ({
                role: m.role,
                content: m.content
            }))

            // 3. Gọi API Chat RAG (Streaming SSE)
            const headers = await getAuthHeaders();
            const aiHeaders = await getAiHeaders();
            
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                    ...aiHeaders
                },
                body: JSON.stringify({ 
                    message: currentInput, 
                    item_id: itemId, 
                    history 
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Chat thất bại (HTTP ${response.status})`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let assistantAnswer = '';
            let assistantSources: string[] = [];
            let streamingMessageId: string | null = null;
            let currentFullContent = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                
                                if (data.status) {
                                    setThinkingStatus(data.status);
                                }

                                if (data.token) {
                                    console.log("📥 [SSE] Received token:", data.token);
                                    if (!streamingMessageId) {
                                        console.log("🆕 [SSE] Creating new assistant message placeholder");
                                        setIsLoading(false);
                                        streamingMessageId = (Date.now() + 1).toString();
                                        currentAssistantMessageIdRef.current = streamingMessageId;
                                        lastProcessedIndexRef.current = 0;
                                        speechQueueRef.current = [];
                                        
                                        setChats(prev => prev.map(chat => 
                                            chat.id === activeChatId 
                                                ? { ...chat, messages: [...chat.messages, {
                                                    id: streamingMessageId!,
                                                    role: 'assistant',
                                                    content: '',
                                                    timestamp: new Date()
                                                }]}
                                                : chat
                                        ));
                                    }

                                    currentFullContent += data.token;
                                    // Streaming text to UI
                                    setChats(prev => prev.map(chat => 
                                        chat.id === activeChatId 
                                            ? { ...chat, messages: chat.messages.map(m => 
                                                m.id === streamingMessageId ? { ...m, content: currentFullContent } : m
                                            )}
                                            : chat
                                    ));
                                }
                                
                                if (data.answer) {
                                    setIsLoading(false);
                                    assistantAnswer = data.answer;
                                    assistantSources = data.sources || [];

                                    // Real-time remaining chunk detection disabled

                                    if (!streamingMessageId) {
                                        streamingMessageId = (Date.now() + 1).toString();
                                        setChats(prev => prev.map(chat => 
                                            chat.id === activeChatId 
                                                ? { ...chat, messages: [...chat.messages, {
                                                    id: streamingMessageId!,
                                                    role: 'assistant',
                                                    content: assistantAnswer,
                                                    timestamp: new Date(),
                                                    sources: assistantSources
                                                }]}
                                                : chat
                                        ));
                                    } else {
                                        setChats(prev => prev.map(chat => 
                                            chat.id === activeChatId 
                                                ? { ...chat, messages: chat.messages.map(m => 
                                                    m.id === streamingMessageId ? { ...m, content: assistantAnswer, sources: assistantSources } : m
                                                )}
                                                : chat
                                        ));
                                    }
                                }
                                
                                if (data.error) {
                                    throw new Error(data.error);
                                }
                            } catch (e) {
                                console.warn('Lỗi parse SSE chunk:', e);
                            }
                        }
                    }
                }
            }

            // --- FINAL VOICE OUTPUT ---
            const finalSpeechText = assistantAnswer || currentFullContent;
            
            if (isVoiceConversationActiveRef.current && finalSpeechText.trim()) {
                console.log("🔊 Final answer complete, starting TTS. Length:", finalSpeechText.length);
                speakAIText(finalSpeechText, () => {
                    if (isVoiceConversationActiveRef.current) {
                        console.log("🎤 Final answer spoken, auto-restarting listening...");
                        setTimeout(() => {
                            if (isVoiceConversationActiveRef.current && !isAISpeaking) {
                                startSpeechListening('conversation')
                            }
                        }, 500)
                    }
                });
            } else if (isVoiceConversationActiveRef.current) {
                // If nothing to speak, still restart listening
                startSpeechListening('conversation');
            }

            return true;
        } catch (error: any) {
            console.error('Lỗi gửi tin nhắn:', error)
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Lỗi: ${error.message || 'Không thể kết nối tới server.'}`,
                timestamp: new Date(),
            }
            setChats((prev) =>
                prev.map((chat) =>
                    chat.id === activeChatId
                        ? {
                            ...chat,
                            messages: [...chat.messages, errorMessage],
                            updatedAt: new Date(),
                        }
                        : chat
                )
            )
        } finally {
            setIsLoading(false)
            setThinkingStatus(null)
        }
    }

    const startSpeechListening = (mode: Exclude<ListeningMode, null>) => {
        if (!isSpeechSupported || !itemId) return
        const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!Ctor) return

        if (isAISpeaking) {
            stopAISpeaking()
        }

        // Clean up previous instance before starting new one
        if (speechRecognitionRef.current) {
            try {
                speechRecognitionRef.current.onend = null // Prevent triggering recursion
                speechRecognitionRef.current.stop()
            } catch (e) { }
            speechRecognitionRef.current = null
        }

        const recognition: SpeechRecognitionLike = new Ctor()
        speechRecognitionRef.current = recognition
        currentListeningModeRef.current = mode
        baseInputBeforeSpeechRef.current = mode === 'manual' ? input.trim() : ''
        speechFinalTranscriptRef.current = ''
        speechInterimTranscriptRef.current = ''

        recognition.lang = 'vi-VN'
        recognition.continuous = false // Use false to get faster results, loop handles restart
        recognition.interimResults = true

        recognition.onstart = () => {
            console.log("🎤 Speech Recognition Started Successfully (onstart)")
            setIsListening(true)
        }

        // Diagnostic events
        recognition.onsoundstart = () => console.log("🎤 Sound detected (onsoundstart)")
        recognition.onspeechstart = () => console.log("🎤 Speech detected (onspeechstart)")
        recognition.onspeechend = () => console.log("🎤 Speech ended (onspeechend)")
        recognition.onnomatch = () => console.log("🎤 No match found (onnomatch)")

        recognition.onresult = (event: any) => {
            // Ensure isListening is true if onstart was missed or delayed
            if (!isListening) setIsListening(true)

            let finalChunk = speechFinalTranscriptRef.current
            let interimChunk = ''
            for (let i = 0; i < event.results.length; i++) {
                const transcript = String(event.results[i]?.[0]?.transcript || '').trim()
                if (!transcript) continue
                if (event.results[i].isFinal) {
                    finalChunk = `${finalChunk} ${transcript}`.trim()
                } else {
                    interimChunk = `${interimChunk} ${transcript}`.trim()
                }
            }
            speechFinalTranscriptRef.current = finalChunk
            speechInterimTranscriptRef.current = interimChunk

            const combined = baseInputBeforeSpeechRef.current
                ? `${baseInputBeforeSpeechRef.current} ${finalChunk} ${interimChunk}`.trim()
                : `${finalChunk} ${interimChunk}`.trim()

            console.log("🎤 Voice Transcript (Interim):", combined)
            setInput(combined)
            if (mode === 'conversation') {
                setVoiceConversationStatus("Tôi đang lắng nghe bạn...")

                // Silence Detection: Trigger response after 2.0 seconds of silence
                if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
                silenceTimeoutRef.current = setTimeout(() => {
                    if (currentListeningModeRef.current === 'conversation' && speechRecognitionRef.current) {
                        speechRecognitionRef.current.stop()
                    }
                }, 2000)
            }
        }

        recognition.onerror = (event: any) => {
            const errorType = String(event.error || 'unknown')
            const recoverableErrors = new Set(['network', 'no-speech', 'aborted'])
            const permissionErrors = new Set(['not-allowed', 'service-not-allowed'])

            if (recoverableErrors.has(errorType)) {
                console.log('🎤 Speech Recognition issue:', errorType)
            } else if (permissionErrors.has(errorType)) {
                console.warn('🎤 Speech Recognition blocked:', errorType)
            } else {
                console.warn('🎤 Speech Recognition error:', errorType)
            }

            // Dọn dẹp các timeout và tham chiếu hiện tại
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
            setIsListening(false)
            speechRecognitionRef.current = null
            currentListeningModeRef.current = null

            if (mode === 'conversation' && isVoiceConversationActiveRef.current) {
                switch (errorType) {
                    case 'no-speech':
                    case 'aborted':
                        // Các lỗi tạm thời, có thể restart ngay
                        console.log(`🎤 ${errorType} detected, restarting...`)
                        startSpeechListening('conversation')
                        break

                    case 'network':
                        console.log("🎤 Network issue detected, retrying in 3s...")
                        setVoiceConversationStatus('Mạng đang chập chờn. Đang thử lại...')
                        // Có thể thêm logic retryCount ở đây
                        setTimeout(() => {
                            if (isVoiceConversationActiveRef.current) {
                                startSpeechListening('conversation');
                            }
                        }, 3000);
                        break;

                    case 'not-allowed':
                    case 'service-not-allowed':
                        console.warn("🎤 Permission/Service denied");
                        setVoiceConversationStatus('Quyền truy cập Mic bị từ chối.');
                        setIsVoiceConversationActive(false);
                        break;

                    default:
                        // Các lỗi khác (audio-capture, v.v.)
                        console.warn("🎤 Recoverable speech issue:", errorType)
                        setVoiceConversationStatus('Mic đang được kết nối lại...')
                        setTimeout(() => {
                            if (isVoiceConversationActiveRef.current) {
                                startSpeechListening('conversation')
                            }
                        }, 2000)
                        break
                }
            }
        }

        recognition.onend = async () => {
            console.log("🎤 Speech Recognition Ended")
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
            setIsListening(false)

            // Use both final and interim results to ensure no text is lost
            const collectedText = `${speechFinalTranscriptRef.current} ${speechInterimTranscriptRef.current}`.trim()
            const finalCombined = baseInputBeforeSpeechRef.current
                ? `${baseInputBeforeSpeechRef.current} ${collectedText}`.trim()
                : collectedText

            console.log("✅ Final Sentence Collected:", finalCombined || "(empty)")
            setInput(finalCombined)

            const endedMode = currentListeningModeRef.current
            currentListeningModeRef.current = null

            if (endedMode === 'conversation') {
                if (!isVoiceConversationActiveRef.current) return
                if (!finalCombined) {
                    console.log("🎤 Nothing said, restarting listening loop in 500ms...")
                    setVoiceConversationStatus("Tôi đang lắng nghe bạn...")
                    setTimeout(() => {
                        if (isVoiceConversationActiveRef.current) {
                            startSpeechListening('conversation')
                        }
                    }, 500)
                    return
                }

                console.log("🚀 Sending voice message to AI:", finalCombined)
                setVoiceConversationStatus('Đang xử lý...')
                try {
                    const sent = await sendMessage(finalCombined)
                    console.log("🚀 Message sent result:", sent)
                    if (sent) {
                        voiceConversationPendingNextListenRef.current = true
                        // Listening will be restarted by speakAIText.onend
                    } else {
                        console.log("⚠️ Message failed to send, restarting listening...")
                        startSpeechListening('conversation')
                    }
                } catch (error) {
                    console.error("❌ Voice conversation error:", error)
                    setVoiceConversationStatus('Lỗi kết nối. Thử lại...')
                    setTimeout(() => {
                        if (isVoiceConversationActiveRef.current) {
                            startSpeechListening('conversation')
                        }
                    }, 2000)
                }
            }
        }

        if (mode === 'conversation') {
            setVoiceConversationStatus("Tôi đang lắng nghe bạn...")
        }

        try {
            console.log(`🎤 Calling recognition.start() [mode: ${mode}]`)
            recognition.start()
        } catch (e) {
            console.error("❌ Failed to start Speech Recognition:", e)
            setIsListening(false)
            if (mode === 'conversation') {
                setVoiceConversationStatus("Lỗi khởi động Mic")
            }
        }
    }

    const toggleSpeechToText = () => {
        if (!isSpeechSupported || !itemId || isLoading || isVoiceConversationActive) return
        if (isListening && currentListeningModeRef.current === 'manual') {
            speechRecognitionRef.current?.stop()
            return
        }
        startSpeechListening('manual')
    }

    const stopVoiceConversation = () => {
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
        voiceConversationPendingNextListenRef.current = false
        setIsVoiceConversationActive(false)
        isVoiceConversationActiveRef.current = false
        setIsVoiceConversationOpen(false)
        setVoiceConversationStatus('Ready')
        if (isListening && currentListeningModeRef.current === 'conversation') {
            speechRecognitionRef.current?.stop()
        }
        stopAISpeaking()
    }

    const toggleVoiceConversation = async () => {
        if (!itemId || isLoading) return

        // Use Ref for immediate check to prevent double-triggering during async init
        if (isVoiceConversationActiveRef.current || isVoiceConversationOpen) {
            stopVoiceConversation()
            return
        }

        setIsVoiceConversationOpen(true)
        setVoiceConversationStatus('Đang chuẩn bị cuộc trò chuyện...')

        const selection = selectedTtsVoiceUriRef.current
        const greetingText = toPlainSpeechText(VOICE_CHAT_GREETING)
        const greetingPrefetch =
            itemId && isAzureBackedTtsSelection(selection) && greetingText
                ? getOrCreateTtsAudio(greetingText, selection).catch(() => null)
                : Promise.resolve(null)

        // Initialize/Resume AudioContext on user gesture
        const audioOk = await initAudioStream()
        if (!audioOk) {
            setIsVoiceConversationOpen(false)
            setVoiceConversationStatus('Ready')
            return
        }

        setIsVoiceConversationActive(true)
        isVoiceConversationActiveRef.current = true

        await greetingPrefetch
        if (greetingText) {
            speechQueueRef.current.push(greetingText)
            voiceConversationPendingNextListenRef.current = true
            void processSpeechQueue()
        } else {
            startSpeechListening('conversation')
        }
        setVoiceConversationStatus("AI đang nói...")
    }

    const interruptAndListenConversation = () => {
        if (!isVoiceConversationActiveRef.current || !itemId || isLoading) return
        if (isAISpeaking) {
            stopAISpeaking()
        }
        startSpeechListening('conversation')
    }

    return (
        <div className="flex h-[calc(100vh-180px)] overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex-1 flex flex-col min-h-0">

                {/* Scroll Area - ĐÃ TỐI ƯU */}
                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full w-full">
                        <div className="p-6 space-y-6">
                            {activeChat?.messages.length === 0 && (
                                <div className="text-center py-24 text-muted-foreground">
                                    <div className="text-6xl mb-4">💬</div>
                                    <p>Bắt đầu trò chuyện nào...</p>
                                </div>
                            )}

                            {activeChat?.messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={cn(
                                        "flex gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                                        msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                                    )}
                                >
                                    <Avatar className={cn(
                                        "h-9 w-9 shrink-0 border-2 mt-1",
                                        msg.role === 'user' ? "border-primary/20" : "border-blue-500/20 shadow-blue-500/10"
                                    )}>
                                        {msg.role === 'user' ? (
                                            <>
                                                <AvatarFallback className="bg-primary/10 text-primary">
                                                    <User className="h-5 w-5" />
                                                </AvatarFallback>
                                            </>
                                        ) : (
                                            <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-inner">
                                                <Bot className="h-5 w-5" />
                                            </AvatarFallback>
                                        )}
                                    </Avatar>

                                    <div
                                        className={cn(
                                            "max-w-[80%] rounded-2xl px-5 py-3 shadow-sm",
                                            msg.role === 'user'
                                                ? "bg-primary text-primary-foreground rounded-tr-none"
                                                : "bg-muted dark:bg-slate-800/80 rounded-tl-none border border-border/40"
                                        )}
                                    >
                                        {msg.role === 'assistant' ? (
                                            <MarkdownContent
                                                content={msg.content}
                                                className="[&_p:last-child]:mb-0 [&_ol:last-child]:mb-0 [&_ul:last-child]:mb-0"
                                            />
                                        ) : (
                                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                        )}
                                        <p className="text-xs opacity-70 mt-2 flex items-center justify-between">
                                            <span>
                                                {msg.timestamp?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </p>

                                        {(() => {
                                            if (msg.role !== 'assistant' || !msg.sources || msg.sources.length === 0) return null;

                                            const webSources: {title: string, url: string}[] = [];
                                            const internalSources: string[] = [];

                                            msg.sources.forEach(source => {
                                                if (source.includes("🌐 NGUỒN INTERNET")) {
                                                    const titleMatch = source.match(/🌐 NGUỒN INTERNET(?:\s\(Dự phòng\))?:\s*(.*)/);
                                                    const urlMatch = source.match(/URL:\s*(.*)/);
                                                    if (urlMatch && titleMatch) {
                                                        webSources.push({ 
                                                            title: titleMatch[1].split('\n')[0].trim(), 
                                                            url: urlMatch[1].split('\n')[0].trim() 
                                                        });
                                                    } else {
                                                        webSources.push({ title: "Nguồn Web", url: "#" });
                                                    }
                                                } else {
                                                    const pageMatch = source.match(/\[P(\d+)\]/) || source.match(/START PAGE (\d+)/);
                                                    if (pageMatch) {
                                                        internalSources.push(`Trang ${pageMatch[1]}`);
                                                    } else {
                                                        internalSources.push("Tài liệu nội bộ");
                                                    }
                                                }
                                            });

                                            const uniqueInternal = Array.from(new Set(internalSources));

                                            return (
                                                <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2 items-center">
                                                    {uniqueInternal.map((page, idx) => (
                                                        <div key={`int-${idx}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-orange-50/50 dark:bg-orange-950/20 text-[11px] font-medium text-orange-600 dark:text-orange-400 select-none shadow-sm">
                                                            <MessageSquare className="w-3 h-3" />
                                                            {page}
                                                        </div>
                                                    ))}
                                                    {webSources.map((web, idx) => (
                                                        <a
                                                            key={`web-${idx}`}
                                                            href={web.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 text-[11px] font-medium text-blue-600 dark:text-blue-400 transition-colors cursor-pointer shadow-sm"
                                                            title={web.url}
                                                        >
                                                            <Compass className="w-3 h-3" />
                                                            <span className="max-w-[150px] truncate">{web.title}</span>
                                                        </a>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex flex-col gap-2 mb-6 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium ml-12 animate-pulse">
                                        <div className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
                                        <span>{thinkingStatus || 'Đang chuẩn bị...'}</span>
                                    </div>
                                    <div className="flex gap-3 items-start">
                                        <Avatar className="h-9 w-9 shrink-0 border-2 border-blue-500/20 mt-1">
                                            <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-500 text-white">
                                                <Bot className="h-5 w-5" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="bg-muted/50 rounded-2xl px-5 py-3 border border-border/50 rounded-tl-none shadow-sm">
                                            <div className="flex gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                </div>

                {/* Input Area - Luôn dính dưới */}
                <div className="shrink-0 p-4 border-t bg-card">
                    <div className="max-w-3xl mx-auto flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) =>
                                e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())
                            }
                            placeholder={itemId ? "Nhập tin nhắn của bạn..." : "Hãy chọn một tài liệu để bắt đầu chat"}
                            className="rounded-2xl py-6"
                            disabled={!itemId}
                        />
                        <Button
                            type="button"
                            onClick={toggleVoiceConversation}
                            disabled={!itemId || isLoading}
                            size="icon"
                            variant={isVoiceConversationActive ? 'default' : 'outline'}
                            className={cn(
                                "rounded-2xl h-14 w-14",
                                isVoiceConversationActive && "animate-pulse"
                            )}
                            title="Real-time Voice Conversation"
                            aria-label="Real-time Voice Conversation"
                        >
                            <AudioLines className="h-5 w-5" />
                        </Button>
                        <Button
                            type="button"
                            onClick={toggleSpeechToText}
                            disabled={!itemId || isLoading || !isSpeechSupported || isVoiceConversationActive}
                            size="icon"
                            variant={isListening ? 'destructive' : 'outline'}
                            className={cn(
                                "rounded-2xl h-14 w-14",
                                isListening && "animate-pulse"
                            )}
                            title={isListening ? 'Dừng ghi âm' : 'Nhập bằng giọng nói'}
                        >
                            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                        <Button
                            onClick={() => void sendMessage()}
                            disabled={!itemId || !input.trim() || isLoading}
                            size="icon"
                            className="rounded-2xl h-14 w-14"
                        >
                            <Send className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
            {isVoiceConversationOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-xl transition-opacity duration-300" onClick={stopVoiceConversation} />

                    <div className="relative w-full max-w-[420px] bg-card border border-border rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
                        {/* Subtle Ambient Light */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-primary/10 blur-[60px] rounded-full pointer-events-none" />

                        {/* Header */}
                        <div className="relative z-10 flex items-center justify-between px-8 pt-6">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <h2 className="text-lg font-semibold tracking-tight">Cuộc trò chuyện bằng giọng nói</h2>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={stopVoiceConversation}
                                className="rounded-full hover:bg-muted"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        {/* Voice selector */}
                        <div className="relative z-10 px-8 pt-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-sm text-muted-foreground">Giọng AI</div>
                                <Select
                                    value={selectedTtsVoiceUri}
                                    onValueChange={handleTtsVoiceChange}
                                >
                                    <SelectTrigger className="min-w-[280px] max-w-[320px] flex-1 justify-between rounded-xl">
                                        <SelectValue placeholder="Chọn giọng nói">
                                            {getTtsTriggerLabel(selectedTtsVoiceUri)}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[360px]">
                                        <SelectGroup>
                                            <SelectLabel>Preset giọng Azure</SelectLabel>
                                            <SelectItem value="auto">Giọng tự động</SelectItem>
                                            <SelectItem value="preset:nu_mien_bac">Nữ miền Bắc</SelectItem>
                                            <SelectItem value="preset:nu_mien_nam">Nữ miền Nam</SelectItem>
                                            <SelectItem value="preset:nm_mien_bac">Nam miền Bắc</SelectItem>
                                            <SelectItem value="preset:nm_mien_nam">Nam miền Nam</SelectItem>
                                        </SelectGroup>
                                        <SelectSeparator />
                                        <SelectGroup>
                                            <SelectLabel>Giọng Azure cụ thể</SelectLabel>
                                            {AZURE_TTS_VOICE_OPTIONS.map((voice) => (
                                                <SelectItem key={voice.value} value={voice.value}>
                                                    {voice.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                        <SelectSeparator />
                                        <SelectGroup>
                                            <SelectLabel>Giọng thiết bị (dự phòng)</SelectLabel>
                                            {ttsVoices
                                                .filter((v) => v.lang?.toLowerCase().startsWith('vi'))
                                                .map((v) => (
                                                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                                                        {v.name}
                                                    </SelectItem>
                                                ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Chọn kiểu giọng bạn muốn nghe. Nếu giọng AI tạm gián đoạn, hệ thống sẽ chuyển sang giọng trên thiết bị của bạn.
                            </p>
                            <p className={cn(
                                "mt-1 text-xs",
                                ttsEngineMessage?.toLowerCase().includes('lỗi') || ttsEngineMessage?.toLowerCase().includes('chưa') || ttsEngineMessage?.toLowerCase().includes('không')
                                    ? "text-red-500"
                                    : "text-primary"
                            )}>
                                {ttsEngineMessage || 'Chưa phát giọng nói.'}
                            </p>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 flex flex-col items-center justify-center px-8 py-4">
                            {/* True 3D Particle Sphere UI */}
                            <div className="relative mb-6 flex items-center justify-center w-56 h-56">
                                {/* Ambient Core Glow */}
                                <div className={cn(
                                    "absolute w-48 h-48 rounded-full bg-primary/5 blur-[60px] transition-all duration-700",
                                    isListening && "bg-primary/20 blur-[90px] scale-150 animate-pulse"
                                )} />

                                <canvas
                                    id="voice-sphere-canvas"
                                    className="w-full h-full z-10"
                                    width={600}
                                    height={600}
                                />

                                {/* Extra Dynamic Rings for "Listening" state */}
                                {isListening && (
                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute inset-4 border border-primary/20 rounded-full animate-ping opacity-20" />
                                        <div className="absolute inset-10 border border-primary/10 rounded-full animate-ping opacity-10 [animation-delay:0.5s]" />
                                    </div>
                                )}
                            </div>

                            {/* Text & Status */}
                            <div className="text-center space-y-3 max-w-sm">
                                <div className="min-h-[2rem] flex items-center justify-center">
                                    <p className={cn(
                                        "text-base font-medium leading-relaxed transition-all duration-300",
                                        isAISpeaking || isLoading ? "text-primary animate-pulse" : "text-foreground"
                                    )}>
                                        {isAISpeaking ? "AI đang nói..." : isLoading ? "Đang xử lý..." : "Tôi đang lắng nghe bạn..."}
                                    </p>
                                </div>

                                <div className="flex items-center justify-center gap-1.5 h-8">
                                    {isListening && (
                                        <div className="flex items-end gap-1.5 h-8">
                                            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                                                // Real-time audio reactive height
                                                const baseHeight = 4
                                                const noise = Math.sin(Date.now() * 0.01 + i) * 2
                                                const reactiveHeight = (audioVolume / 255) * 30
                                                const finalHeight = Math.max(baseHeight, reactiveHeight + noise + (i % 3) * 4)

                                                return (
                                                    <div
                                                        key={i}
                                                        className="w-1.5 bg-primary rounded-full transition-all duration-75"
                                                        style={{
                                                            height: `${finalHeight}px`,
                                                        }}
                                                    />
                                                )
                                            })}
                                        </div>
                                    )}
                                    {isAISpeaking && !isListening && (
                                        <div className="flex items-center gap-1">
                                            <AudioLines className="h-6 w-6 text-primary animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Bottom Controls */}
                        <div className="relative z-10 px-8 pb-8 pt-4 bg-muted/30 border-t border-border/50">
                            <div className="flex items-center justify-center gap-6">
                                <Button
                                    size="icon"
                                    className="w-14 h-14 rounded-full shadow-xl transition-all duration-300 z-10 bg-red-500 hover:bg-red-600 scale-105 shadow-red-500/40"
                                    onClick={stopVoiceConversation}
                                >
                                    <Mic className="h-7 w-7 text-white animate-pulse" />
                                </Button>

                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="w-11 h-11 rounded-full border-border bg-card shadow-sm hover:bg-muted transition-all"
                                    onClick={stopVoiceConversation}
                                >
                                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
