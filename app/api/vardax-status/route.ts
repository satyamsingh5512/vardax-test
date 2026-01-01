import { NextResponse } from 'next/server'

const VARDAX_API_URL = process.env.VARDAX_API_URL || 'http://localhost:8000'

/**
 * VARDAx Connection Status Endpoint
 * Checks if VARDAx firewall is reachable and returns connection status
 */
export async function GET() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const response = await fetch(`${VARDAX_API_URL}/api/health`, {
      method: 'GET',
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
