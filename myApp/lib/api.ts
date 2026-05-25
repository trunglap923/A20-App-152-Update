import { ProcessedContent } from './types';
import { createClient } from './supabaseClient';
import { loadUserAiSettings } from './custom-api-keys-storage';
import type { AiTaskType } from './custom-api-keys-types';
import { API_BASE_URL, API_PROXY_BASE } from './env';

const supabaseClient = createClient();

const SUPABASE_MAX_SIZE = 50 * 1024 * 1024; // 50MB (Giới hạn gói Free của Supabase)
const HARD_MAX_SIZE = 300 * 1024 * 1024;     // 300MB (Giới hạn cứng để bảo vệ server)

function getApiBaseCandidates(): string[] {
  const set = new Set<string>();
  // Ưu tiên proxy nội bộ của Next để tránh lỗi CORS/mixed-host từ browser.
  // set.add(API_PROXY_BASE);
  if (API_BASE_URL) set.add(API_BASE_URL);

  return [...set];
}

async function fetchWithApiFallback(
  path: string,
  init: RequestInit,
  options?: { swallowNetworkError?: boolean }
): Promise<Response> {
  const candidates = getApiBaseCandidates();
  let lastError: unknown = null;
  const tried: string[] = [];

  for (const base of candidates) {
    try {
      const target = `${base}${path}`;
      tried.push(target);
      const response = await fetch(target, init);
      if (!response.ok && response.status >= 500) {
        const details = await response.clone().text();
        lastError = new Error(`HTTP ${response.status} from ${target}: ${details || '(empty body)'}`);
        console.warn(`[API] ${target} trả về ${response.status}, thử endpoint fallback tiếp theo...`);
        continue;
      }
      if (base !== API_BASE_URL) {
        console.warn(`[API] Fallback base URL đang dùng: ${base}`);
      }
      return response;
    } catch (error: any) {
      lastError = error;
      console.warn(`[API] Không thể kết nối ${base}${path}`, error);
      
      // Gợi ý cách sửa lỗi SSL trong môi trường dev
      if (error?.message?.includes('self-signed certificate') || error?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        console.error("❌ Lỗi SSL: Backend đang dùng chứng chỉ tự ký. Trong môi trường DEV, bạn có thể chạy: set NODE_TLS_REJECT_UNAUTHORIZED=0 && npm run dev");
      }
    }
  }

  if (options?.swallowNetworkError) {
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const reason = lastError instanceof Error ? lastError.message : 'Network error';
  throw new Error(`Không kết nối được backend. Đã thử: ${tried.join(' | ')}. Lý do cuối: ${reason}`);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text) as { error?: string; detail?: string; message?: string }
      return parsed.error || parsed.detail || parsed.message || text
    } catch {
      return text
    }
  } catch {
    return ''
  }
}

