import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * VARDAx Firewall Middleware for Next.js
 * Checks each request against the VARDAx firewall running locally
 */

const VARDAX_API_URL = process.env.VARDAX_API_URL || 'http://localhost:8000'
const VARDAX_MODE = process.env.VARDAX_MODE || 'monitor' // 'monitor' or 'protect'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  try {
    // Prepare request data for VARDAx
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    
    const requestData = {
      ip: clientIp,
      path: pathname,
      method: request.method,
      userAgent: request.headers.get('user-agent') || '',
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString(),
    }

    // Check with VARDAx firewall
    const vardaxResponse = await fetch(`${VARDAX_API_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    })

    if (vardaxResponse.ok) {
      const result = await vardaxResponse.json()

      // Log the check result
      console.log(`[VARDAx] ${VARDAX_MODE.toUpperCase()} - ${clientIp} - ${pathname} - ${result.allowed ? 'ALLOWED' : 'BLOCKED'}`)

      // In protect mode, block threats
      if (VARDAX_MODE === 'protect' && !result.allowed) {
        return new NextResponse(
          JSON.stringify({
            error: 'Access Denied',
            message: result.message || 'Blocked by VARDAx firewall',
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }
  } catch (error) {
    // Log error but don't block request if VARDAx is unavailable
    console.error('[VARDAx] Firewall check failed:', error)
  }

  return NextResponse.next()
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
