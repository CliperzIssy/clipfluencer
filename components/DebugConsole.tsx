'use client'

import { useEffect, useState, useRef } from 'react'

interface LogEntry {
  id: string
  timestamp: string
  type: string
  message: string
  data?: any
}

export default function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Connect to Server-Sent Events for real-time logs
    const eventSource = new EventSource('/api/logs')

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'initial') {
          setLogs(data.logs)
        } else if (data.type === 'update') {
          setLogs((prev) => {
            const newLogs = [...prev, ...data.logs]
            // Keep only last 500 logs
            return newLogs.slice(-500)
          })
        }
      } catch (error) {
        console.error('Failed to parse log data:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      eventSource.close()
      // Retry connection after 5 seconds
      setTimeout(() => {
        window.location.reload()
      }, 5000)
    }

    return () => {
      eventSource.close()
    }
  }, [])

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const getLogColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-400 bg-red-900/20'
      case 'warning':
        return 'text-yellow-400 bg-yellow-900/20'
      case 'success':
        return 'text-green-400 bg-green-900/20'
      case 'info':
        return 'text-blue-400 bg-blue-900/20'
      case 'api':
        return 'text-purple-400 bg-purple-900/20'
      case 'gemini':
        return 'text-cyan-400 bg-cyan-900/20'
      case 'openai':
        return 'text-emerald-400 bg-emerald-900/20'
      default:
        return 'text-gray-400 bg-gray-900/20'
    }
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-lg shadow-lg z-50 flex items-center gap-2"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm">Debug Console</span>
        {logs.length > 0 && (
          <span className="bg-blue-600 text-xs px-2 py-1 rounded-full">
            {logs.length}
          </span>
        )}
      </button>

      {/* Console Panel */}
      {isOpen && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 h-96 z-40 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-3 border-b border-gray-700 bg-gray-800">
            <h3 className="text-sm font-semibold text-white">
              System Debug Console
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-xs px-2 py-1 rounded ${
                  autoScroll
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={clearLogs}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
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

          {/* Logs */}
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No logs yet. Waiting for activity...
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded ${getLogColor(log.type)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 text-xs">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className="font-semibold uppercase text-xs">
                        {log.type}:
                      </span>
                      <span className="flex-1">{log.message}</span>
                    </div>
                    {log.data && (
                      <pre className="mt-1 ml-4 text-xs opacity-75 overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}