'use client'

import { useState, useRef, useEffect } from 'react'
import { Timeline, TimelineEffect, TimelineRow, TimelineAction } from '@xzdarcy/react-timeline-editor'
import AudioWaveform from './AudioWaveform'
import './timeline-styles.css'

/**
 * SIMPLIFIED TIMELINE COMPONENT
 *
 * Single coordinate system: All times reference SOURCE VIDEO timestamps
 * Timeline position is derived from segment array order
 */

interface Segment {
  id: string
  sourceStart: number  // Start time in source video
  sourceEnd: number    // End time in source video
  description?: string
}

interface ProfessionalVideoTimelineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  segments: Segment[]
  currentTime: number  // Current TIMELINE position (not source time)
  onSeek: (time: number) => void
  onSegmentUpdate: (segments: Segment[]) => void
  totalDuration: number  // Total timeline duration
  sourceDuration: number // Full source video duration
  isPlaying: boolean
  onPlayPause: () => void
  thumbnailBaseUrl?: string  // e.g., "https://r2.../thumbnails/video-id"
  videoUrl?: string          // Video URL for audio waveform extraction
}

interface CustomTimelineState {
  scale: number
  scrollTop: number
  scrollLeft: number
}

// Helper: Get segment duration
function getSegmentDuration(seg: Segment): number {
  return seg.sourceEnd - seg.sourceStart
}

// Helper: Get timeline position for a segment (based on array order)
function getTimelinePosition(segments: Segment[], index: number): number {
  let pos = 0
  for (let i = 0; i < index; i++) {
    pos += getSegmentDuration(segments[i])
  }
  return pos
}

// Helper: Generate thumbnail URL from base URL and source time
function getThumbnailUrl(baseUrl: string | undefined, sourceTime: number): string | null {
  if (!baseUrl) return null
  // Thumbnails are generated at 1fps, starting from frame 1
  const frameIndex = Math.floor(sourceTime) + 1
  return `${baseUrl}/thumb_${frameIndex.toString().padStart(4, '0')}.jpg`
}

// Define effect types
const effects: Record<string, TimelineEffect> = {
  segment: {
    id: 'segment',
    name: 'Video Segment',
  },
}