async function parseJsonSafely<T>(response: Response, fallbackValue: T, context: string): Promise<T> {
  const raw = await response.text()
  if (!raw) return fallbackValue

  try {
    return JSON.parse(raw) as T
  } catch (error) {
    // Một số phản hồi upstream có thể chứa ký tự điều khiển gây lỗi parse JSON.
    const sanitized = raw.replace(/[\u0000-\u001F]+/g, '')
    try {
      return JSON.parse(sanitized) as T
    } catch {
      console.warn(`[API] JSON parse failed at ${context}. Raw snippet:`, raw.slice(0, 300), error)
      return fallbackValue
    }
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

/**
 * Đọc cấu hình AI cho 1 loại tác vụ cụ thể từ localStorage.
 * Trả về object {provider, model, api_key?} để gửi lên backend.
 */
function getAiRuntimeForTask(task: AiTaskType): { provider: string; model: string; api_key?: string } | null {
  try {
    const settings = loadUserAiSettings();
    const cfg = settings[task];
    if (!cfg) return null;
    const result: { provider: string; model: string; api_key?: string } = {
      provider: cfg.providerId,
      model: cfg.modelId,
    };
    if (cfg.apiKey?.trim()) result.api_key = cfg.apiKey.trim();
    console.log(`[API] AI runtime for task=${task}:`, { provider: result.provider, model: result.model, hasKey: !!result.api_key });
    return result;
  } catch {
    return null;
  }
}

export async function uploadDocument(file: File | null, url: string, type: 'pdf' | 'audio' | 'video' | 'youtube') {
  const formData = new FormData()
  formData.append('source_type', type)
  
  if (url) {
    formData.append('source_url', url)
  }
  
  if (file) {
    if (file.size > HARD_MAX_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      throw new Error(`File quá lớn (${sizeMB}MB). Giới hạn tối đa là 300MB.`);
    }

    if (file.size > SUPABASE_MAX_SIZE) {
      // TRƯỜNG HỢP FILE LỚN (> 50MB): Bỏ qua Supabase, gửi thẳng file cho Backend xử lý tạm
      console.log(`[API] File > 50MB (${(file.size / 1024 / 1024).toFixed(1)}MB), bypass Supabase Storage.`);
      formData.append('file', file);
    } else {
      // TRƯỜNG HỢP FILE NHỎ (<= 50MB): Lưu vĩnh viễn trên Supabase Storage
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      console.log(`[API] Đang upload file lên Supabase Storage: ${fileName}`);
      const { data, error } = await supabaseClient.storage
        .from('knowledge-items')
        .upload(fileName, file, { upsert: true });

      if (error) {
        console.error('[API] Lỗi upload lên Supabase:', error);
        throw new Error(`Upload file lên Storage thất bại: ${error.message}`);
      }

      // Lấy Public URL
      const { data: publicUrlData } = supabaseClient.storage
        .from('knowledge-items')
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData.publicUrl;
      console.log(`[API] Lấy được Public URL: ${publicUrl}`);
      
      // Gửi URL cho backend xử lý
      formData.append('source_url', publicUrl);
    }

    // Gửi tên file gốc để backend dùng làm tiêu đề ban đầu
    formData.append('source_title', file.name);
  }

  // Gửi cả 3 task configs lên backend — backend dùng đúng config cho từng bước xử lý
  const textRuntime   = getAiRuntimeForTask('text')
  const visionRuntime = getAiRuntimeForTask('vision')
  const sttRuntime    = getAiRuntimeForTask('stt')

  if (textRuntime) {
    formData.append('user_ai_provider', textRuntime.provider)
    formData.append('user_ai_model',    textRuntime.model)
    if (textRuntime.api_key) formData.append('user_ai_key', textRuntime.api_key)
  }
  if (visionRuntime) {
    formData.append('user_vision_provider', visionRuntime.provider)
    formData.append('user_vision_model',    visionRuntime.model)
    if (visionRuntime.api_key) formData.append('user_vision_key', visionRuntime.api_key)
  }
  if (sttRuntime) {
    formData.append('user_stt_model', sttRuntime.model)
    if (sttRuntime.api_key) formData.append('user_stt_key', sttRuntime.api_key)
  }

  const headers = await getAuthHeaders();
  console.log(`[API] POST /items/process`);

  // Bypass proxy Next.js cho upload file lớn (video) để tránh bị giới hạn bộ nhớ/kích thước
  // Gọi thẳng tới Backend qua API_BASE_URL
  const directApiBase = API_BASE_URL || API_PROXY_BASE
  const response = await fetch(`${directApiBase}/items/process`, {
    method: 'POST',
    headers,
    body: formData,
  })

  console.log(`[API] POST /items/process response: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await readErrorMessage(response);
    console.error(`[API] Upload failed: ${response.status} - ${errorText}`);
    throw new Error(errorText || `Upload thất bại (HTTP ${response.status})`)
  }

  return response.json()
}

export async function checkItemStatus(itemId: string) {
  const headers = await getAuthHeaders();
  
  const response = await fetchWithApiFallback(`/items/${itemId}`, {
    cache: 'no-store',
    headers: { 
      'Cache-Control': 'no-cache',
      ...headers
    }
  })
  if (!response.ok) {
    // 404: Item not found, 403: Item not owned by user → stop polling
    if (response.status === 404 || response.status === 403) return null
    const errorText = await readErrorMessage(response)
    throw new Error(errorText || `Không thể kiểm tra trạng thái (HTTP ${response.status})`)
  }
  return parseJsonSafely<any | null>(response, null, `GET /items/${itemId}`)
}

export async function fetchItemsList() {
  const headers = await getAuthHeaders();
  console.log(`[API] GET /items`);
  
  const response = await fetchWithApiFallback('/items', {
    headers
  }, { swallowNetworkError: true })
  
  console.log(`[API] GET /items response: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`[API] Fetch list fallback to empty: ${response.status} - ${errorText}`);
    return []
  }

  try {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [];
    } catch (parseError) {
      console.error('[API] JSON Parse Error. Raw content follows:');
      console.error(text);
      throw parseError;
    }
  } catch (error) {
    console.warn('[API] Fetch list parse failed, fallback to empty', error)
    return []
  }
}

export async function chatWithAi(message: string, itemId?: string, history: { role: string; content: string }[] = []) {
  const headers = await getAiHeaders();
  
  const response = await fetchWithApiFallback('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ message, item_id: itemId, history })
  });

  if (!response.ok) {
    const errorText = await readErrorMessage(response);
    throw new Error(errorText || `Chat thất bại (HTTP ${response.status})`);
  }

  return response.json();
}

