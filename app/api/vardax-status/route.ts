import { NextResponse } from 'next/server'

/**
 * VARDAx Connection Status Endpoint
 * Checks if VARDAx firewall is reachable and returns connection status
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const customUrl = searchParams.get('url')
  
  const VARDAX_API_URL = customUrl || process.env.VARDAX_API_URL || 'https://spectrological-cinda-unfunereally.ngrok-free.dev'

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const response = await fetch(`${VARDAX_API_URL}/api/health`, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      return NextResponse.json({
        connected: true,
        status: 'online',
        message: 'VARDAx firewall is connected',
        apiUrl: VARDAX_API_URL,
        details: data,
      })
    } else {
      return NextResponse.json({
        connected: false,
        status: 'error',
        message: `VARDAx returned status ${response.status}`,
        apiUrl: VARDAX_API_URL,
      })
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json({
      connected: false,
      status: 'offline',
      message: isTimeout 
        ? 'VARDAx connection timed out' 
        : 'VARDAx firewall is not reachable',
      apiUrl: VARDAX_API_URL,
    })
  }
}
