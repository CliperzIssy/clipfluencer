'use client'

import { useState } from 'react'
import VideoUploader from '@/components/VideoUploader'
import VideoPlayer from '@/components/VideoPlayer'
import ClipsList from '@/components/ClipsList'
import ActivityLog from '@/components/ActivityLog'
import DebugConsole from '@/components/DebugConsole'
import VideoChat from '@/components/VideoChat'

interface LogEntry {
  message: string
  timestamp: Date
  type: 'info' | 'success' | 'error'
}

type ViewMode = 'clips' | 'chat'

export default function Home() {
  const [videoPath, setVideoPath] = useState<string>('')
  const [videoMetadata, setVideoMetadata] = useState<any>(null)
  const [transcript, setTranscript] = useState<any>(null)
  const [clips, setClips] = useState<any[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('clips')

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { message, timestamp: new Date(), type }])
  }

  const handleVideoUploaded = (path: string, metadata?: any) => {
    setVideoPath(path)
    setVideoMetadata(metadata)
    setTranscript(null)
    setClips([])

    // Log video metadata if available
    if (metadata) {
      addLog(`Video uploaded: "${metadata.title || 'Unknown'}"`, 'success')
      if (metadata.duration) {
        const mins = Math.floor(metadata.duration / 60)
        const secs = metadata.duration % 60
        addLog(`Duration: ${mins}m ${secs}s`, 'info')
      }
      if (metadata.uploader) {
        addLog(`Channel: ${metadata.uploader}`, 'info')
      }
    } else {
      addLog('Video uploaded successfully', 'success')
    }
  }

  const handleFindClips = async () => {
    if (!videoPath) return

    setIsProcessing(true)
    setCurrentStep('Stage 1: Transcribing video...')
    addLog('Starting advanced AI analysis...')

    try {
      // Use v6 visual + audio fusion system
      addLog('🎤 AssemblyAI transcribing audio with Audio Intelligence...')

      // First transcribe
      const transcriptRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath }),
      })
      const transcriptData = await transcriptRes.json()

      if (transcriptData.error) {
        throw new Error(transcriptData.error)
      }

      setCurrentStep('Stage 2: AI analyzing with visual + audio fusion...')
      addLog('🎬 Gemini analyzing visuals...')
      addLog('🧠 GPT-5 fusing audio + visual for intelligent clip selection...')

      // Then analyze with new v6 system (visual + audio fusion)
      const analyzeRes = await fetch('/api/analyze-v6', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptData,
          metadata: videoMetadata,
          videoPath: videoPath
        }),
      })
      const analysisData = await analyzeRes.json()

      // Check for errors
      if (analysisData.error) {
        throw new Error(analysisData.error + (analysisData.details ? ': ' + analysisData.details : ''))
      }

      setCurrentStep('Stage 3: Selecting best clips...')
      addLog('🎯 AI selected clips using visual + audio context...')

      // Extract transcript and clips from v6 analysis
      const clipsData = analysisData

      setTranscript(transcriptData)
      addLog(`Transcription complete: ${transcriptData?.text?.length || 0} characters`, 'success')

      // Log AssemblyAI costs and features
      if (transcriptData?.metadata?.estimatedCostUSD) {
        addLog(`AssemblyAI cost: $${transcriptData.metadata.estimatedCostUSD.toFixed(4)}`, 'info')
      }

      // Log Audio Intelligence features
      if (transcriptData?.language) {
        addLog(`Language detected: ${transcriptData.language.code} (${(transcriptData.language.confidence * 100).toFixed(1)}% confidence)`, 'info')
      }

      if (transcriptData?.sentiment_analysis && transcriptData.sentiment_analysis.length > 0) {
        const sentiments = transcriptData.sentiment_analysis.reduce((acc: any, curr: any) => {
          acc[curr.sentiment] = (acc[curr.sentiment] || 0) + 1
          return acc
        }, {})
        addLog(`Sentiment: ${Object.entries(sentiments).map(([s, c]) => `${s}: ${c}`).join(', ')}`, 'info')
      }

      if (transcriptData?.entities && transcriptData.entities.length > 0) {
        addLog(`Detected ${transcriptData.entities.length} entities (people, places, organizations)`, 'info')
      }

      if (transcriptData?.key_phrases && transcriptData.key_phrases.results && transcriptData.key_phrases.results.length > 0) {
        const topPhrases = transcriptData.key_phrases.results.slice(0, 3).map((h: any) => h.text).join(', ')
        addLog(`Key phrases: ${topPhrases}`, 'info')
      }

      if (transcriptData?.topics && transcriptData.topics.summary) {
        const topTopics = Object.entries(transcriptData.topics.summary)
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 3)
          .map(([topic]: [string, any]) => topic.split('>').pop()?.trim())
          .join(', ')
        if (topTopics) {
          addLog(`Topics: ${topTopics}`, 'info')
        }
      }

      if (transcriptData?.summary) {
        addLog(`Summary: ${transcriptData.summary.substring(0, 100)}...`, 'info')
      }

      // Log the analysis details
      if (clipsData.contentAnalysis) {
        addLog(`Content type: ${clipsData.contentAnalysis.contentType || 'Analyzed'}`, 'info')
        addLog(`Target audience: ${clipsData.contentAnalysis.targetAudience || 'General'}`, 'info')
        addLog(`Tone: ${clipsData.contentAnalysis.overallTone || 'Mixed'}`, 'info')
      }

      if (clipsData.clips) {
        addLog(`✅ Found ${clipsData.clips.length} best clips!`, 'success')
        if (clipsData.selectionReasoning) {
          // selectionReasoning is an object with strategy, diversityNotes, etc.
          const strategy = typeof clipsData.selectionReasoning === 'string'
            ? clipsData.selectionReasoning
            : clipsData.selectionReasoning.strategy
          if (strategy) {
            addLog(`Strategy: ${strategy.substring(0, 100)}...`, 'info')
          }
        }
      }

      // Log GPT-5 costs
      if (clipsData.metadata?.costs) {
        const assemblyAICost = transcriptData?.metadata?.estimatedCostUSD || 0
        const gpt5Cost = clipsData.metadata.costs.totalCostUSD
        const totalCost = assemblyAICost + gpt5Cost
        addLog(`GPT-5 cost: $${gpt5Cost.toFixed(4)} (${clipsData.metadata.costs.totalTokens.toLocaleString()} tokens)`, 'info')
        addLog(`💰 Total API cost: $${totalCost.toFixed(4)}`, 'success')
      }

      setCurrentStep('Analysis complete!')

      // Validate clips array
      if (!clipsData.clips || !Array.isArray(clipsData.clips)) {
        console.error('Invalid response from Gemini API:', clipsData)
        throw new Error('Invalid response format from Gemini analysis')
      }

      setClips(clipsData.clips)
      addLog(`Found ${clipsData.clips.length} best clips!`, 'success')

      setCurrentStep('Done!')
      addLog('Analysis complete - ready to export clips', 'success')
    } catch (error) {
      console.error('Error:', error)
      addLog('Error processing video', 'error')
      alert('Error processing video. Check console for details.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreateClip = async (clip: any, index: number, captionStyle: string, captionText: string, cropStyle: string) => {
    // Set clip to exporting state
    setClips(prevClips => {
      const newClips = [...prevClips]
      newClips[index] = { ...newClips[index], exporting: true }
      return newClips
    })

    const styleLabel = captionStyle === 'none' ? 'without captions' : `with ${captionStyle} captions`
    const clipTypeLabel = clip.clipType === 'multi-scene' ? ' (multi-scene)' : ''
    const cropLabel = cropStyle === 'blur-bars' ? ' with blur bars' : ' center-cropped'
    addLog(`Exporting Clip ${index + 1}${clipTypeLabel} to 9:16${cropLabel} ${styleLabel}...`)

    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath,
          startTime: clip.startTime,
          endTime: clip.endTime,
          clipNumber: clip.clipNumber || index,
          captionStyle,
          customCaptionText: captionText || clip.transcript,
          transcript: transcript || null,
          clipType: clip.clipType || 'single-scene',
          scenes: clip.scenes || null,
          cropStyle, // Add cropStyle parameter
          title: clip.potentialTitle || clip.title || '', // Add title from GPT-5 analysis
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create clip')
      }

      const data = await res.json()

      // Update clip with exported path
      setClips(prevClips => {
        const newClips = [...prevClips]
        newClips[index] = {
          ...newClips[index],
          exporting: false,
          exportedPath: data.outputPath
        }
        return newClips
      })

      const duration = Math.round(clip.endTime - clip.startTime)
      addLog(`Clip ${index + 1} exported successfully (${duration}s)`, 'success')
    } catch (error) {
      console.error('Error:', error)
      addLog(`Failed to export Clip ${index + 1}`, 'error')
      alert('Error creating clip. Check console for details.')

      // Reset exporting state on error
      setClips(prevClips => {
        const newClips = [...prevClips]
        newClips[index] = { ...newClips[index], exporting: false }
        return newClips
      })
    }
  }

  return (
    <div className="min-h-screen p-8">
      <DebugConsole />
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Clipfluencer
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Upload a video and let AI find the best clips for short-form content
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Upload & Video Player */}
          <div className="space-y-6">
            <VideoUploader onVideoUploaded={handleVideoUploaded} />
            {videoPath && (
              <div>
                <VideoPlayer videoPath={videoPath} />
                <button
                  onClick={handleFindClips}
                  disabled={isProcessing}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isProcessing ? currentStep : 'Find Best Clips'}
                </button>
              </div>
            )}
            <ActivityLog logs={logs} />
          </div>

          {/* Right Column - Clips/Chat Toggle */}
          <div className="flex flex-col h-full">
            {/* Toggle Buttons */}
            {videoPath && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setViewMode('clips')}
                  className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
                    viewMode === 'clips'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  📹 Best Clips
                  {clips.length > 0 && (
                    <span className="ml-2 bg-gray-700 px-2 py-1 rounded text-xs">
                      {clips.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setViewMode('chat')}
                  className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
                    viewMode === 'chat'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  💬 Chat with Video
                  <span className="ml-2 text-xs opacity-75">New!</span>
                </button>
              </div>
            )}

            {/* Content based on view mode */}
            {viewMode === 'clips' ? (
              <div>
                {clips.length > 0 && (
                  <ClipsList
                    clips={clips}
                    onCreateClip={handleCreateClip}
                    videoPath={videoPath}
                    transcript={transcript}
                  />
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                {videoPath ? (
                  <VideoChat
                    videoId={videoPath} // Pass full path, component will handle extraction
                    videoDuration={videoMetadata?.duration}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700">
                    <p className="text-gray-400">Upload a video to start chatting</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