export type ChatHistoryMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  created_at: string
}

export async function fetchChatHistory(itemId: string): Promise<ChatHistoryMessage[]> {
  const headers = await getAuthHeaders();
  const response = await fetchWithApiFallback(`/chat?item_id=${encodeURIComponent(itemId)}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    const errorText = await readErrorMessage(response);
    throw new Error(errorText || `Không thể tải lịch sử chat (HTTP ${response.status})`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function synthesizeChatSpeech(text: string, voiceSelection: string, itemId?: string): Promise<Blob> {
  const headers = await getAuthHeaders();
  const response = await fetchWithApiFallback('/chat/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      text,
      voice_selection: voiceSelection,
      item_id: itemId,
    }),
  });

  if (!response.ok) {
    const errorText = await readErrorMessage(response);
    throw new Error(errorText || `Không thể tổng hợp giọng nói (HTTP ${response.status})`);
  }

  return response.blob();
}

// ========== LIVE RECORDING API ==========

export async function uploadAudioChunk(sessionId: string, chunkIndex: number, blob: Blob) {
  const formData = new FormData()
  formData.append('chunk_index', chunkIndex.toString())
  formData.append('file', blob, `chunk_${chunkIndex}.webm`)

  const headers = await getAuthHeaders()

  const directApiBase = API_BASE_URL || API_PROXY_BASE
  const response = await fetch(`${directApiBase}/items/${sessionId}/audio-chunk`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[API] Chunk upload failed: ${response.status} - ${errorText}`)
    throw new Error('Lỗi khi gửi chunk audio')
  }

  return response.json()
}

export async function finishAudioSession(sessionId: string, title: string = 'Bản ghi âm trực tiếp', sourceUrl?: string) {
  const formData = new FormData()
  formData.append('title', title)
  if (sourceUrl) {
    formData.append('source_url', sourceUrl)
  }

  const headers = await getAuthHeaders()

  // Đính kèm cấu hình AI đa tác vụ
  const textRuntime = getAiRuntimeForTask('text')
  const visionRuntime = getAiRuntimeForTask('vision')
  const sttRuntime = getAiRuntimeForTask('stt')

  if (textRuntime) {
    headers['x-user-ai-provider'] = textRuntime.provider
    headers['x-user-ai-model'] = textRuntime.model
    if (textRuntime.api_key) headers['x-user-ai-key'] = textRuntime.api_key
  }
  if (visionRuntime) {
    headers['x-user-vision-provider'] = visionRuntime.provider
    headers['x-user-vision-model'] = visionRuntime.model
    if (visionRuntime.api_key) headers['x-user-vision-key'] = visionRuntime.api_key
  }
  if (sttRuntime) {
    headers['x-user-stt-model'] = sttRuntime.model
    if (sttRuntime.api_key) headers['x-user-stt-key'] = sttRuntime.api_key
  }

  const response = await fetchWithApiFallback(`/items/${sessionId}/finish-audio`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[API] Finish audio failed: ${response.status} - ${errorText}`)
    throw new Error('Lỗi khi kết thúc phiên ghi âm')
  }

  return response.json()
}

export async function renameItem(itemId: string, newTitle: string): Promise<{ id: string; title: string }> {
  const headers = await getAuthHeaders()
  headers['Content-Type'] = 'application/json'

  const response = await fetchWithApiFallback(`/items/${itemId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ title: newTitle }),
  })

  if (!response.ok) {
    throw new Error('Không thể đổi tên tài liệu')
  }
  return response.json()
}

export async function deleteItem(itemId: string): Promise<{ id: string; deleted: boolean }> {
  const headers = await getAuthHeaders()
  
  const response = await fetchWithApiFallback(`/items/${itemId}`, {
    method: 'DELETE',
    headers,
  })

  if (!response.ok) {
    throw new Error('Không thể xoá tài liệu')
  }
  return response.json()
}



// ========== REGENERATION API ==========

export async function getAiHeaders(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders();
  const textRuntime = getAiRuntimeForTask('text')
  const visionRuntime = getAiRuntimeForTask('vision')

  if (textRuntime) {
    headers['x-user-ai-provider'] = textRuntime.provider
    headers['x-user-ai-model'] = textRuntime.model
    if (textRuntime.api_key) headers['x-user-ai-key'] = textRuntime.api_key
  }
  if (visionRuntime) {
    headers['x-user-vision-provider'] = visionRuntime.provider
    headers['x-user-vision-model'] = visionRuntime.model
    if (visionRuntime.api_key) headers['x-user-vision-key'] = visionRuntime.api_key
  }
  return headers;
}

