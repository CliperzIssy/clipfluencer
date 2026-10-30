import { NextRequest, NextResponse } from 'next/server'

// Store logs in memory (in production, use Redis or similar)
let logBuffer: any[] = []
const MAX_LOGS = 1000
let logCounter = 0

// Add log to buffer
export function addLog(type: string, message: string, data?: any) {
  // Create unique ID using timestamp + counter + random
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const id = `${timestamp}-${logCounter++}-${random}`

  const log = {
    timestamp: new Date(timestamp).toISOString(),
    type,
    message,
    data,
    id
  }

  logBuffer.push(log)

  // Keep buffer size limited
  if (logBuffer.length > MAX_LOGS) {
    logBuffer = logBuffer.slice(-MAX_LOGS)
  }

  // Also log to console for terminal output
  const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '📝'
  console.log(`${prefix} [${new Date().toLocaleTimeString()}] ${message}`)
  if (data) {
    console.log('   Data:', JSON.stringify(data, null, 2))
  }
}

// Server-Sent Events endpoint for real-time logs
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  // Track the last sent index to avoid duplicates
  let lastSentIndex = Math.max(0, logBuffer.length - 50)

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial logs
      const initialLogs = logBuffer.slice(lastSentIndex)
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'initial',
          logs: initialLogs
        })}\n\n`)
      )
      lastSentIndex = logBuffer.length

      // Set up interval to send new logs
      const interval = setInterval(() => {
        // Only send logs that haven't been sent yet
        if (logBuffer.length > lastSentIndex) {
          const newLogs = logBuffer.slice(lastSentIndex)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'update',
              logs: newLogs
            })}\n\n`)
          )
          lastSentIndex = logBuffer.length
        }

        // Send heartbeat to keep connection alive
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 1000) // Check every second

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// POST endpoint to add logs from other API routes
export async function POST(request: NextRequest) {
  try {
    const { type, message, data } = await request.json()
    addLog(type, message, data)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to add log' },
      { status: 500 }
    )
  }
}

// Export the addLog function for use in other modules
export const logger = { addLog }