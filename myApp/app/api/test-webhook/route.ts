// app/api/test-webhook/route.ts
export async function POST(req: Request) {
    console.log('[TEST_WEBHOOK_HIT!]')
    const body = await req.text()
    console.log('[TEST_WEBHOOK_BODY]', body)
    return new Response('ok', { status: 200 })
}