export default function ProfessionalVideoTimeline({
  videoRef,
  segments,
  currentTime,
  onSeek,
  onSegmentUpdate,
  totalDuration,
  sourceDuration,
  isPlaying,
  onPlayPause,
  thumbnailBaseUrl,
  videoUrl,
}: ProfessionalVideoTimelineProps) {
  const [timelineState, setTimelineState] = useState<CustomTimelineState>({
    scale: 20,
    scrollTop: 0,
    scrollLeft: 0,
  })

  const [timelineData, setTimelineData] = useState<TimelineRow[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const timelineRef = useRef<any>(null)
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const [segmentThumbnails, setSegmentThumbnails] = useState<Record<string, string[]>>({})
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [timelineHeight, setTimelineHeight] = useState(300) // Increased to fit waveform lane + segments
  const [isResizing, setIsResizing] = useState(false)
  const [showWaveform, setShowWaveform] = useState(true)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(200)
  const prevTimelineDataRef = useRef<TimelineRow[]>([])

  // Format time as MM:SS.ms
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // Generate thumbnail URLs for each segment
  useEffect(() => {
    if (!thumbnailBaseUrl) {
      setSegmentThumbnails({})
      return
    }

    console.log('🎨 Generating thumbnails from:', thumbnailBaseUrl)
    const thumbnails: Record<string, string[]> = {}

    for (const segment of segments) {
      const duration = getSegmentDuration(segment)
      if (duration <= 0) {
        thumbnails[segment.id] = []
        continue
      }

      // Calculate how many thumbnails based on segment duration
      const frameCount = Math.min(8, Math.max(3, Math.ceil(duration / 2)))
      const urls: string[] = []

      for (let i = 0; i < frameCount; i++) {
        // Spread thumbnails evenly across the segment's source time range
        const progress = frameCount > 1 ? i / (frameCount - 1) : 0.5
        const sourceTime = segment.sourceStart + (duration * progress)
        const url = getThumbnailUrl(thumbnailBaseUrl, sourceTime)
        if (url) urls.push(url)
      }

      thumbnails[segment.id] = urls
      console.log(`  Segment ${segment.id}: ${frameCount} thumbnails for ${segment.sourceStart.toFixed(1)}s - ${segment.sourceEnd.toFixed(1)}s`)
    }

    setSegmentThumbnails(thumbnails)
  }, [segments, thumbnailBaseUrl])

  // Convert segments to timeline format
  useEffect(() => {
    const rows: TimelineRow[] = [{
      id: 'main',
      actions: segments.map((segment, index) => {
        const duration = getSegmentDuration(segment)
        const timelineStart = getTimelinePosition(segments, index)

        return {
          id: segment.id,
          start: timelineStart,
          end: timelineStart + duration,
          effectId: 'segment',
          movable: true,
          resizable: true,
          minLength: 0.5,
          maxLength: sourceDuration - segment.sourceStart, // Can't extend beyond source video
          edges: { left: true, right: true, top: false, bottom: false }
        } as TimelineAction & { resizable?: boolean }
      })
    }]

    setTimelineData(rows)
    // Initialize prevTimelineDataRef so resize detection works
    prevTimelineDataRef.current = rows
  }, [segments, sourceDuration])

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAction) {
        e.preventDefault()
        console.log('🗑️ Deleting segment:', selectedAction)
        const filteredSegments = segments.filter(s => s.id !== selectedAction)
        onSegmentUpdate(filteredSegments)
        setSelectedAction(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [selectedAction, segments, onSegmentUpdate])

  // Handle timeline changes (move/resize)
  const handleTimelineChange = (data: TimelineRow[]) => {
    if (data.length === 0 || !data[0].actions) return

    const updatedSegments: Segment[] = []
    let hasChanges = false

    for (const action of data[0].actions) {
      const originalSegment = segments.find(s => s.id === action.id)
      if (!originalSegment) continue

      // Get the baseline position for this segment (from our calculated data)
      const segmentIndex = segments.findIndex(s => s.id === action.id)
      const baselineStart = getTimelinePosition(segments, segmentIndex)
      const baselineDuration = getSegmentDuration(originalSegment)
      const baselineEnd = baselineStart + baselineDuration

      const newTimelineDuration = action.end - action.start

      // Detect change type by comparing to baseline
      const startDelta = action.start - baselineStart
      const endDelta = action.end - baselineEnd
      const durationDelta = newTimelineDuration - baselineDuration

      const startChanged = Math.abs(startDelta) > 0.01
      const endChanged = Math.abs(endDelta) > 0.01
      const durationChanged = Math.abs(durationDelta) > 0.01

      // Determine change type
      const wasMove = startChanged && endChanged && !durationChanged
      const wasLeftResize = startChanged && !endChanged && durationChanged
      const wasRightResize = !startChanged && endChanged && durationChanged

      let newSourceStart = originalSegment.sourceStart
      let newSourceEnd = originalSegment.sourceEnd

      if (wasMove) {
        // Move: reorder segments (source times stay the same)
        hasChanges = true
      } else if (wasLeftResize) {
        // Left resize: adjust sourceStart (trim from beginning)
        newSourceStart = Math.max(0, originalSegment.sourceStart + startDelta)
        hasChanges = true
        console.log(`🔧 LEFT RESIZE: sourceStart ${originalSegment.sourceStart.toFixed(1)}s → ${newSourceStart.toFixed(1)}s (delta: ${startDelta.toFixed(2)}s)`)
      } else if (wasRightResize) {
        // Right resize: adjust sourceEnd (extend/trim end)
        newSourceEnd = originalSegment.sourceEnd + endDelta
        hasChanges = true
        console.log(`🔧 RIGHT RESIZE: sourceEnd ${originalSegment.sourceEnd.toFixed(1)}s → ${newSourceEnd.toFixed(1)}s (delta: ${endDelta.toFixed(2)}s)`)
      }

      // Clamp to valid source video bounds
      newSourceStart = Math.max(0, Math.min(newSourceStart, sourceDuration - 0.5))
      newSourceEnd = Math.max(newSourceStart + 0.5, Math.min(newSourceEnd, sourceDuration))

      updatedSegments.push({
        id: originalSegment.id,
        sourceStart: newSourceStart,
        sourceEnd: newSourceEnd,
        description: originalSegment.description,
      })
    }

    // Sort by timeline position (for reordering via drag)
    const actionPositions = new Map<string, number>()
    for (const action of data[0].actions) {
      actionPositions.set(action.id, action.start)
    }
    updatedSegments.sort((a, b) => {
      const posA = actionPositions.get(a.id) ?? 0
      const posB = actionPositions.get(b.id) ?? 0
      return posA - posB
    })

    // Only update if something actually changed
    if (hasChanges) {
      onSegmentUpdate(updatedSegments)
    }
  }

  // Render segment action
  const renderAction = (action: TimelineAction) => {
    const segment = segments.find(s => s.id === action.id)
    const duration = action.end - action.start
    const thumbnails = segmentThumbnails[action.id] || []
    const isSelected = selectedAction === action.id

    return (
      <div
        className="timeline-action"
        onClick={() => {
          setSelectedAction(action.id)
        }}
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'visible',
          background: isSelected ? '#1a1a1a' : '#0a0a0a',
          border: isSelected ? '3px solid #ffffff' : '1px solid #333333',
          borderRadius: '4px',
          pointerEvents: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Thumbnails */}
        {thumbnails.length > 0 ? (
          <div style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '3px 12px',
            boxSizing: 'border-box',
            overflow: 'visible',
          }}>
            {thumbnails.map((thumb, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  backgroundImage: `url(${thumb})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRight: i < thumbnails.length - 1 ? '1px solid #222222' : 'none',
                  pointerEvents: 'none',
                }}
              />
            ))}
          </div>
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, #333333, #555555)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Info overlay */}
        <div style={{
          position: 'absolute',
          bottom: '3px',
          left: '12px',
          right: '12px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}>
          <div style={{ color: 'white', fontSize: '11px', fontWeight: 'bold' }}>
            {duration.toFixed(1)}s
          </div>
          {segment?.description && (
            <div style={{
              color: 'white',
              fontSize: '10px',
              opacity: 0.8,
              maxWidth: '60%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {segment.description}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Handle cursor/seek
  const handleCursorChange = (time: number) => {
    onSeek(time)
  }

  // Sync playhead position
  useEffect(() => {
    if (timelineRef.current?.setTime) {
      timelineRef.current.setTime(currentTime)
    }
  }, [currentTime])

  // Handle vertical resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaY = e.clientY - resizeStartY.current
        const newHeight = Math.max(150, Math.min(600, resizeStartHeight.current - deltaY))
        setTimelineHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
      }
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  // Calculate heights for proper layout
  const headerHeight = 50 // Approximate header height
  const waveformHeight = showWaveform && videoUrl ? 55 : 0
  const segmentsLaneHeight = timelineHeight - headerHeight - waveformHeight - 10 // 10px for borders/padding

  return (
    <div className="professional-video-timeline" style={{
      background: '#000000',
      borderTop: '2px solid #333333',
      height: `${timelineHeight}px`,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Vertical Resize Handle */}
      <div
        onMouseDown={(e) => {
          setIsResizing(true)
          resizeStartY.current = e.clientY
          resizeStartHeight.current = timelineHeight
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          cursor: 'ns-resize',
          zIndex: 100,
          background: isResizing ? '#ffffff' : 'transparent',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => {
          if (!isResizing) e.currentTarget.style.background = '#555555'
        }}
        onMouseLeave={(e) => {
          if (!isResizing) e.currentTarget.style.background = 'transparent'
        }}
      />

      {/* Header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '2px solid #333333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#000000'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#ffffff' }}>Timeline</span>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#1a1a1a',
              border: '1px solid #555555',
              borderRadius: '4px',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#333333'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#1a1a1a'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Time Display */}
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#ffffff',
            fontFamily: 'monospace',
            minWidth: '120px',
            background: '#1a1a1a',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #555555'
          }}>
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>

          {/* Zoom Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setTimelineState(prev => ({ ...prev, scale: Math.max(5, prev.scale - 5) }))}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                background: '#1a1a1a',
                border: '1px solid #555555',
                borderRadius: '4px',
                color: '#ffffff',
                cursor: 'pointer'
              }}
              title="Zoom in"
            >
              −
            </button>
            <span style={{ fontSize: '12px', color: '#888888', minWidth: '40px', textAlign: 'center' }}>
              {timelineState.scale}x
            </span>
            <button
              onClick={() => setTimelineState(prev => ({ ...prev, scale: Math.min(100, prev.scale + 5) }))}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                background: '#1a1a1a',
                border: '1px solid #555555',
                borderRadius: '4px',
                color: '#ffffff',
                cursor: 'pointer'
              }}
              title="Zoom out"
            >
              +
            </button>
            <button
              onClick={() => {
                const optimalScale = Math.max(5, Math.min(50, segments.length * 3))
                setTimelineState(prev => ({ ...prev, scale: optimalScale, scrollLeft: 0 }))
              }}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                background: '#1a1a1a',
                border: '1px solid #555555',
                borderRadius: '4px',
                color: '#ffffff',
                cursor: 'pointer'
              }}
            >
              Fit
            </button>
          </div>

          {/* Auto-scroll toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cccccc' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>

          {/* Waveform toggle */}
          {videoUrl && (
            <button
              onClick={() => setShowWaveform(!showWaveform)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                fontSize: '11px',
                background: showWaveform ? '#0099cc' : '#1a1a1a',
                border: '1px solid #555555',
                borderRadius: '4px',
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              title={showWaveform ? 'Hide audio waveform' : 'Show audio waveform'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              Waveform
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {selectedAction && (
            <span style={{ fontSize: '11px', color: '#ffffff', background: '#333333', padding: '2px 8px', borderRadius: '4px', border: '1px solid #555555' }}>
              Press Delete to remove segment
            </span>
          )}
          <span style={{ fontSize: '12px', color: '#888888' }}>
            {segments.length} segments • {totalDuration.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Timeline Lanes Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {/* Video Segments Lane - explicit height when waveform is shown */}
        <div style={{
          flex: showWaveform && videoUrl ? '1 1 auto' : '1 1 100%',
          minHeight: '80px',
          overflow: 'hidden',
          position: 'relative',
          width: '100%'
        }}>
          <Timeline
            key="timeline-editor"
            ref={timelineRef}
            scale={timelineState.scale}
            scaleSplitCount={5}
            scaleWidth={200}
            startLeft={60}
            minScaleCount={Math.ceil(totalDuration / 2)}
            maxScaleCount={Math.ceil(totalDuration * 2)}
            autoScroll={autoScroll}
            dragLine={false}
            editorData={timelineData}
            effects={effects}
            onChange={handleTimelineChange}
            onCursorDrag={handleCursorChange}
            onClickAction={(e, param) => {
              const action = (param && param.action) || (e as any).action || (param as any)
              const actionId = action?.id || (e as any).id
              const actionStart = action?.start || (e as any).start

              if (actionId) {
                setSelectedAction(actionId)
              }

              if (isFinite(actionStart) && !isNaN(actionStart)) {
                onSeek(actionStart)
              }
            }}
            getActionRender={renderAction}
            getScaleRender={(scale) => formatTime(scale)}
            gridSnap={false}
            hideCursor={false}
            autoReRender={true}
            scrollTop={timelineState.scrollTop}
            onScroll={({ scrollTop, scrollLeft }) => {
              setTimelineState(prev => ({ ...prev, scrollTop, scrollLeft }))
              // Sync waveform scroll
              if (waveformContainerRef.current) {
                waveformContainerRef.current.scrollLeft = scrollLeft
              }
            }}
            style={{
              background: '#000000',
              color: '#ffffff'
            }}
            disableDrag={false}
          />
        </div>

        {/* Audio Waveform Lane - Clean row below segments */}
        {showWaveform && videoUrl && (
          <div
            style={{
              display: 'flex',
              flex: '0 0 60px',
              height: '60px',
              minHeight: '60px',
              background: '#080808',
              borderTop: '1px solid #333',
            }}
          >
            {/* Row Label */}
            <div style={{
              width: '60px',
              minWidth: '60px',
              background: '#0a0a0a',
              borderRight: '1px solid #222',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#555" style={{ marginBottom: '2px' }}>
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
                <div style={{
                  fontSize: '9px',
                  color: '#555',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Audio
                </div>
              </div>
            </div>

            {/* Waveform Scrollable Area */}
            <div
              ref={waveformContainerRef}
              style={{
                flex: 1,
                overflowX: 'auto',
                overflowY: 'hidden',
              }}
              onScroll={(e) => {
                const scrollLeft = (e.target as HTMLDivElement).scrollLeft
                setTimelineState(prev => ({ ...prev, scrollLeft }))
              }}
            >
              <AudioWaveform
                videoUrl={videoUrl}
                sourceDuration={sourceDuration}
                segments={segments}
                scale={timelineState.scale}
                scrollLeft={timelineState.scrollLeft}
                containerWidth={800}
                height={52}
                onSeek={onSeek}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
