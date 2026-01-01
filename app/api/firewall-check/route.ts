import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

const VARDAX_API_URL = process.env.VARDAX_API_URL || 'https://spectrological-cinda-unfunereally.ngrok-free.dev'

/**
 * VARDAx Firewall Check Endpoint
 * 
 * Checks the current request against VARDAx firewall
 *
 * Expected Request:
 *   POST /api/firewall-check
 *   Body: { "path": "/", "clientHint": "test" }
 *
 * Expected Response:
 *   Allowed:  { "allowed": true, "message": "Access granted", "redirect": "/app" }
 *   Blocked:  { "allowed": false, "message": "Blocked by firewall: reason" }
 */

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const headersList = await headers()
    
    // Get client IP
    const clientIp = headersList.get('x-forwarded-for')?.split(',')[0] || 
                     headersList.get('x-real-ip') || 
                     'unknown'

    console.log('[VARDAx] Firewall check request:', { ...body, ip: clientIp })

    // Prepare request data for VARDAx
    const requestData = {
      ip: clientIp,
      path: body.path || '/',
      method: 'POST',
      userAgent: headersList.get('user-agent') || '',
      clientHint: body.clientHint,
      timestamp: new Date().toISOString(),
    }

    try {
      // Check with VARDAx firewall
      const vardaxResponse = await fetch(`${VARDAX_API_URL}/api/check`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(requestData),
      })

      if (vardaxResponse.ok) {
        const result = await vardaxResponse.json()
        
        console.log('[VARDAx] Check result:', result)

        if (result.allowed) {
          return NextResponse.json({
            allowed: true,
            message: result.message || 'Access granted by VARDAx',
            redirect: '/app',
          })
        } else {
          return NextResponse.json({
            allowed: false,
            message: result.message || 'Blocked by VARDAx firewall',
          })
        }
      } else {
        // VARDAx returned an error status
        const errorText = await vardaxResponse.text()
        console.error('[VARDAx] Error response:', errorText)
        
        return NextResponse.json({
          allowed: false,
          message: 'Firewall check failed: Unable to verify access',
        })
      }
    } catch (fetchError) {
      // VARDAx is not reachable - fail open or closed based on config
      console.error('[VARDAx] Connection failed:', fetchError)
      
      // Fail open for development (allow if VARDAx is down)
      // Change to fail closed (block) for production
      const failOpen = process.env.VARDAX_FAIL_OPEN !== 'false'
      
      if (failOpen) {
        return NextResponse.json({
          allowed: true,
          message: 'Access granted (VARDAx unavailable)',
          redirect: '/app',
        })
      } else {
        return NextResponse.json({
          allowed: false,
          message: 'Firewall service unavailable',
        })
      }
    }
  } catch (error) {
    console.error('[VARDAx] Firewall check error:', error)
    return NextResponse.json(
      { allowed: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
