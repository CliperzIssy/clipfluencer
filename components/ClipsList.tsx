'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Scoring {
  hook?: {
    grade: string
    feedback: string
  }
  flow?: {
    grade: string
    feedback: string
  }
  value?: {
    grade: string
    feedback: string
  }
  trend?: {
    grade: string
    feedback: string
  }
}

interface Clip {
  startTime: number
  endTime: number
  title?: string
  description: string
  reasoning?: string
  hookAnalysis?: string
  outroAnalysis?: string
  overallScore?: number
  viralScore?: number // New v2 format
  viralityScore?: number // Legacy support
  scoring?: Scoring
  exportedPath?: string
  exporting?: boolean
  captionStyle?: string
  wordCount?: number
  contentType?: string
  contentWarnings?: string[]
  // New v3 fields
  clipType?: 'single-scene' | 'multi-scene'
  scenes?: Array<{
    start?: number
    end?: number
    startTime?: number
    endTime?: number
    description: string
    transition?: string
  }>
  visualScore?: number
  audioScore?: number
  emotionalScore?: number
  expectedReach?: string
  captions?: Array<{
    text: string
    startTime: number
    endTime: number
    style?: any
  }>
}

interface ClipsListProps {
  clips: Clip[]
  onCreateClip: (clip: Clip, index: number, captionStyle: string, captionText: string, cropStyle: string) => void
  videoPath?: string
  transcript?: any
}

