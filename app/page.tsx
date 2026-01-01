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

  // Refs for focus management
  const requestButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const toastIdRef = useRef(0)

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
      // TODO: Replace with actual API endpoint when backend is ready
      const res = await fetchWithTimeout(
        '/api/firewall-check',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: '/', clientHint: 'test' }),
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
  }, [addToast])

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
