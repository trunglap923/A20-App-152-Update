'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Activity, Bot, Clock3, DollarSign, Gauge, Layers3, Loader2, Search, Server } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { API_BASE_URL } from '@/lib/env'
import { createClient } from '@/lib/supabaseClient'

type TimeFilter = 'today' | '7d' | '30d'

type AiLogRow = {
  id: string
  at: string
  email: string
  task: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  success: boolean
  prompt: string
  response: string
  error_message?: string
  item_id?: string
}

// Bảng giá token cho các model phổ biến (USD per 1K tokens)
const MODEL_PRICING_PER_1K: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 0.0025, output: 0.010 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'whisper-1': { input: 0.1, output: 0 }, // $0.006/min => $0.1 per 1000s (input_tokens ở STT là số giây)
  
  // Anthropic
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },

  // Google
  'gemini-1.5-pro': { input: 0.00125, output: 0.00375 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },

  // xAI (Grok)
  'grok-3': { input: 0.002, output: 0.010 },
}

const DEFAULT_PRICING = { input: 0.0005, output: 0.0015 }

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return headers
}

function formatTokenCount(value: number): string {
  return value.toLocaleString('en-US')
}

export default function AdminAiMonitoringPage() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d')
  const [selectedLog, setSelectedLog] = useState<AiLogRow | null>(null)
  const [logs, setLogs] = useState<AiLogRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20

  // --- Bộ lọc bảng ---
  const [filterUser, setFilterUser] = useState('')
  const [filterTask, setFilterTask] = useState('all')
  const [filterModel, setFilterModel] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'failed'>('all')
  const [filterLatencyMin, setFilterLatencyMin] = useState('')
  const [filterLatencyMax, setFilterLatencyMax] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Fetch logs từ Backend API
  const fetchLogs = useCallback(async (filter: TimeFilter) => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(
        `${API_BASE_URL}/admin/ai-monitoring/logs?time_filter=${filter}&limit=${filter === 'today' ? 500 : filter === '7d' ? 2000 : 5000}`,
        { headers }
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const mappedLogs: AiLogRow[] = (data.logs || []).map((log: any) => ({
        id: log.id,
        at: log.at,
        email: log.email || log.user_id || 'system',
        task: log.task,
        model: log.model,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        latencyMs: log.latencyMs,
        success: log.success,
        prompt: log.prompt || '',
        response: log.response || '',
        error_message: log.error_message,
        item_id: log.item_id,
      }))

      setLogs(mappedLogs)
      setTotalCount(data.total_count || mappedLogs.length)
    } catch (err: any) {
      console.error('[AI-Monitor] Fetch error:', err)
      setError(err.message || 'Không thể kết nối đến API')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1)
    setFilterUser('')
    setFilterTask('all')
    setFilterModel('all')
    setFilterStatus('all')
    setFilterLatencyMin('')
    setFilterLatencyMax('')
    setFilterDateFrom('')
    setFilterDateTo('')
    fetchLogs(timeFilter)
  }, [timeFilter, fetchLogs])

  const metrics = useMemo(() => {
    const totalRequests = logs.length
    const inputTokens = logs.reduce((sum, row) => sum + row.inputTokens, 0)
    const outputTokens = logs.reduce((sum, row) => sum + row.outputTokens, 0)
    const totalLatency = logs.reduce((sum, row) => sum + row.latencyMs, 0)
    const avgLatency = totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0
    const estimatedCost = logs.reduce((sum, row) => {
      const modelKey = row.model.toLowerCase()
      const price = MODEL_PRICING_PER_1K[modelKey] || DEFAULT_PRICING
      return sum + (row.inputTokens / 1000) * price.input + (row.outputTokens / 1000) * price.output
    }, 0)
    return {
      totalRequests,
      inputTokens,
      outputTokens,
      avgLatency,
      estimatedCost,
    }
  }, [logs])

  const trafficAndErrorSeries = useMemo(() => {
    const bucket = new Map<string, { label: string; requests: number; failed: number }>()
    for (const row of logs) {
      const d = new Date(row.at)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      const label = format(d, 'dd/MM')
      if (!bucket.has(key)) {
        bucket.set(key, { label, requests: 0, failed: 0 })
      }
      const entry = bucket.get(key)!
      entry.requests += 1
      if (!row.success) entry.failed += 1
    }
    return [...bucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, x]) => ({
        ...x,
        errorRate: x.requests > 0 ? Number(((x.failed / x.requests) * 100).toFixed(2)) : 0,
      }))
      .slice(-14)
  }, [logs])

  const modelTokenSeries = useMemo(() => {
    const byModel = new Map<string, number>()
    for (const row of logs) {
      const total = row.inputTokens + row.outputTokens
      byModel.set(row.model, (byModel.get(row.model) ?? 0) + total)
    }
    return [...byModel.entries()].map(([model, tokens]) => ({ model, tokens }))
  }, [logs])

  // Unique values for dropdowns
  const uniqueTasks = useMemo(() => ['all', ...Array.from(new Set(logs.map(l => l.task))).sort()], [logs])
  const uniqueModels = useMemo(() => ['all', ...Array.from(new Set(logs.map(l => l.model))).sort()], [logs])

  // Apply all filters
  const filteredLogs = useMemo(() => {
    return logs.filter(row => {
      if (filterUser && !row.email.toLowerCase().includes(filterUser.toLowerCase())) return false
      if (filterTask !== 'all' && row.task !== filterTask) return false
      if (filterModel !== 'all' && row.model !== filterModel) return false
      if (filterStatus === 'success' && !row.success) return false
      if (filterStatus === 'failed' && row.success) return false
      if (filterLatencyMin && row.latencyMs < Number(filterLatencyMin)) return false
      if (filterLatencyMax && row.latencyMs > Number(filterLatencyMax)) return false
      if (filterDateFrom) {
        const from = new Date(filterDateFrom)
        if (new Date(row.at) < from) return false
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo)
        to.setHours(23, 59, 59, 999)
        if (new Date(row.at) > to) return false
      }
      return true
    })
  }, [logs, filterUser, filterTask, filterModel, filterStatus, filterLatencyMin, filterLatencyMax, filterDateFrom, filterDateTo])

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))
  const tableRows = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="relative space-y-8 overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/70 to-white p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,229,255,0.1),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(109,40,217,0.12),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Giám sát hệ thống AI</h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi request, token, chi phí và độ ổn định của luồng RAG/LLM theo thời gian.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={timeFilter === 'today' ? 'default' : 'outline'}
            onClick={() => setTimeFilter('today')}
          >
            Hôm nay
          </Button>
          <Button
            size="sm"
            variant={timeFilter === '7d' ? 'default' : 'outline'}
            onClick={() => setTimeFilter('7d')}
          >
            7 ngày qua
          </Button>
          <Button
            size="sm"
            variant={timeFilter === '30d' ? 'default' : 'outline'}
            onClick={() => setTimeFilter('30d')}
          >
            30 ngày
          </Button>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
      </div>

      {error && (
        <div className="relative rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ {error}. Hệ thống sẽ hiển thị dữ liệu khi có các request AI thực tế.
        </div>
      )}

      <div className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-slate-500">
              <Server className="h-4 w-4 text-cyan-600" />
              Tổng số Request
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {metrics.totalRequests.toLocaleString('en-US')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-slate-500">
              <Layers3 className="h-4 w-4 text-indigo-600" />
              Tổng Token (Input / Output)
            </CardDescription>
            <CardTitle className="text-xl tabular-nums text-slate-900">
              {formatTokenCount(metrics.inputTokens)} / {formatTokenCount(metrics.outputTokens)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-slate-500">
              <DollarSign className="h-4 w-4 text-violet-600" />
              Chi phí ước tính ($)
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-slate-900">
              {metrics.estimatedCost.toFixed(4)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-slate-500">
              <Gauge className="h-4 w-4 text-blue-600" />
              Avg Latency (ms)
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-slate-900">{metrics.avgLatency}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="relative grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader>
            <CardTitle className="text-slate-900">Lưu lượng Request và Tỷ lệ lỗi</CardTitle>
            <CardDescription className="text-slate-500">
              Request theo ngày và % lỗi phát sinh.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px] pl-0">
            {trafficAndErrorSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trafficAndErrorSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" />
                  <XAxis dataKey="label" stroke="#64748B" className="text-xs" />
                  <YAxis yAxisId="left" stroke="#64748B" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748B" className="text-xs" />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === 'errorRate' ? [`${value}%`, 'Tỷ lệ lỗi'] : [value, 'Requests']
                    }
                    contentStyle={{ borderRadius: 8, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' }}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="requests"
                    name="Requests"
                    stroke="#2979FF"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="errorRate"
                    name="errorRate"
                    stroke="#7C3AED"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {loading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu trong khoảng thời gian này'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <CardHeader>
            <CardTitle className="text-slate-900">Mức sử dụng Token theo Model</CardTitle>
            <CardDescription className="text-slate-500">
              Tổng Input + Output token của từng model trong khoảng thời gian đã chọn.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px] pl-0">
            {modelTokenSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelTokenSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokenBar" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#0B3D91" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" />
                  <XAxis dataKey="model" stroke="#64748B" className="text-xs" />
                  <YAxis stroke="#64748B" className="text-xs" tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toLocaleString('en-US')} token`, 'Tổng token']}
                    contentStyle={{ borderRadius: 8, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' }}
                  />
                  <Bar dataKey="tokens" name="Token" fill="url(#tokenBar)" radius={[10, 10, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {loading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu trong khoảng thời gian này'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="relative border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <CardHeader>
          <CardTitle className="text-slate-900">AI Request Logs</CardTitle>
          <CardDescription className="text-slate-500">
            Hiển thị {filteredLogs.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} / {filteredLogs.length} bản ghi
            {filteredLogs.length !== logs.length && <span className="ml-1 text-amber-500">(đã lọc từ {logs.length})</span>}
            {' '}• Trang {currentPage} / {pageCount}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          {/* Filter panel */}
          <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* User */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">User (email / ID)</label>
              <input
                type="text"
                placeholder="Tìm theo email..."
                value={filterUser}
                onChange={e => { setFilterUser(e.target.value); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            {/* Task */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Loại tác vụ</label>
              <select
                value={filterTask}
                onChange={e => { setFilterTask(e.target.value); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {uniqueTasks.map(t => <option key={t} value={t}>{t === 'all' ? 'Tất cả tác vụ' : t}</option>)}
              </select>
            </div>
            {/* Model */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Model</label>
              <select
                value={filterModel}
                onChange={e => { setFilterModel(e.target.value); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {uniqueModels.map(m => <option key={m} value={m}>{m === 'all' ? 'Tất cả model' : m}</option>)}
              </select>
            </div>
            {/* Status */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Trạng thái</label>
              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value as any); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="all">Tất cả</option>
                <option value="success">Thành công</option>
                <option value="failed">Thất bại</option>
              </select>
            </div>
            {/* Latency range */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Độ trễ tối thiểu (ms)</label>
              <input
                type="number"
                placeholder="VD: 5000"
                value={filterLatencyMin}
                onChange={e => { setFilterLatencyMin(e.target.value); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Độ trễ tối đa (ms)</label>
              <input
                type="number"
                placeholder="VD: 30000"
                value={filterLatencyMax}
                onChange={e => { setFilterLatencyMax(e.target.value); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            {/* Date range */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Từ ngày</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => { setFilterDateFrom(e.target.value); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Đến ngày</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => { setFilterDateTo(e.target.value); setCurrentPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-400">Đang tải dữ liệu...</span>
            </div>
          ) : tableRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Chưa có request AI nào trong khoảng thời gian này.
              <br />
              Hãy tải lên tài liệu hoặc sử dụng chat để tạo dữ liệu giám sát.
            </div>
          ) : (
            <Table className="[&_td]:border-r-0 [&_th]:border-r-0">
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead>Thời gian</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Loại tác vụ</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Độ trễ (ms)</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/70">
                    <TableCell className="whitespace-nowrap text-xs text-slate-500">{format(new Date(row.at), 'dd/MM/yyyy HH:mm:ss')}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-sm text-slate-800" title={row.email}>{row.email}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.task}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.model}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      In: {formatTokenCount(row.inputTokens)} • Out: {formatTokenCount(row.outputTokens)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{row.latencyMs}</TableCell>
                    <TableCell>
                      {row.success ? (
                        <Badge className="border border-[#22C55E] bg-[#22C55E]/10 text-[#15803D] hover:bg-[#22C55E]/15">
                          Thành công
                        </Badge>
                      ) : (
                        <Badge className="border border-[#EF4444] bg-[#EF4444]/10 text-[#B91C1C] hover:bg-[#EF4444]/15">
                          Thất bại
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-300"
                        onClick={() => setSelectedLog(row)}
                      >
                        <Search className="mr-1 h-4 w-4" />
                        Xem chi tiết
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination controls */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
              <span className="text-xs text-slate-400">Trang {currentPage} / {pageCount}</span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Trước
                </button>
                <button
                  disabled={currentPage === pageCount}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Sau →
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Bot className="h-5 w-5 text-indigo-600" />
              Chi tiết request AI
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {selectedLog
                ? `${selectedLog.email} • ${selectedLog.task} • ${selectedLog.model}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="mb-1 flex items-center gap-1 font-medium text-slate-700">
                    <Clock3 className="h-4 w-4" />
                    Thời gian
                  </div>
                  {format(new Date(selectedLog.at), 'dd/MM/yyyy HH:mm:ss')}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="mb-1 flex items-center gap-1 font-medium text-slate-700">
                    <Layers3 className="h-4 w-4" />
                    Token
                  </div>
                  {formatTokenCount(selectedLog.inputTokens + selectedLog.outputTokens)}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="mb-1 flex items-center gap-1 font-medium text-slate-700">
                    <Gauge className="h-4 w-4" />
                    Latency
                  </div>
                  {selectedLog.latencyMs} ms
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="mb-1 flex items-center gap-1 font-medium text-slate-700">
                    <Activity className="h-4 w-4" />
                    Trạng thái
                  </div>
                  {selectedLog.success ? 'Thành công' : 'Thất bại'}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-sm font-semibold text-slate-800">Prompt đầu vào</p>
                  <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {selectedLog.prompt || '(không có dữ liệu)'}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold text-slate-800">Response đầu ra</p>
                  <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {selectedLog.success
                      ? (selectedLog.response || '(không có dữ liệu)')
                      : (selectedLog.error_message || selectedLog.response || 'Lỗi không xác định')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