export default function ClipsList({ clips, onCreateClip, videoPath, transcript }: ClipsListProps) {
  const router = useRouter()
  const [captionStyles, setCaptionStyles] = useState<string[]>(
    clips.map(() => 'bold-center')
  )
  const [captionTexts, setCaptionTexts] = useState<string[]>(
    clips.map(() => '')
  )
  const [cropStyles, setCropStyles] = useState<string[]>(
    clips.map(() => 'center-crop') // Default: center-crop
  )
  const [expandedClips, setExpandedClips] = useState<Set<number>>(new Set())

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100) // Centiseconds (2 digits)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  const handleStyleChange = (index: number, style: string) => {
    const newStyles = [...captionStyles]
    newStyles[index] = style
    setCaptionStyles(newStyles)
  }

  const handleCropStyleChange = (index: number, style: string) => {
    const newStyles = [...cropStyles]
    newStyles[index] = style
    setCropStyles(newStyles)
  }

  const handleCaptionTextChange = (index: number, text: string) => {
    const newTexts = [...captionTexts]
    newTexts[index] = text
    setCaptionTexts(newTexts)
  }

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedClips)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedClips(newExpanded)
  }

  const handleEditClip = async (clip: Clip, index: number) => {
    try {
      const clipId = `clip_${index}_${Date.now()}`

      console.log('🎬 Opening editor for clip:', clipId)
      console.log('📹 Preparing clip data (NO preview render - edit source directly)')

      // Build simplified segment list - just source video timestamps
      // Timeline position is derived from array order (no separate timelineStart needed)
      let segments: Array<{
        id: string
        sourceStart: number
        sourceEnd: number
        description: string
      }>

      if (clip.clipType === 'multi-scene' && clip.scenes && clip.scenes.length > 0) {
        // Multi-scene: convert each scene to simplified segment format
        segments = clip.scenes
          .filter((scene) => {
            const start = scene.startTime ?? scene.start ?? 0
            const end = scene.endTime ?? scene.end ?? start
            const isValid = end > start
            if (!isValid) {
              console.warn(`⚠️ Skipping invalid scene: ${start}s - ${end}s`)
            }
            return isValid
          })
          .map((scene, idx) => ({
            id: `segment-${idx}`,
            sourceStart: scene.startTime ?? scene.start ?? 0,
            sourceEnd: scene.endTime ?? scene.end ?? 0,
            description: scene.description || `Scene ${idx + 1}`
          }))

        console.log(`📐 ${segments.length} segments prepared:`)
        segments.forEach((seg, i) => {
          const duration = seg.sourceEnd - seg.sourceStart
          console.log(`   ${i + 1}. ${seg.sourceStart.toFixed(1)}s - ${seg.sourceEnd.toFixed(1)}s (${duration.toFixed(1)}s) - ${seg.description}`)
        })
      } else {
        // Single-scene: one segment covering the whole clip
        segments = [{
          id: 'segment-0',
          sourceStart: clip.startTime,
          sourceEnd: clip.endTime,
          description: clip.description || 'Main clip'
        }]
        const duration = clip.endTime - clip.startTime
        console.log(`📐 Single segment: ${clip.startTime.toFixed(1)}s - ${clip.endTime.toFixed(1)}s (${duration.toFixed(1)}s)`)
      }

      // Calculate total duration
      const totalDuration = segments.reduce((sum, seg) => sum + (seg.sourceEnd - seg.sourceStart), 0)
      console.log(`✅ Total clip duration: ${totalDuration.toFixed(1)}s`)

      // Build thumbnail base URL (NO offset needed - thumbnails use source timestamps directly)
      let thumbnailBaseUrl: string | undefined

      if (videoPath && (videoPath.includes('r2.cloudflarestorage') || videoPath.includes('pub-'))) {
        const urlParts = videoPath.split('/uploads/')
        if (urlParts.length === 2) {
          const videoId = urlParts[1].replace('.mp4', '')
          thumbnailBaseUrl = `${urlParts[0]}/thumbnails/${videoId}`
          console.log('🎨 Thumbnail base URL:', thumbnailBaseUrl)
        }
      }

      // Clean up old localStorage entries
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('clip_')) {
          try {
            const clipTimestamp = parseInt(key.split('_')[2])
            if (clipTimestamp < sevenDaysAgo) {
              localStorage.removeItem(key)
            }
          } catch (e) {
            // Skip invalid keys
          }
        }
      })

      // Store SIMPLIFIED clip data - single coordinate system
      const clipData = {
        id: clipId,
        title: clip.title || `Clip ${index + 1}`,
        sourceVideoUrl: videoPath || '',
        thumbnailBaseUrl,
        segments, // Simple: just { id, sourceStart, sourceEnd, description }
        captionStyle: captionStyles[index] || 'bold-center',
        cropStyle: cropStyles[index] || 'center-crop',
        description: clip.description,
        // Transcript stored separately if needed
        hasTranscript: !!transcript,
      }

      // Save to localStorage
      try {
        localStorage.setItem(`clip_${clipId}`, JSON.stringify(clipData))
        // Store transcript separately (can be large)
        if (transcript) {
          localStorage.setItem(`clip_${clipId}_transcript`, JSON.stringify(transcript))
        }
        console.log('✅ Clip saved to localStorage (size:', JSON.stringify(clipData).length, 'bytes)')
      } catch (e: any) {
        if (e.name === 'QuotaExceededError') {
          console.error('❌ LocalStorage quota exceeded! Clearing old clips...')
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('clip_')) localStorage.removeItem(key)
          })
          localStorage.setItem(`clip_${clipId}`, JSON.stringify(clipData))
        } else {
          throw e
        }
      }

      console.log('✅ Ready to edit!')
      console.log('   Source video:', clipData.sourceVideoUrl)
      console.log('   Segments:', clipData.segments.length)
      console.log('   Total duration:', totalDuration.toFixed(1), 's')

      // Navigate to editor (no preview render needed!)
      router.push(`/editor/${clipId}`)
    } catch (error: any) {
      console.error('❌ Error opening editor:', error)
      alert(`Failed to open editor: ${error.message}`)
    }
  }

  const getGradeColor = (grade: string) => {
    if (!grade) return 'text-gray-400'
    const letter = grade.charAt(0)
    switch (letter) {
      case 'A': return 'text-green-400'
      case 'B': return 'text-blue-400'
      case 'C': return 'text-yellow-400'
      case 'D': return 'text-orange-400'
      case 'F': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const captionStyleOptions = [
    { value: 'bold-center', label: 'Bold Center (TikTok)', emoji: '💥' },
    { value: 'highlight', label: 'Word Highlight', emoji: '⚡' },
    { value: 'minimal', label: 'Minimal White', emoji: '✨' },
    { value: 'none', label: 'No Captions', emoji: '🎬' },
  ]

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">Best Clips Found</h2>
      <div className="space-y-6">
        {clips.map((clip, index) => {
          const isExpanded = expandedClips.has(index)
          const score = clip.viralScore || clip.overallScore || clip.viralityScore || 0

          return (
            <div
              key={index}
              className="bg-gray-700 rounded-lg p-4"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg">
                  {clip.title ? `"${clip.title}"` : `Clip ${index + 1}`}
                </h3>
                <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">
                  Score: {score.toFixed(1)}/10
                </span>
              </div>

              {/* Description */}
              <p className="text-gray-300 text-sm mb-2">{clip.description}</p>

              {/* Multi-Scene Indicator */}
              {clip.clipType === 'multi-scene' && clip.scenes && (
                <div className="bg-purple-600/20 border border-purple-500/30 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-400 text-sm font-semibold">
                      🎬 Multi-Scene Clip ({clip.scenes.length} scenes)
                    </span>
                    <span className="text-xs text-purple-300">
                      Total: {Math.round(clip.endTime - clip.startTime)}s
                    </span>
                  </div>
                  <div className="space-y-1">
                    {clip.scenes.map((scene, i) => {
                      const sceneStart = scene.startTime ?? scene.start ?? 0
                      const sceneEnd = scene.endTime ?? scene.end ?? 0
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                          <span className="text-purple-400">Scene {i + 1}:</span>
                          <span>[{Math.round(sceneStart)}s - {Math.round(sceneEnd)}s]</span>
                          {i < clip.scenes!.length - 1 && (
                            <span className="text-purple-300">→ {scene.transition || 'cut'}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Content Warnings if any */}
              {clip.contentWarnings && clip.contentWarnings.length > 0 && (
                <div className="flex gap-2 mb-2">
                  {clip.contentWarnings.map((warning, i) => (
                    <span key={i} className="bg-orange-600/20 text-orange-400 text-xs px-2 py-1 rounded">
                      ⚠️ {warning}
                    </span>
                  ))}
                </div>
              )}

              {/* Advanced Scores (V3) */}
              {(clip.visualScore || clip.audioScore || clip.emotionalScore) && (
                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  {clip.visualScore && (
                    <div className="bg-gray-800 rounded p-2 text-center">
                      <div className="text-gray-400">Visual</div>
                      <div className="text-lg font-bold text-blue-400">{clip.visualScore}/10</div>
                    </div>
                  )}
                  {clip.audioScore && (
                    <div className="bg-gray-800 rounded p-2 text-center">
                      <div className="text-gray-400">Audio</div>
                      <div className="text-lg font-bold text-green-400">{clip.audioScore}/10</div>
                    </div>
                  )}
                  {clip.emotionalScore && (
                    <div className="bg-gray-800 rounded p-2 text-center">
                      <div className="text-gray-400">Emotion</div>
                      <div className="text-lg font-bold text-red-400">{clip.emotionalScore}/10</div>
                    </div>
                  )}
                </div>
              )}

              {/* Expected Reach */}
              {clip.expectedReach && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-gray-400">Expected reach:</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    clip.expectedReach === 'extreme' ? 'bg-red-600/20 text-red-400' :
                    clip.expectedReach === 'very-high' ? 'bg-orange-600/20 text-orange-400' :
                    'bg-blue-600/20 text-blue-400'
                  }`}>
                    {clip.expectedReach.toUpperCase()}
                  </span>
                </div>
              )}

              {/* Content Type & Word Count */}
              {(clip.wordCount || clip.contentType) && (
                <div className="flex gap-3 text-xs text-gray-400 mb-3">
                  {clip.contentType && (
                    <span className="bg-gray-600 px-2 py-1 rounded">
                      📝 {clip.contentType}
                    </span>
                  )}
                  {clip.wordCount && (
                    <span className="bg-gray-600 px-2 py-1 rounded">
                      💬 ~{clip.wordCount} words
                    </span>
                  )}
                </div>
              )}

              {/* Multi-Category Scoring (OpusClip-style) */}
              {clip.scoring && (
                <div className="mb-4 bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {/* Hook */}
                    {clip.scoring.hook && (
                      <div className="text-center">
                        <div className="text-xs text-gray-400">Hook</div>
                        <div className={`text-lg font-bold ${getGradeColor(clip.scoring.hook.grade)}`}>
                          {clip.scoring.hook.grade}
                        </div>
                      </div>
                    )}
                    {/* Flow */}
                    {clip.scoring.flow && (
                      <div className="text-center">
                        <div className="text-xs text-gray-400">Flow</div>
                        <div className={`text-lg font-bold ${getGradeColor(clip.scoring.flow.grade)}`}>
                          {clip.scoring.flow.grade}
                        </div>
                      </div>
                    )}
                    {/* Value */}
                    {clip.scoring.value && (
                      <div className="text-center">
                        <div className="text-xs text-gray-400">Value</div>
                        <div className={`text-lg font-bold ${getGradeColor(clip.scoring.value.grade)}`}>
                          {clip.scoring.value.grade}
                        </div>
                      </div>
                    )}
                    {/* Trend */}
                    {clip.scoring.trend && (
                      <div className="text-center">
                        <div className="text-xs text-gray-400">Trend</div>
                        <div className={`text-lg font-bold ${getGradeColor(clip.scoring.trend.grade)}`}>
                          {clip.scoring.trend.grade}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Show Feedback Button */}
                  <button
                    onClick={() => toggleExpanded(index)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {isExpanded ? '▼ Hide Detailed Feedback' : '▶ Show Detailed Feedback'}
                  </button>

                  {/* Detailed Feedback (Expandable) */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3 text-xs">
                      {clip.scoring.hook && (
                        <div>
                          <div className={`font-semibold ${getGradeColor(clip.scoring.hook.grade)}`}>
                            Hook ({clip.scoring.hook.grade})
                          </div>
                          <div className="text-gray-300 mt-1">{clip.scoring.hook.feedback}</div>
                        </div>
                      )}
                      {clip.scoring.flow && (
                        <div>
                          <div className={`font-semibold ${getGradeColor(clip.scoring.flow.grade)}`}>
                            Flow ({clip.scoring.flow.grade})
                          </div>
                          <div className="text-gray-300 mt-1">{clip.scoring.flow.feedback}</div>
                        </div>
                      )}
                      {clip.scoring.value && (
                        <div>
                          <div className={`font-semibold ${getGradeColor(clip.scoring.value.grade)}`}>
                            Value ({clip.scoring.value.grade})
                          </div>
                          <div className="text-gray-300 mt-1">{clip.scoring.value.feedback}</div>
                        </div>
                      )}
                      {clip.scoring.trend && (
                        <div>
                          <div className={`font-semibold ${getGradeColor(clip.scoring.trend.grade)}`}>
                            Trend ({clip.scoring.trend.grade})
                          </div>
                          <div className="text-gray-300 mt-1">{clip.scoring.trend.feedback}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* New V2 Analysis Fields */}
              {(clip.hookAnalysis || clip.outroAnalysis || clip.reasoning) && (
                <div className="mb-4 bg-gray-800 rounded-lg p-3 space-y-2 text-sm">
                  {/* Hook & Outro Analysis */}
                  {(clip.hookAnalysis || clip.outroAnalysis) && (
                    <div className="grid grid-cols-2 gap-3">
                      {clip.hookAnalysis && (
                        <div>
                          <div className="font-semibold text-green-400 text-xs mb-1">
                            🎬 Hook Analysis
                          </div>
                          <div className="text-gray-300 text-xs">
                            {clip.hookAnalysis}
                          </div>
                        </div>
                      )}
                      {clip.outroAnalysis && (
                        <div>
                          <div className="font-semibold text-blue-400 text-xs mb-1">
                            🎭 Outro Analysis
                          </div>
                          <div className="text-gray-300 text-xs">
                            {clip.outroAnalysis}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selection Reasoning */}
                  {clip.reasoning && (
                    <div>
                      <button
                        onClick={() => toggleExpanded(index)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {isExpanded ? '▼ Hide AI Reasoning' : '▶ Show AI Reasoning'}
                      </button>
                      {isExpanded && (
                        <div className="mt-2 text-xs text-gray-300 bg-gray-900 p-2 rounded">
                          <div className="font-semibold text-purple-400 mb-1">🤖 Why This Clip?</div>
                          {clip.reasoning}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Crop Style Selector - 9:16 Aspect Ratio */}
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-2">
                  📱 Aspect Ratio (9:16 for TikTok/Reels/Shorts):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleCropStyleChange(index, 'center-crop')}
                    disabled={clip.exporting || !!clip.exportedPath}
                    className={`text-xs px-3 py-2 rounded transition-colors ${
                      cropStyles[index] === 'center-crop'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    ✂️ Center Crop
                  </button>
                  <button
                    onClick={() => handleCropStyleChange(index, 'blur-bars')}
                    disabled={clip.exporting || !!clip.exportedPath}
                    className={`text-xs px-3 py-2 rounded transition-colors ${
                      cropStyles[index] === 'blur-bars'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    🌫️ Blur Bars
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {cropStyles[index] === 'center-crop'
                    ? '✂️ Crops video to center (fills screen)'
                    : '🌫️ Adds blurred bars (Instagram style, no crop)'}
                </p>
              </div>

              {/* Caption Style Selector */}
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-2">
                  Caption Style:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {captionStyleOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleStyleChange(index, option.value)}
                      disabled={clip.exporting || !!clip.exportedPath}
                      className={`text-xs px-3 py-2 rounded transition-colors ${
                        captionStyles[index] === option.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {option.emoji} {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Caption Text */}
              {captionStyles[index] !== 'none' && (
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-2">
                    Caption Text (optional - leave empty to use auto-extracted text):
                  </label>
                  <textarea
                    value={captionTexts[index]}
                    onChange={(e) => handleCaptionTextChange(index, e.target.value)}
                    disabled={clip.exporting || !!clip.exportedPath}
                    placeholder="Enter custom caption text for this clip..."
                    className="w-full bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    rows={2}
                  />
                </div>
              )}

              {/* Time Range & Action Buttons */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-400 text-sm">
                  {formatTime(clip.startTime)} - {formatTime(clip.endTime)} (
                  {Math.round(clip.endTime - clip.startTime)}s)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditClip(clip, index)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded transition-colors"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => onCreateClip(clip, index, captionStyles[index], captionTexts[index], cropStyles[index])}
                    disabled={clip.exporting || !!clip.exportedPath}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-4 rounded transition-colors"
                  >
                    {clip.exporting ? 'Exporting...' : clip.exportedPath ? 'Exported ✓' : 'Export Clip'}
                  </button>
                </div>
              </div>

              {/* Exported Clip Preview */}
              {clip.exportedPath && (
                <div className="mt-4 border-t border-gray-600 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-green-400">Exported Clip Preview</h4>
                    <a
                      href={clip.exportedPath}
                      download
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Download
                    </a>
                  </div>
                  <video
                    src={clip.exportedPath}
                    controls
                    className="w-full rounded-lg bg-black"
                    controlsList="nodownload"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
