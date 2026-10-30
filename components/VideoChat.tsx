'use client'

import { useState, useRef, useEffect } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  results?: any[]
  timestamp?: number
}

interface VideoChatProps {
  videoId: string
  videoDuration?: number
  onJumpToTimestamp?: (timestamp: number) => void
}

export default function VideoChat({ videoId, videoDuration, onJumpToTimestamp }: VideoChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi! I analyze videos frame-by-frame for precise visual search.\n\nI can find specific moments like:\n• "Person in red shirt waving"\n• "Someone pointing at screen"\n• "Man with glasses smiling"\n• "Text appears on monitor"\n\nBe specific about what you SEE!',
      timestamp: Date.now()
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [blueprintStatus, setBlueprintStatus] = useState<'checking' | 'creating' | 'ready' | 'error'>('checking')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check if blueprint exists
  useEffect(() => {
    checkBlueprint()
  }, [videoId])

  const checkBlueprint = async () => {
    try {
      const filename = videoId.split('/').pop() || videoId

      // Check if frame-by-frame blueprint exists
      const response = await fetch(`/api/blueprints`)
      const data = await response.json()

      // Look for frame blueprint (new approach)
      const frameBlueprint = data.blueprints?.find((b: any) =>
        b.videoId === filename || b.videoId === `frame-blueprint-${filename}`
      )

      if (frameBlueprint) {
        setBlueprintStatus('ready')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '✅ Video already analyzed! You can ask questions like:\n• "Find person in red shirt waving"\n• "Show when someone points at the screen"\n• "Find all moments with text on screen"',
          timestamp: Date.now()
        }])
      } else {
        // Blueprint doesn't exist - create it in background
        setBlueprintStatus('creating')
        createBlueprint()
      }
    } catch (error) {
      console.error('Error checking blueprint:', error)
      setBlueprintStatus('error')
    }
  }

  const createBlueprint = async () => {
    try {
      // Extract the actual filename from the path for use as videoId
      const filename = videoId.split('/').pop() || videoId
      const actualVideoPath = videoId

      console.log('Creating frame-by-frame blueprint for:', actualVideoPath)

      // Step 1: Get AssemblyAI transcript for audio (optional but helpful)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🎤 Step 1: Transcribing audio with AssemblyAI...',
        timestamp: Date.now()
      }])

      let transcriptData = null
      try {
        const transcriptRes = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoPath: actualVideoPath })
        })

        transcriptData = await transcriptRes.json()
        console.log('✅ Audio transcription complete')
      } catch (error) {
        console.warn('Audio transcription failed, continuing with visual only:', error)
      }

      // Step 2: Create frame-by-frame visual analysis
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🎬 Step 2: Analyzing EVERY frame with Gemini 2.5 Flash...\n\n⏱️ Processing time: ~1-2 minutes\n(Single request - no chunking needed!)\n\nThis enables queries like "person in red shirt waving"',
        timestamp: Date.now()
      }])

      const response = await fetch('/api/create-frame-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: actualVideoPath,
          videoId: filename,
          assemblyAITranscript: transcriptData // Optional audio data
        })
      })

      const data = await response.json()
      console.log('Frame blueprint API response:', response.status, data)

      if (response.ok && data.success) {
        setBlueprintStatus('ready')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ Complete frame-by-frame analysis done!\n\n📊 Analyzed: ${data.blueprint.frameCount} frames\n⏱️ Duration: ${data.blueprint.duration} seconds\n💰 Cost: $${data.blueprint.cost.toFixed(3)}\n\nNow you can search for ANYTHING:\n• "Person in red shirt waving"\n• "Someone pointing at screen"\n• "Text appears on monitor"\n• "Man with glasses smiling"\n• "Two people talking"\n\nTry a specific visual query!`,
          timestamp: Date.now()
        }])
      } else {
        console.error('Frame blueprint creation failed:', data)
        const errorMsg = data?.error || data?.details || data?.message || 'Frame analysis failed'
        throw new Error(errorMsg)
      }
    } catch (error: any) {
      console.error('Error creating blueprint:', error)
      setBlueprintStatus('error')

      const errorMessage = error.message.includes('too large')
        ? '❌ Video file is too large. Please try a shorter video (under 10 minutes).'
        : error.message.includes('not found')
        ? '❌ Could not find video file. Please make sure it uploaded correctly.'
        : `❌ Failed to analyze video: ${error.message}`

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now()
      }])
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading || blueprintStatus !== 'ready') return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const filename = videoId.split('/').pop() || videoId

      // Use the new frame-by-frame query endpoint
      const response = await fetch('/api/query-frame-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: filename,
          query: input
        })
      })

      const data = await response.json()

      if (data.success) {
        // Format results for display
        const formattedResults = data.results?.map((r: any) => ({
          timestamp: r.timestamp,
          startTime: r.timestamp,
          endTime: r.timestamp + 1,
          description: r.description,
          type: 'visual_match',
          confidence: r.confidence || 0.9,
          context: null
        })) || []

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.interpretation || `Found ${formattedResults.length} frames matching your query:`,
          results: formattedResults,
          timestamp: Date.now()
        }

        setMessages(prev => [...prev, assistantMessage])

        if (formattedResults.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `No matches found for "${input}". Try:\n• Different wording (e.g., "man gesturing" instead of "person pointing")\n• Simpler queries (e.g., "red shirt" instead of "person in red shirt waving")\n• Checking if the action actually happens in the video`,
            timestamp: Date.now()
          }])
        }
      } else {
        throw new Error(data.error || 'Search failed')
      }
    } catch (error: any) {
      console.error('Search error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Search failed: ${error.message}\n\nTry a simpler query like "red shirt" or "waving"`,
        timestamp: Date.now()
      }])
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100) // Centiseconds (2 digits)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          💬 Chat with Video
          {blueprintStatus === 'creating' && (
            <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded">
              Analyzing...
            </span>
          )}
          {blueprintStatus === 'ready' && (
            <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
              Ready
            </span>
          )}
          {blueprintStatus === 'error' && (
            <span className="text-xs bg-red-600 text-white px-2 py-1 rounded">
              Error
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Ask anything about this video (e.g., "Find the first goal")
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>

              {/* Display results if available */}
              {message.results && message.results.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.results.map((result, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-700 rounded p-3 cursor-pointer hover:bg-gray-600 transition"
                      onClick={() => onJumpToTimestamp?.(result.timestamp)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-blue-400 font-mono">
                          {formatTime(result.timestamp)}
                        </span>
                        <span className="text-xs bg-gray-600 px-2 py-1 rounded">
                          {result.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{result.description}</p>
                      {result.context && (
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTime(result.startTime)} - {formatTime(result.endTime)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {message.results && message.results.length === 0 && (
                <p className="text-sm text-gray-400 mt-2">No results found.</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span className="text-gray-400">Searching...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        {blueprintStatus === 'creating' && (
          <div className="mb-3 bg-yellow-900 border border-yellow-600 rounded p-3 text-sm text-yellow-200">
            ⏳ Analyzing video with Gemini 2.5 Flash... This takes 1-2 minutes. You'll be notified when ready!
          </div>
        )}
        {blueprintStatus === 'error' && (
          <div className="mb-3 bg-red-900 border border-red-600 rounded p-3 text-sm text-red-200">
            ❌ Failed to analyze video. Please refresh the page or try again.
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              blueprintStatus === 'ready'
                ? 'Ask about the video...'
                : blueprintStatus === 'creating'
                ? 'Please wait for analysis to complete...'
                : 'Chat unavailable'
            }
            disabled={loading || blueprintStatus !== 'ready'}
            className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={loading || blueprintStatus !== 'ready' || !input.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Searching...' : 'Send'}
          </button>
        </div>

        {/* Example queries */}
        {messages.length === 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-gray-400">Try:</span>
            {[
              'Person in red shirt waving',
              'Someone pointing at screen',
              'Text appears on monitor',
              'Two people talking'
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded hover:bg-gray-600 transition"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  )
}
