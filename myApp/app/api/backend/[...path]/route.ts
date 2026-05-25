import { NextRequest, NextResponse } from 'next/server'
import { API_BASE_URL } from '@/lib/env'

const BACKEND_BASE = API_BASE_URL
export const runtime = 'nodejs'

function buildTargetUrl(path: string[], search: string): string {
  const joined = path.map((segment) => encodeURIComponent(segment)).join('/')
  const suffix = joined ? `/${joined}` : ''
  return `${BACKEND_BASE}${suffix}${search}`
}

async function proxy(req: NextRequest, path: string[]) {
  try {
    if (!BACKEND_BASE) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_API_URL. Please set it in environment variables.' },
        { status: 500 }
      )
    }

    const targetUrl = buildTargetUrl(path, req.nextUrl.search)
    const outgoingHeaders = new Headers(req.headers)
    outgoingHeaders.delete('host')
    outgoingHeaders.delete('connection')
    outgoingHeaders.delete('content-length')
    outgoingHeaders.delete('accept-encoding')

    const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase())
    const body = hasBody ? req.body : undefined

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: outgoingHeaders,
      body: body as any, // Truyền trực tiếp ReadableStream
      redirect: 'manual',
      // @ts-ignore (Node.js fetch requires duplex: 'half' for streams)
      duplex: 'half',
    })

    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('transfer-encoding')

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Proxy upstream failed'
    console.error(`[Proxy] Lỗi kết nối tới backend: ${message}`);
    
    if (message.includes('self-signed certificate') || error?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      return NextResponse.json({ 
        error: 'Lỗi SSL: Backend dùng chứng chỉ tự ký. Trong môi trường DEV, hãy chạy: set NODE_TLS_REJECT_UNAUTHORIZED=0 && npm run dev' 
      }, { status: 502 })
    }
    
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return proxy(req, path ?? [])
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return proxy(req, path ?? [])
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return proxy(req, path ?? [])
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return proxy(req, path ?? [])
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return proxy(req, path ?? [])
}

export async function OPTIONS(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return proxy(req, path ?? [])
}
