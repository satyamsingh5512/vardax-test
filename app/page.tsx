'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * API Response Types
 * Expected from POST /api/firewall-check
 */
interface FirewallResponse {
  allowed: boolean
  message: string
  redirect?: string
}

interface VardaxStatus {
  connected: boolean
  status: 'online' | 'offline' | 'error' | 'checking'
  message: string
}

type UIState = 'idle' | 'loading' | 'allowed' | 'blocked'

interface Toast {
  id: number
  headline: string
  message: string
}

/**
 * Fetch with timeout helper
 * Wraps fetch with a configurable timeout (default 10s)
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export default function FirewallGatePage() {
  const [uiState, setUIState] = useState<UIState>('idle')
  const [response, setResponse] = useState<FirewallResponse | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [shakeCard, setShakeCard] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [vardaxUrl, setVardaxUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [vardaxStatus, setVardaxStatus] = useState<VardaxStatus>({
    connected: false,
    status: 'checking',
    message: 'Checking VARDAx connection...',
  })

  // Refs for focus management
  const requestButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const toastIdRef = useRef(0)

  // Load saved URL from localStorage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('vardaxUrl')
    if (savedUrl) {
      setVardaxUrl(savedUrl)
      setUrlInput(savedUrl)
    }
  }, [])

  // Check VARDAx connection status
  const checkVardaxStatus = useCallback(async (customUrl?: string) => {
    const urlToCheck = customUrl || vardaxUrl
    setVardaxStatus(prev => ({ ...prev, status: 'checking' }))
    try {
      const queryParam = urlToCheck ? `?url=${encodeURIComponent(urlToCheck)}` : ''
      const res = await fetch(`/api/vardax-status${queryParam}`)
      const data = await res.json()
      setVardaxStatus({
        connected: data.connected,
        status: data.connected ? 'online' : 'offline',
        message: data.message,
      })
      return data.connected
    } catch {
      setVardaxStatus({
        connected: false,
        status: 'offline',
        message: 'Unable to check VARDAx status',
      })
      return false
    }
  }, [vardaxUrl])

  // Check VARDAx status on mount and periodically
  useEffect(() => {
    checkVardaxStatus()
    const interval = setInterval(() => checkVardaxStatus(), 30000) // Check every 30s
    return () => clearInterval(interval)
  }, [checkVardaxStatus])

  // Save and test URL
  const handleSaveUrl = async () => {
    const trimmedUrl = urlInput.trim().replace(/\/$/, '') // Remove trailing slash
    setVardaxUrl(trimmedUrl)
    localStorage.setItem('vardaxUrl', trimmedUrl)
    const connected = await checkVardaxStatus(trimmedUrl)
    if (connected) {
      setShowSettings(false)
    }
  }

  // Add toast notification
  const addToast = useCallback((headline: string, message: string) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, headline, message }])
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  // Remove specific toast
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /**
   * Main request handler
   * POST to /api/firewall-check with JSON body
   * Handles success, blocked, timeout, and network errors
   */
  const handleRequestAccess = useCallback(async () => {
    setUIState('loading')
    setResponse(null)

    try {
      // POST to your backend endpoint
      const res = await fetchWithTimeout(
        '/api/firewall-check',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            path: '/', 
            clientHint: 'test',
            vardaxUrl: vardaxUrl || undefined,
          }),
        },
        10000 // 10 second timeout
      )

      const data: FirewallResponse = await res.json()
      setResponse(data)

      if (data.allowed) {
        setUIState('allowed')
        previousFocusRef.current = document.activeElement as HTMLElement
        setShowModal(true)
      } else {
        setUIState('blocked')
        setShakeCard(true)
        addToast('Access Denied', data.message)
        setTimeout(() => setShakeCard(false), 500)
      }
    } catch (error) {
      // Handle timeout or network errors
      setUIState('blocked')
      setShakeCard(true)
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Request timed out. Please try again.'
          : 'Network error. Please check your connection.'
      addToast('Access Denied', message)
      setTimeout(() => setShakeCard(false), 500)
    }
  }, [addToast, vardaxUrl])

  // Reset UI to initial state
  const handleReset = useCallback(() => {
    setUIState('idle')
    setResponse(null)
    setToasts([])
    setShowModal(false)
    setShakeCard(false)
  }, [])

  // Handle Enter Site navigation
  const handleEnterSite = useCallback(() => {
    if (response?.redirect) {
      window.location.href = response.redirect
    } else {
      // Fallback: just close modal and show entered state
      setShowModal(false)
    }
  }, [response])

  // Modal focus trap and keyboard handling
  useEffect(() => {
    if (!showModal) {
      // Restore focus when modal closes
      previousFocusRef.current?.focus()
      return
    }

    // Focus the modal when it opens
    modalRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false)
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showModal])

  const isLoading = uiState === 'loading'
  const isAllowed = uiState === 'allowed'

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      {/* VARDAx Connection Status - Top Bar */}
      <div className="fixed top-4 left-4 z-40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => checkVardaxStatus()}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
              transition-all duration-300 shadow-md
              focus:outline-none focus:ring-2 focus:ring-offset-2
              ${vardaxStatus.status === 'online' 
                ? 'bg-green-100 text-green-800 hover:bg-green-200 focus:ring-green-500' 
                : vardaxStatus.status === 'checking'
                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 focus:ring-yellow-500'
                : 'bg-red-100 text-red-800 hover:bg-red-200 focus:ring-red-500'
              }
            `}
            aria-label={`VARDAx status: ${vardaxStatus.message}. Click to refresh.`}
          >
            {/* Status Indicator Dot */}
            <span className="relative flex h-3 w-3">
              {vardaxStatus.status === 'checking' ? (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
              ) : vardaxStatus.status === 'online' ? (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              ) : null}
              <span 
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  vardaxStatus.status === 'online' 
                    ? 'bg-green-500' 
                    : vardaxStatus.status === 'checking'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`} 
              />
            </span>
            
            {/* Status Text */}
            <span>
              {vardaxStatus.status === 'online' 
                ? 'VARDAx Connected' 
                : vardaxStatus.status === 'checking'
                ? 'Checking...'
                : 'VARDAx Disconnected'
              }
            </span>

            {/* Refresh Icon */}
            <svg 
              className={`w-4 h-4 ${vardaxStatus.status === 'checking' ? 'animate-spin' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full bg-white shadow-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label="Configure VARDAx connection"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Tooltip with details */}
        <div className="mt-2 text-xs text-gray-500 max-w-[250px]">
          {vardaxStatus.message}
          {vardaxUrl && (
            <div className="mt-1 truncate text-gray-400">
              {vardaxUrl}
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">VARDAx Configuration</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label="Close settings"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Enter your VARDAx backend URL (ngrok tunnel or server address) to connect.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="vardax-url" className="block text-sm font-medium text-gray-700 mb-1">
                  VARDAx Backend URL
                </label>
                <input
                  id="vardax-url"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://your-tunnel.ngrok-free.dev"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>

              {/* Connection Status in Modal */}
              <div className={`p-3 rounded-lg ${
                vardaxStatus.status === 'online' 
                  ? 'bg-green-50 border border-green-200' 
                  : vardaxStatus.status === 'checking'
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    vardaxStatus.status === 'online' 
                      ? 'bg-green-500' 
                      : vardaxStatus.status === 'checking'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`} />
                  <span className={`text-sm font-medium ${
                    vardaxStatus.status === 'online' 
                      ? 'text-green-800' 
                      : vardaxStatus.status === 'checking'
                      ? 'text-yellow-800'
                      : 'text-red-800'
                  }`}>
                    {vardaxStatus.message}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => checkVardaxStatus(urlInput.trim().replace(/\/$/, ''))}
                  disabled={vardaxStatus.status === 'checking'}
                  className="flex-1 py-2 px-4 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Test Connection
                </button>
                <button
                  onClick={handleSaveUrl}
                  disabled={vardaxStatus.status === 'checking'}
                  className="flex-1 py-2 px-4 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Save & Connect
                </button>
              </div>

              {vardaxUrl && (
                <button
                  onClick={() => {
                    setUrlInput('')
                    setVardaxUrl('')
                    localStorage.removeItem('vardaxUrl')
                    checkVardaxStatus('')
                  }}
                  className="w-full py-2 px-4 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Clear Saved URL
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div
        className={`
          bg-white rounded-xl shadow-lg p-8 max-w-md w-full
          transition-all duration-300 ease-out
          ${shakeCard ? 'animate-shake' : ''}
          ${isAllowed ? 'animate-gate-open border-2 border-green-500' : 'border border-gray-200'}
        `}
      >
        {/* Shield Icon */}
        <div className="flex justify-center mb-6">
          <div
            className={`
              w-16 h-16 rounded-full flex items-center justify-center
              transition-colors duration-300
              ${isAllowed ? 'bg-green-100' : 'bg-blue-100'}
            `}
          >
            <svg
              className={`w-8 h-8 ${isAllowed ? 'text-green-600' : 'text-blue-600'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Firewall Gate
        </h1>

        {/* Description */}
        <p className="text-gray-600 text-center mb-8">
          {isAllowed
            ? 'Access granted. You may proceed.'
            : 'Click Request Access to test if the firewall allows you in.'}
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            ref={requestButtonRef}
            data-testid="request-access"
            onClick={handleRequestAccess}
            disabled={isLoading || isAllowed}
            aria-label="Request access to pass through the firewall"
            className={`
              relative w-full py-3 px-4 rounded-lg font-medium
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              ${
                isLoading || isAllowed
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              }
            `}
          >
            <span className="flex items-center justify-center gap-2">
              Request Access
              {isLoading && (
                <>
                  {/* Inline spinner */}
                  <svg
                    className="animate-spin h-5 w-5 text-gray-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span role="status" className="sr-only">
                    Checking access, please wait...
                  </span>
                </>
              )}
            </span>
          </button>

          <button
            data-testid="reset"
            onClick={handleReset}
            aria-label="Reset the firewall test to initial state"
            className="
              w-full py-3 px-4 rounded-lg font-medium
              bg-gray-100 text-gray-700
              hover:bg-gray-200 active:bg-gray-300
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
            "
          >
            Reset
          </button>
        </div>
      </div>

      {/* Success Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowModal(false)}
          role="presentation"
        >
          <div
            ref={modalRef}
            data-testid="success-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex={-1}
            className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Check Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>

            <h2
              id="modal-title"
              className="text-2xl font-bold text-gray-900 text-center mb-2"
            >
              Access Granted
            </h2>

            <p className="text-gray-600 text-center mb-6">
              {response?.message || 'You have been granted access.'}
            </p>

            <button
              onClick={handleEnterSite}
              aria-label="Enter the site"
              className="
                w-full py-3 px-4 rounded-lg font-medium
                bg-green-600 text-white
                hover:bg-green-700 active:bg-green-800
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500
              "
            >
              Enter Site
            </button>

            <button
              onClick={() => setShowModal(false)}
              aria-label="Close modal"
              className="
                w-full mt-3 py-2 px-4 rounded-lg font-medium
                text-gray-600 hover:text-gray-800
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
              "
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            aria-live="assertive"
            className="
              bg-white rounded-lg shadow-lg border border-red-200 p-4 min-w-[300px]
              animate-slide-in
            "
          >
            <div className="flex items-start gap-3">
              {/* Error Icon */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>

              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{toast.headline}</h3>
                <p className="text-sm text-gray-600 mt-1">{toast.message}</p>

                <button
                  onClick={() => {
                    removeToast(toast.id)
                    handleRequestAccess()
                  }}
                  className="
                    mt-2 text-sm font-medium text-blue-600 hover:text-blue-800
                    focus:outline-none focus:underline
                  "
                >
                  Retry
                </button>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
                className="
                  flex-shrink-0 text-gray-400 hover:text-gray-600
                  focus:outline-none focus:ring-2 focus:ring-gray-500 rounded
                "
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

/**
 * ============================================
 * TEST SCENARIOS (Manual Testing Checklist)
 * ============================================
 *
 * 1. ALLOWED RESPONSE TEST
 *    - Mock /api/firewall-check to return: { "allowed": true, "message": "Access granted", "redirect": "/app" }
 *    - Click "Request Access"
 *    - Expected: Loading spinner appears, then success modal with check icon
 *    - Expected: Card transitions to green border (gate-open animation)
 *    - Expected: "Enter Site" button navigates to /app
 *    - Expected: Escape key closes modal
 *
 * 2. BLOCKED RESPONSE TEST
 *    - Mock /api/firewall-check to return: { "allowed": false, "message": "Blocked by firewall: IP not whitelisted" }
 *    - Click "Request Access"
 *    - Expected: Loading spinner appears, then card shakes
 *    - Expected: Toast appears in top-right with "Access Denied" and message
 *    - Expected: "Retry" in toast re-triggers request
 *    - Expected: Button is re-enabled after failure
 *
 * 3. TIMEOUT TEST
 *    - Mock /api/firewall-check to delay > 10 seconds
 *    - Click "Request Access"
 *    - Expected: After 10s, request aborts
 *    - Expected: Toast shows "Request timed out. Please try again."
 *
 * 4. NETWORK ERROR TEST
 *    - Disable network or mock fetch to throw
 *    - Click "Request Access"
 *    - Expected: Toast shows "Network error. Please check your connection."
 *
 * 5. RESET TEST
 *    - After any state (allowed/blocked), click "Reset"
 *    - Expected: UI returns to initial state, toasts cleared, modal closed
 *
 * 6. ACCESSIBILITY TEST
 *    - Tab through all interactive elements
 *    - Expected: Clear focus rings on all buttons
 *    - Expected: Screen reader announces loading state
 *    - Expected: Modal traps focus when open
 *    - Expected: Toast announced as alert
 */