/**
 * Yêu cầu tạo lại Tóm tắt (Detailed + TLDR)
 */
export async function regenerateSummary(itemId: string) {
  const headers = await getAiHeaders();
  const response = await fetchWithApiFallback(`/items/${itemId}/regenerate-summary`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) throw new Error('Không thể tạo lại tóm tắt');
  return response.json();
}

/**
 * Yêu cầu tạo lại Sơ đồ tư duy (Mindmap)
 */
export async function regenerateMindmap(itemId: string) {
  const headers = await getAiHeaders();
  const response = await fetchWithApiFallback(`/items/${itemId}/regenerate-mindmap`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) throw new Error('Không thể tạo lại sơ đồ tư duy');
  return response.json();
}

export async function regenerateLessons(itemId: string) {
  const headers = await getAiHeaders();
  const response = await fetchWithApiFallback(`/items/${itemId}/regenerate-lessons`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) throw new Error('Không thể tạo lại bài học');
  return response.json();
}

export async function regenerateQuiz(itemId: string, difficulty: string = 'intermediate') {
  const headers = await getAiHeaders();
  const formData = new FormData();
  formData.append('difficulty', difficulty);

  const directApiBase = API_BASE_URL || API_PROXY_BASE;
  const response = await fetch(`${directApiBase}/items/${itemId}/regenerate-quiz`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!response.ok) throw new Error('Không thể tạo lại câu hỏi');
  return response.json();
}

export type GenerateSlidesParams = {
  itemId: string
  pageCount: number
  language: string
  additionalInstructions?: string | null
  includeQuiz: boolean
  selectedQuizIds?: string[]
  includeMindmap: boolean
  mindmapData?: any
  quizData?: any[]
  style?: {
    category: string
    colorPalette: string[]
    font: string
  }
}

export type SlideOutlineItem = {
  index: number
  title: string
  intent: string
}

export type GenerateOutlineParams = {
  itemId: string
  pageCount: number
  language: string
  additionalInstructions?: string | null
}

function buildOutlineFallback(params: GenerateOutlineParams): SlideOutlineItem[] {
  const instructions = params.additionalInstructions || ''
  const outlineMatch = instructions.match(/OUTLINE_DRAFT[\s\S]*?:\s*([\s\S]*)/i)
  const rawOutline = (outlineMatch?.[1] || '').trim()
  const lines = rawOutline
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)

  if (lines.length) {
    return lines.slice(0, params.pageCount).map((line, i) => ({
      index: i + 1,
      title: line,
      intent: `Triển khai nội dung cho phần "${line}" rõ ràng, ngắn gọn, có tính trình bày.`
    }))
  }

  return Array.from({ length: params.pageCount }, (_, i) => ({
    index: i + 1,
    title: `Slide ${i + 1}`,
    intent: 'Trình bày ý chính theo bố cục title + bullets, ưu tiên tính rõ ràng.'
  }))
}

export async function generateSlideOutlineWithAi(params: GenerateOutlineParams): Promise<SlideOutlineItem[]> {
  const headers = await getAiHeaders()
  headers['Content-Type'] = 'application/json'

  try {
    const response = await fetchWithApiFallback('/slides/outline', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        item_id: params.itemId,
        page_count: params.pageCount,
        language: params.language,
        additional_instructions: params.additionalInstructions || null,
      }),
    })

    if (!response.ok) {
      return buildOutlineFallback(params)
    }

    const payload = await response.json()
    if (Array.isArray(payload?.outline)) {
      return payload.outline
        .map((item: any, idx: number) => ({
          index: Number(item?.index || idx + 1),
          title: String(item?.title || `Slide ${idx + 1}`),
          intent: String(item?.intent || ''),
        }))
        .slice(0, params.pageCount)
    }

    return buildOutlineFallback(params)
  } catch {
    return buildOutlineFallback(params)
  }
}

export async function generateSlidesWithAi(params: GenerateSlidesParams) {
  const headers = await getAiHeaders()
  headers['Content-Type'] = 'application/json'

  const response = await fetchWithApiFallback('/slides', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      item_id: params.itemId,
      page_count: params.pageCount,
      language: params.language,
      additional_instructions: params.additionalInstructions || null,
      include_quiz: params.includeQuiz,
      selected_quiz_ids: params.selectedQuizIds || [],
      include_mindmap: params.includeMindmap,
      mindmap_data: params.mindmapData || null,
      quiz_data: params.quizData || null,
      style: params.style || null,
    }),
  })

  if (!response.ok) {
    const errorText = await readErrorMessage(response)
    throw new Error(errorText || `Không thể tạo slide (HTTP ${response.status})`)
  }

  return response.json()
}
