'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ProfessionalVideoTimeline from './ProfessionalVideoTimeline'
import CaptionStylePanel from './CaptionStylePanel'
import { useRouter } from 'next/navigation'
import { CaptionStyle, DEFAULT_CAPTION_STYLE } from '@/types/captions'
import { getFontById } from '@/lib/fonts'

/**
 * SIMPLIFIED EDITOR WITH LIVE PREVIEW
 *
 * Single coordinate system: All times reference the SOURCE VIDEO
 * Timeline position is derived from segment array order
 * Live preview shows crop style + captions
 */

interface Segment {
  id: string
  sourceStart: number  // Start time in source video
  sourceEnd: number    // End time in source video
  description?: string
  // Content transform within frame (per-segment)
  transform?: {
    scale: number      // 1 = 100%, 0.5 = 50%, 1.5 = 150%
    x: number          // Horizontal offset in %
    y: number          // Vertical offset in %
  }
}

interface TranscriptWord {
  word: string
  start: number
  end: number
}

interface Transcript {
  text: string
  words: TranscriptWord[]
}

interface EditorClip {
  id: string
  title: string
  sourceVideoUrl: string
  thumbnailBaseUrl?: string
  segments: Segment[]
  captionStyle: string
  cropStyle: string
  description?: string
  hasTranscript?: boolean
}

// Helper: Get segment duration
function getSegmentDuration(seg: Segment): number {
  return seg.sourceEnd - seg.sourceStart
}

// Helper: Get total clip duration
function getTotalDuration(segments: Segment[]): number {
  return segments.reduce((sum, seg) => sum + getSegmentDuration(seg), 0)
}

// Helper: Get timeline position for a segment (based on array order)
function getTimelinePosition(segments: Segment[], index: number): number {
  let pos = 0
  for (let i = 0; i < index; i++) {
    pos += getSegmentDuration(segments[i])
  }
  return pos
}

// Helper: Find which segment contains a timeline position
function findSegmentAtTimeline(
  segments: Segment[],
  timelinePos: number
): { segment: Segment; index: number; offset: number } | null {
  let cumulative = 0

  for (let i = 0; i < segments.length; i++) {
    const duration = getSegmentDuration(segments[i])
    if (timelinePos >= cumulative && timelinePos < cumulative + duration) {
      return {
        segment: segments[i],
        index: i,
        offset: timelinePos - cumulative
      }
    }
    cumulative += duration
  }

  // Past all segments - return last segment
  if (segments.length > 0 && timelinePos >= cumulative) {
    const lastIdx = segments.length - 1
    return {
      segment: segments[lastIdx],
      index: lastIdx,
      offset: getSegmentDuration(segments[lastIdx])
    }
  }

  return null
}

// Helper: Map timeline position to source video time
function timelineToSource(segments: Segment[], timelinePos: number): number | null {
  const result = findSegmentAtTimeline(segments, timelinePos)
  if (!result) return null
  return result.segment.sourceStart + result.offset
}

// Helper: Get current caption text based on source time and transcript
function getCurrentCaption(
  transcript: Transcript | null,
  sourceTime: number,
  segments: Segment[],
  timelinePos: number
): { current: string; upcoming: string } {
  if (!transcript?.words?.length) {
    return { current: '', upcoming: '' }
  }

  // Find which segment we're in and get the source time
  let cumulativeTime = 0
  let currentSourceTime = sourceTime

  for (const segment of segments) {
    const segDuration = segment.sourceEnd - segment.sourceStart
    if (timelinePos < cumulativeTime + segDuration) {
      // We're in this segment
      const offsetInSegment = timelinePos - cumulativeTime
      currentSourceTime = segment.sourceStart + offsetInSegment
      break
    }
    cumulativeTime += segDuration
  }

  // Find words that are currently being spoken (show 2-3 words at a time)
  const currentWords: string[] = []
  const upcomingWords: string[] = []

  for (const word of transcript.words) {
    // Check if this word falls within any of our segments
    let isInSegment = false
    for (const segment of segments) {
      if (word.start >= segment.sourceStart && word.end <= segment.sourceEnd) {
        isInSegment = true
        break
      }
    }

    if (!isInSegment) continue

    if (word.start <= currentSourceTime && word.end >= currentSourceTime - 0.3) {
      currentWords.push(word.word)
    } else if (word.start > currentSourceTime && word.start < currentSourceTime + 1.5) {
      upcomingWords.push(word.word)
    }
  }

  // Show last 2 current words + next word
  const displayCurrent = currentWords.slice(-2).join(' ')
  const displayUpcoming = upcomingWords.slice(0, 1).join(' ')

  return { current: displayCurrent, upcoming: displayUpcoming }
}

export default function ClipEditor({ clip }: { clip: EditorClip }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null) // For blur-bars background
  const transcriptPanelRef = useRef<HTMLDivElement>(null)
  const currentWordRef = useRef<HTMLSpanElement>(null)

  // Segments state (can be reordered, resized, deleted)
  const [segments, setSegments] = useState<Segment[]>(clip.segments)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [timelinePos, setTimelinePos] = useState(0)
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [sourceDuration, setSourceDuration] = useState(0)
  const [currentSourceTime, setCurrentSourceTime] = useState(0)

  // Transcript state for captions
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null)
  const [editingWordText, setEditingWordText] = useState('')

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(380)
  const [isResizingPanel, setIsResizingPanel] = useState(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(380)

  // Export state
  const [isExporting, setIsExporting] = useState(false)

  // Caption style state
  const [captionStyleSettings, setCaptionStyleSettings] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE)
  const [showCaptionPanel, setShowCaptionPanel] = useState(false)

  // Editable title state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(clip.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // Load transcript on mount
  useEffect(() => {
    if (clip.hasTranscript) {
      try {
        const stored = localStorage.getItem(`clip_${clip.id}_transcript`)
        if (stored) {
          const parsed = JSON.parse(stored)
          setTranscript(parsed)
          console.log('📝 Transcript loaded:', parsed.words?.length, 'words')
        }
      } catch (e) {
        console.error('Failed to load transcript:', e)
      }
    }
  }, [clip.id, clip.hasTranscript])

  // Auto-scroll to current word in transcript panel
  useEffect(() => {
    if (currentWordRef.current && transcriptPanelRef.current && isPlaying) {
      currentWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [currentSourceTime, isPlaying])

  // Handle panel resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingPanel) {
        const deltaX = e.clientX - resizeStartX.current
        const newWidth = Math.max(280, Math.min(600, resizeStartWidth.current + deltaX))
        setPanelWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizingPanel) {
        setIsResizingPanel(false)
      }
    }

    if (isResizingPanel) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingPanel])

  // Handle word edit
  const handleWordEdit = (index: number, newWord: string) => {
    if (!transcript) return

    const updatedWords = [...transcript.words]
    updatedWords[index] = { ...updatedWords[index], word: newWord }

    const updatedTranscript = {
      ...transcript,
      words: updatedWords,
      text: updatedWords.map(w => w.word).join(' ')
    }

    setTranscript(updatedTranscript)
    setEditingWordIndex(null)

    // Save to localStorage
    localStorage.setItem(`clip_${clip.id}_transcript`, JSON.stringify(updatedTranscript))
    console.log('📝 Transcript updated')
  }

  // Check if word is in any segment
  const isWordInSegments = (word: TranscriptWord): boolean => {
    for (const segment of segments) {
      if (word.start >= segment.sourceStart && word.end <= segment.sourceEnd) {
        return true
      }
    }
    return false
  }

  // Check if word is currently being spoken
  const isWordCurrent = (word: TranscriptWord): boolean => {
    return word.start <= currentSourceTime && word.end >= currentSourceTime - 0.1
  }

  // Content transform state
  const [isContentHovered, setIsContentHovered] = useState(false)
  const [isDraggingContent, setIsDraggingContent] = useState(false)
  const [isResizingContent, setIsResizingContent] = useState<string | null>(null) // corner being resized
  const contentStartPos = useRef({ x: 0, y: 0 })
  const contentStartTransform = useRef({ scale: 1, x: 0, y: 0 })
  const liveTransform = useRef({ scale: 1, x: 0, y: 0 }) // For smooth dragging without re-renders
  const contentRef = useRef<HTMLDivElement>(null) // Reference to content element for direct DOM updates
  const contentBorderRef = useRef<HTMLDivElement>(null) // Reference to border overlay for smooth updates
  const previewContainerRef = useRef<HTMLDivElement>(null)

  // Caption position and scale state
  const [captionPosition, setCaptionPosition] = useState({ x: 50, y: 89 }) // Center bottom by default (%)
  const [captionScale, setCaptionScale] = useState(1)
  const [isCaptionHovered, setIsCaptionHovered] = useState(false)
  const [isDraggingCaption, setIsDraggingCaption] = useState(false)
  const [isResizingCaption, setIsResizingCaption] = useState<string | null>(null)
  const captionStartPos = useRef({ x: 0, y: 0 })
  const captionStartTransform = useRef({ x: 50, y: 89, scale: 1 })

  // Title position and scale state
  const [titlePosition, setTitlePosition] = useState({ x: 50, y: 15 }) // Center top by default (%)
  const [titleScale, setTitleScale] = useState(1)
  const [isTitleHovered, setIsTitleHovered] = useState(false)
  const [isDraggingTitle, setIsDraggingTitle] = useState(false)
  const [isResizingTitle, setIsResizingTitle] = useState<string | null>(null)
  const titleStartPos = useRef({ x: 0, y: 0 })
  const titleStartTransform = useRef({ x: 50, y: 15, scale: 1 })

  // Alignment guides state
  const [showVerticalGuide, setShowVerticalGuide] = useState(false)
  const [showHorizontalGuide, setShowHorizontalGuide] = useState(false)
  const SNAP_THRESHOLD = 2 // Percentage threshold for snapping to center

  // Get current segment's transform
  const currentSegment = segments[currentSegmentIndex]
  const currentTransform = currentSegment?.transform || { scale: 1, x: 0, y: 0 }

  // Update segment transform
  const updateSegmentTransform = useCallback((transform: { scale: number; x: number; y: number }) => {
    const updatedSegments = segments.map((seg, idx) =>
      idx === currentSegmentIndex
        ? { ...seg, transform }
        : seg
    )
    setSegments(updatedSegments)
  }, [segments, currentSegmentIndex])

  // Handle content drag (reposition)
  const handleContentDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingContent(true)
    contentStartPos.current = { x: e.clientX, y: e.clientY }
    contentStartTransform.current = { ...currentTransform }
    liveTransform.current = { ...currentTransform }
  }

  // Store initial distance for smooth resizing
  const contentStartDistance = useRef(0)

  // Handle resize from corner
  const handleResizeStart = (e: React.MouseEvent, corner: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!previewContainerRef.current) return

    const rect = previewContainerRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // Calculate initial distance from center to mouse
    contentStartDistance.current = Math.sqrt(
      Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
    )

    setIsResizingContent(corner)
    contentStartPos.current = { x: e.clientX, y: e.clientY }
    contentStartTransform.current = { ...currentTransform }
    liveTransform.current = { ...currentTransform }
  }

  // Apply transform directly to DOM for smooth updates
  const applyLiveTransform = useCallback(() => {
    const { scale, x, y } = liveTransform.current
    // Update video container
    if (contentRef.current) {
      contentRef.current.style.transform = `scale(${scale}) translate(${x}%, ${y}%)`
    }
    // Update border overlay (different transform for blur-bars vs center-crop)
    if (contentBorderRef.current) {
      const isBlurBars = clip.cropStyle === 'blur-bars'
      contentBorderRef.current.style.transform = isBlurBars
        ? `translate(-50%, -50%) scale(${scale}) translate(${x}%, ${y}%)`
        : `scale(${scale}) translate(${x}%, ${y}%)`
    }
  }, [clip.cropStyle])

  // Mouse move handler for drag/resize - updates DOM directly for smoothness
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!previewContainerRef.current) return
      const rect = previewContainerRef.current.getBoundingClientRect()

      if (isDraggingContent) {
        const deltaX = ((e.clientX - contentStartPos.current.x) / rect.width) * 100
        const deltaY = ((e.clientY - contentStartPos.current.y) / rect.height) * 100
        let newX = contentStartTransform.current.x + deltaX
        let newY = contentStartTransform.current.y + deltaY

        // Snap to center with threshold (content center is at 0,0)
        if (Math.abs(newX) < SNAP_THRESHOLD) {
          newX = 0
          setShowVerticalGuide(true)
        } else {
          setShowVerticalGuide(false)
        }
        if (Math.abs(newY) < SNAP_THRESHOLD) {
          newY = 0
          setShowHorizontalGuide(true)
        } else {
          setShowHorizontalGuide(false)
        }

        liveTransform.current = {
          ...contentStartTransform.current,
          x: Math.max(-50, Math.min(50, newX)),
          y: Math.max(-50, Math.min(50, newY)),
        }
        applyLiveTransform()
      }

      if (isResizingContent) {
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2

        // Calculate current distance from center to mouse
        const currentDistance = Math.sqrt(
          Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
        )

        // Scale is ratio of current distance to initial distance
        const scaleRatio = contentStartDistance.current > 0
          ? currentDistance / contentStartDistance.current
          : 1
        const newScale = Math.max(0.2, Math.min(3, contentStartTransform.current.scale * scaleRatio))

        liveTransform.current = {
          ...contentStartTransform.current,
          scale: newScale,
        }
        applyLiveTransform()
      }
    }

    const handleMouseUp = () => {
      // Commit the live transform to React state only on mouse up
      if (isDraggingContent || isResizingContent) {
        updateSegmentTransform(liveTransform.current)
      }
      setIsDraggingContent(false)
      setIsResizingContent(null)
      // Hide guides when done dragging
      setShowVerticalGuide(false)
      setShowHorizontalGuide(false)
    }

    if (isDraggingContent || isResizingContent) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = isDraggingContent ? 'move' : 'nwse-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (!isDraggingContent && !isResizingContent) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDraggingContent, isResizingContent, updateSegmentTransform, applyLiveTransform])

  // Reset transform for current segment
  const resetTransform = () => {
    updateSegmentTransform({ scale: 1, x: 0, y: 0 })
  }

  // Caption drag handlers
  const handleCaptionDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingCaption(true)
    captionStartPos.current = { x: e.clientX, y: e.clientY }
    captionStartTransform.current = { ...captionPosition, scale: captionScale }
  }

  // Store initial distance for smooth caption resizing
  const captionStartDistance = useRef(0)

  const handleCaptionResizeStart = (e: React.MouseEvent, corner: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!previewContainerRef.current) return

    const rect = previewContainerRef.current.getBoundingClientRect()
    // Calculate caption center position in screen coordinates
    const captionCenterX = rect.left + (captionPosition.x / 100) * rect.width
    const captionCenterY = rect.top + (captionPosition.y / 100) * rect.height

    // Calculate initial distance from caption center to mouse
    captionStartDistance.current = Math.sqrt(
      Math.pow(e.clientX - captionCenterX, 2) + Math.pow(e.clientY - captionCenterY, 2)
    )

    setIsResizingCaption(corner)
    captionStartPos.current = { x: e.clientX, y: e.clientY }
    captionStartTransform.current = { ...captionPosition, scale: captionScale }
  }

  // Title drag handlers
  const handleTitleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingTitle(true)
    titleStartPos.current = { x: e.clientX, y: e.clientY }
    titleStartTransform.current = { ...titlePosition, scale: titleScale }
  }

  // Store initial distance for smooth title resizing
  const titleStartDistance = useRef(0)

  const handleTitleResizeStart = (e: React.MouseEvent, corner: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!previewContainerRef.current) return

    const rect = previewContainerRef.current.getBoundingClientRect()
    // Calculate title center position in screen coordinates
    const titleCenterX = rect.left + (titlePosition.x / 100) * rect.width
    const titleCenterY = rect.top + (titlePosition.y / 100) * rect.height

    // Calculate initial distance from title center to mouse
    titleStartDistance.current = Math.sqrt(
      Math.pow(e.clientX - titleCenterX, 2) + Math.pow(e.clientY - titleCenterY, 2)
    )

    setIsResizingTitle(corner)
    titleStartPos.current = { x: e.clientX, y: e.clientY }
    titleStartTransform.current = { ...titlePosition, scale: titleScale }
  }

  // Caption/Title mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!previewContainerRef.current) return
      const rect = previewContainerRef.current.getBoundingClientRect()

      // Caption drag - keep fully inside frame (5-95% range)
      if (isDraggingCaption) {
        const deltaX = ((e.clientX - captionStartPos.current.x) / rect.width) * 100
        const deltaY = ((e.clientY - captionStartPos.current.y) / rect.height) * 100
        let newX = captionStartTransform.current.x + deltaX
        let newY = captionStartTransform.current.y + deltaY

        // Snap to center with threshold
        if (Math.abs(newX - 50) < SNAP_THRESHOLD) {
          newX = 50
          setShowVerticalGuide(true)
        } else {
          setShowVerticalGuide(false)
        }
        if (Math.abs(newY - 50) < SNAP_THRESHOLD) {
          newY = 50
          setShowHorizontalGuide(true)
        } else {
          setShowHorizontalGuide(false)
        }

        setCaptionPosition({
          x: Math.max(5, Math.min(95, newX)),
          y: Math.max(5, Math.min(95, newY)),
        })
      }

      // Caption resize - distance-based for smooth scaling
      if (isResizingCaption) {
        // Calculate caption center position in screen coordinates
        const captionCenterX = rect.left + (captionStartTransform.current.x / 100) * rect.width
        const captionCenterY = rect.top + (captionStartTransform.current.y / 100) * rect.height

        // Calculate current distance from caption center to mouse
        const currentDistance = Math.sqrt(
          Math.pow(e.clientX - captionCenterX, 2) + Math.pow(e.clientY - captionCenterY, 2)
        )

        // Scale is ratio of current distance to initial distance
        const scaleRatio = captionStartDistance.current > 0
          ? currentDistance / captionStartDistance.current
          : 1
        setCaptionScale(Math.max(0.3, Math.min(3, captionStartTransform.current.scale * scaleRatio))
        )
      }

      // Title drag - keep fully inside frame (5-95% range)
      if (isDraggingTitle) {
        const deltaX = ((e.clientX - titleStartPos.current.x) / rect.width) * 100
        const deltaY = ((e.clientY - titleStartPos.current.y) / rect.height) * 100
        let newX = titleStartTransform.current.x + deltaX
        let newY = titleStartTransform.current.y + deltaY

        // Snap to center with threshold
        if (Math.abs(newX - 50) < SNAP_THRESHOLD) {
          newX = 50
          setShowVerticalGuide(true)
        } else {
          setShowVerticalGuide(false)
        }
        if (Math.abs(newY - 50) < SNAP_THRESHOLD) {
          newY = 50
          setShowHorizontalGuide(true)
        } else {
          setShowHorizontalGuide(false)
        }

        setTitlePosition({
          x: Math.max(5, Math.min(95, newX)),
          y: Math.max(5, Math.min(95, newY)),
        })
      }

      // Title resize - distance-based for smooth scaling
      if (isResizingTitle) {
        // Calculate title center position in screen coordinates
        const titleCenterX = rect.left + (titleStartTransform.current.x / 100) * rect.width
        const titleCenterY = rect.top + (titleStartTransform.current.y / 100) * rect.height

        // Calculate current distance from title center to mouse
        const currentDistance = Math.sqrt(
          Math.pow(e.clientX - titleCenterX, 2) + Math.pow(e.clientY - titleCenterY, 2)
        )

        // Scale is ratio of current distance to initial distance
        const scaleRatio = titleStartDistance.current > 0
          ? currentDistance / titleStartDistance.current
          : 1
        setTitleScale(Math.max(0.3, Math.min(3, titleStartTransform.current.scale * scaleRatio)))
      }
    }

    const handleMouseUp = () => {
      setIsDraggingCaption(false)
      setIsResizingCaption(null)
      setIsDraggingTitle(false)
      setIsResizingTitle(null)
      // Hide guides when done dragging
      setShowVerticalGuide(false)
      setShowHorizontalGuide(false)
    }

    if (isDraggingCaption || isResizingCaption || isDraggingTitle || isResizingTitle) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = (isDraggingCaption || isDraggingTitle) ? 'move' : 'nwse-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (!isDraggingCaption && !isResizingCaption && !isDraggingTitle && !isResizingTitle) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDraggingCaption, isResizingCaption, isDraggingTitle, isResizingTitle])

  // Get current caption based on playback position
  const caption = useMemo(() => {
    return getCurrentCaption(transcript, currentSourceTime, segments, timelinePos)
  }, [transcript, currentSourceTime, segments, timelinePos])

  // Load video metadata
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleMetadata = () => {
      setSourceDuration(video.duration)
      console.log('🎥 Source video duration:', video.duration, 's')
    }

    video.addEventListener('loadedmetadata', handleMetadata)
    if (video.readyState >= 1) {
      setSourceDuration(video.duration)
    }

    return () => video.removeEventListener('loadedmetadata', handleMetadata)
  }, [])

  // Sync background video (for blur-bars) with main video
  useEffect(() => {
    const bgVideo = bgVideoRef.current
    const mainVideo = videoRef.current
    if (!bgVideo || !mainVideo || clip.cropStyle !== 'blur-bars') return

    const syncBgVideo = () => {
      if (Math.abs(bgVideo.currentTime - mainVideo.currentTime) > 0.1) {
        bgVideo.currentTime = mainVideo.currentTime
      }
    }

    mainVideo.addEventListener('seeked', syncBgVideo)
    mainVideo.addEventListener('timeupdate', syncBgVideo)

    return () => {
      mainVideo.removeEventListener('seeked', syncBgVideo)
      mainVideo.removeEventListener('timeupdate', syncBgVideo)
    }
  }, [clip.cropStyle])

  // Playback logic - handle segment transitions
  useEffect(() => {
    const video = videoRef.current
    const bgVideo = bgVideoRef.current
    if (!video || !isPlaying) return

    const handleTimeUpdate = () => {
      const currentSeg = segments[currentSegmentIndex]
      if (!currentSeg) return

      const videoTime = video.currentTime
      setCurrentSourceTime(videoTime) // Track for captions

      // Calculate timeline position
      const segStartOnTimeline = getTimelinePosition(segments, currentSegmentIndex)
      const posInSegment = Math.min(videoTime - currentSeg.sourceStart, getSegmentDuration(currentSeg))
      const newTimelinePos = segStartOnTimeline + Math.max(0, posInSegment)

      setTimelinePos(newTimelinePos)

      // Sync background video if blur-bars
      if (bgVideo && clip.cropStyle === 'blur-bars') {
        if (Math.abs(bgVideo.currentTime - videoTime) > 0.1) {
          bgVideo.currentTime = videoTime
        }
      }

      // Check if we've reached end of current segment
      if (videoTime >= currentSeg.sourceEnd - 0.05) {
        if (currentSegmentIndex < segments.length - 1) {
          // Move to next segment
          const nextIdx = currentSegmentIndex + 1
          const nextSeg = segments[nextIdx]
          console.log(`➡️ Segment ${currentSegmentIndex + 1} → ${nextIdx + 1}`)

          setCurrentSegmentIndex(nextIdx)
          video.currentTime = nextSeg.sourceStart
          if (bgVideo) bgVideo.currentTime = nextSeg.sourceStart
        } else {
          // End of all segments - stop
          console.log('⏹️ End of clip')
          video.pause()
          if (bgVideo) bgVideo.pause()
          setIsPlaying(false)
          setCurrentSegmentIndex(0)
          setTimelinePos(0)
          video.currentTime = segments[0].sourceStart
          if (bgVideo) bgVideo.currentTime = segments[0].sourceStart
        }
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => video.removeEventListener('timeupdate', handleTimeUpdate)
  }, [isPlaying, currentSegmentIndex, segments, clip.cropStyle])

  // Play/Pause handler
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current
    const bgVideo = bgVideoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
      if (bgVideo) bgVideo.pause()
      setIsPlaying(false)
    } else {
      // Find which segment to play based on timeline position
      const result = findSegmentAtTimeline(segments, timelinePos)
      if (result) {
        setCurrentSegmentIndex(result.index)
        const seekTime = result.segment.sourceStart + result.offset
        video.currentTime = seekTime
        if (bgVideo) bgVideo.currentTime = seekTime
        setCurrentSourceTime(seekTime)
      } else if (segments.length > 0) {
        setCurrentSegmentIndex(0)
        video.currentTime = segments[0].sourceStart
        if (bgVideo) bgVideo.currentTime = segments[0].sourceStart
        setCurrentSourceTime(segments[0].sourceStart)
      }
      video.play()
      if (bgVideo) bgVideo.play()
      setIsPlaying(true)
    }
  }, [isPlaying, segments, timelinePos])

  // Seek handler
  const handleSeek = useCallback((newTimelinePos: number) => {
    const video = videoRef.current
    const bgVideo = bgVideoRef.current
    if (!video) return

    setTimelinePos(newTimelinePos)

    const result = findSegmentAtTimeline(segments, newTimelinePos)
    if (result) {
      setCurrentSegmentIndex(result.index)
      const sourceTime = result.segment.sourceStart + result.offset
      video.currentTime = sourceTime
      if (bgVideo) bgVideo.currentTime = sourceTime
      setCurrentSourceTime(sourceTime)
    }
  }, [segments])

  // Segment update handler (from timeline)
  const handleSegmentUpdate = useCallback((updatedSegments: Segment[]) => {
    console.log('📝 Segments updated:', updatedSegments.length)
    setSegments(updatedSegments)
  }, [])

  // Export handler
  const handleExport = async () => {
    setIsExporting(true)

    try {
      // Load transcript if available
      let transcript = null
      if (clip.hasTranscript) {
        const stored = localStorage.getItem(`clip_${clip.id}_transcript`)
        if (stored) transcript = JSON.parse(stored)
      }

      const response = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: clip.sourceVideoUrl,
          startTime: segments[0]?.sourceStart || 0,
          endTime: segments[segments.length - 1]?.sourceEnd || 0,
          clipNumber: 0,
          captionStyle: clip.captionStyle,
          transcript,
          clipType: segments.length > 1 ? 'multi-scene' : 'single-scene',
          scenes: segments.map(seg => ({
            startTime: seg.sourceStart,
            endTime: seg.sourceEnd,
            description: seg.description
          })),
          cropStyle: clip.cropStyle,
          title: clip.title,
        }),
      })

      if (!response.ok) throw new Error('Export failed')

      const result = await response.json()

      // Download the exported video
      const link = document.createElement('a')
      link.href = result.outputPath
      link.download = `${clip.title.replace(/[^a-z0-9]/gi, '_')}.mp4`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      console.log('✅ Export complete:', result.outputPath)

    } catch (error) {
      console.error('❌ Export failed:', error)
      alert('Failed to export video. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const totalDuration = getTotalDuration(segments)
  const hasChanges = JSON.stringify(segments) !== JSON.stringify(clip.segments)

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-black border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="border-l border-gray-700 h-8" />
          <div>
            <h1 className="text-lg font-semibold text-white">{clip.title}</h1>
            <p className="text-xs text-gray-400">
              {segments.length} segment{segments.length !== 1 ? 's' : ''} • {totalDuration.toFixed(1)}s
            </p>
          </div>
          <div className="border-l border-gray-700 h-8" />
          {/* Style Indicators */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg">
              <span className="text-xs text-gray-400">Crop:</span>
              <span className="text-xs font-medium text-white">
                {clip.cropStyle === 'blur-bars' ? '🌫️ Blur Bars' : '✂️ Center Crop'}
              </span>
            </div>
            <button
              onClick={() => setShowCaptionPanel(!showCaptionPanel)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
                showCaptionPanel
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <span className="text-xs font-medium">Captions</span>
              <svg className={`w-3 h-3 transition ${showCaptionPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-yellow-500 flex items-center gap-1">
              <svg className="w-3 h-3 fill-current" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3" />
              </svg>
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className={`px-6 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              isExporting
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Exporting...
              </>
            ) : (
              'Export'
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Upper Section: Transcript Panel + Video Preview */}
        <div className="flex-1 flex overflow-hidden">

          {/* Transcript Panel (Left) */}
          <div
            className="bg-gray-950 border-r border-gray-800 flex flex-col"
            style={{ width: `${panelWidth}px`, minWidth: '280px', maxWidth: '600px' }}
          >
            {/* Panel Header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-black">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium text-white">Transcript</span>
              </div>
              {transcript && (
                <span className="text-xs text-gray-500">{transcript.words?.length || 0} words</span>
              )}
            </div>

            {/* Transcript Content */}
            <div
              ref={transcriptPanelRef}
              className="flex-1 overflow-y-auto p-4"
              style={{ scrollBehavior: 'smooth' }}
            >
              {transcript?.words?.length ? (
                <div className="leading-relaxed">
                  {transcript.words.map((word, index) => {
                    const inSegment = isWordInSegments(word)
                    const isCurrent = isWordCurrent(word)
                    const isEditing = editingWordIndex === index

                    if (isEditing) {
                      return (
                        <input
                          key={index}
                          type="text"
                          value={editingWordText}
                          onChange={(e) => setEditingWordText(e.target.value)}
                          onBlur={() => handleWordEdit(index, editingWordText)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleWordEdit(index, editingWordText)
                            } else if (e.key === 'Escape') {
                              setEditingWordIndex(null)
                            }
                          }}
                          autoFocus
                          className="bg-blue-600 text-white px-1 rounded outline-none text-base"
                          style={{ width: `${Math.max(40, editingWordText.length * 10)}px` }}
                        />
                      )
                    }

                    return (
                      <span
                        key={index}
                        ref={isCurrent ? currentWordRef : null}
                        onClick={() => {
                          // Seek to word time
                          const video = videoRef.current
                          const bgVideo = bgVideoRef.current
                          if (video) {
                            video.currentTime = word.start
                            if (bgVideo) bgVideo.currentTime = word.start
                            setCurrentSourceTime(word.start)
                          }
                        }}
                        onDoubleClick={() => {
                          setEditingWordIndex(index)
                          setEditingWordText(word.word)
                        }}
                        className={`
                          inline cursor-pointer transition-all duration-150 rounded px-0.5
                          ${isCurrent
                            ? 'bg-yellow-500 text-black font-bold scale-110'
                            : inSegment
                            ? 'text-green-400 hover:bg-green-900/30'
                            : 'text-gray-500 hover:bg-gray-800/50'
                          }
                        `}
                        style={{
                          fontSize: '15px',
                          lineHeight: '2',
                        }}
                        title={`${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s (double-click to edit)`}
                      >
                        {word.word}{' '}
                      </span>
                    )
                  })}
                </div>
              ) : (
                <div className="text-gray-500 text-sm text-center py-8">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No transcript available</p>
                  <p className="text-xs mt-1 text-gray-600">Transcription is generated during video analysis</p>
                </div>
              )}
            </div>

            {/* Legend */}
            {transcript?.words?.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-800 bg-black">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-yellow-500"></span>
                    <span className="text-gray-400">Current</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-green-400"></span>
                    <span className="text-gray-400">In clip</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-gray-500"></span>
                    <span className="text-gray-400">Outside</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Click word to seek • Double-click to edit</p>
              </div>
            )}
          </div>

          {/* Resize Handle */}
          <div
            onMouseDown={(e) => {
              setIsResizingPanel(true)
              resizeStartX.current = e.clientX
              resizeStartWidth.current = panelWidth
            }}
            className="w-1 bg-gray-800 hover:bg-blue-500 cursor-ew-resize transition-colors flex-shrink-0"
            style={{
              background: isResizingPanel ? '#3b82f6' : undefined
            }}
          />

          {/* Video Preview with Crop Style */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black">

          <div
            ref={previewContainerRef}
            className="relative bg-black rounded-xl shadow-2xl border-2 border-gray-700"
            style={{ height: '65vh', aspectRatio: '9/16', maxWidth: '400px', overflow: 'visible' }}
          >
            {/* Video container with overflow hidden - clips video only */}
            <div className="absolute inset-0 overflow-hidden rounded-lg">
              {/* Crop Style Preview */}
              {clip.cropStyle === 'blur-bars' ? (
                /* BLUR BARS: Blurred background + centered video */
                <>
                  {/* Blurred background video - stays fixed */}
                  <video
                    ref={bgVideoRef}
                    src={clip.sourceVideoUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: 'blur(20px) brightness(0.6)', transform: 'scale(1.1)' }}
                    muted
                    playsInline
                  />
                  {/* Main video - transformed */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      ref={contentRef}
                      style={{
                        width: '100%',
                        aspectRatio: '16/9',
                        maxHeight: '100%',
                        transform: `scale(${currentTransform.scale}) translate(${currentTransform.x}%, ${currentTransform.y}%)`,
                        transformOrigin: 'center center',
                      }}
                    >
                      <video
                        ref={videoRef}
                        src={clip.sourceVideoUrl}
                        className="w-full h-full object-contain"
                        playsInline
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* CENTER CROP: Video fills and crops */
                <div
                  ref={contentRef}
                  className="absolute inset-0"
                  style={{
                    transform: `scale(${currentTransform.scale}) translate(${currentTransform.x}%, ${currentTransform.y}%)`,
                    transformOrigin: 'center center',
                  }}
                >
                  <video
                    ref={videoRef}
                    src={clip.sourceVideoUrl}
                    className="w-full h-full object-cover"
                    playsInline
                  />
                </div>
              )}
            </div>{/* End video container with overflow hidden */}

            {/* Content border and handles - outside clipping, visible when extending */}
            <div
              ref={contentBorderRef}
              className="absolute z-15 pointer-events-auto"
              style={{
                top: clip.cropStyle === 'blur-bars' ? '50%' : '0',
                left: clip.cropStyle === 'blur-bars' ? '50%' : '0',
                width: clip.cropStyle === 'blur-bars' ? '100%' : '100%',
                height: clip.cropStyle === 'blur-bars' ? 'auto' : '100%',
                aspectRatio: clip.cropStyle === 'blur-bars' ? '16/9' : undefined,
                maxHeight: clip.cropStyle === 'blur-bars' ? '100%' : undefined,
                transform: clip.cropStyle === 'blur-bars'
                  ? `translate(-50%, -50%) scale(${currentTransform.scale}) translate(${currentTransform.x}%, ${currentTransform.y}%)`
                  : `scale(${currentTransform.scale}) translate(${currentTransform.x}%, ${currentTransform.y}%)`,
                transformOrigin: 'center center',
              }}
              onMouseEnter={() => setIsContentHovered(true)}
              onMouseLeave={() => !isDraggingContent && !isResizingContent && setIsContentHovered(false)}
              onMouseDown={handleContentDragStart}
            >
              <div
                className={`relative w-full h-full cursor-move ${
                  isContentHovered || isDraggingContent || isResizingContent
                    ? 'border-2 border-white'
                    : 'border-2 border-transparent'
                }`}
              >
                {/* Corner resize handles - black dots with white border */}
                {(isContentHovered || isDraggingContent || isResizingContent) && (
                  <>
                    {['tl', 'tr', 'bl', 'br'].map((corner) => (
                      <div
                        key={corner}
                        onMouseDown={(e) => handleResizeStart(e, corner)}
                        className={`absolute w-3.5 h-3.5 bg-black rounded-full hover:bg-gray-700 z-30 border-2 border-white ${
                          corner === 'tl' || corner === 'br' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                        }`}
                        style={{
                          top: corner.includes('t') ? '-7px' : 'auto',
                          bottom: corner.includes('b') ? '-7px' : 'auto',
                          left: corner.includes('l') ? '-7px' : 'auto',
                          right: corner.includes('r') ? '-7px' : 'auto',
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Alignment Guides */}
            {showVerticalGuide && (
              <div
                className="absolute top-0 bottom-0 w-px bg-white pointer-events-none z-50"
                style={{ left: '50%', transform: 'translateX(-50%)' }}
              >
                {/* Top marker */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
                {/* Bottom marker */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
              </div>
            )}
            {showHorizontalGuide && (
              <div
                className="absolute left-0 right-0 h-px bg-white pointer-events-none z-50"
                style={{ top: '50%', transform: 'translateY(-50%)' }}
              >
                {/* Left marker */}
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full" />
                {/* Right marker */}
                <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full" />
              </div>
            )}

            {/* Frame-level clipping for text - contains text inside containers with overflow-hidden */}
            <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none z-10">
              {/* Caption - text inside container, both clipped at frame */}
              {clip.captionStyle !== 'none' && (caption.current || caption.upcoming) && (() => {
                const captionFont = getFontById(captionStyleSettings.fontId)
                const fontFamily = captionFont?.family || '"Arial Black", sans-serif'

                // Build text shadow
                const shadows: string[] = []
                if (captionStyleSettings.strokeEnabled && captionStyleSettings.strokeWidth > 0) {
                  const sw = captionStyleSettings.strokeWidth
                  const sc = captionStyleSettings.strokeColor
                  shadows.push(
                    `${sw}px ${sw}px 0 ${sc}`,
                    `-${sw}px -${sw}px 0 ${sc}`,
                    `${sw}px -${sw}px 0 ${sc}`,
                    `-${sw}px ${sw}px 0 ${sc}`,
                  )
                }
                if (captionStyleSettings.shadowEnabled) {
                  shadows.push(`${captionStyleSettings.shadowX}px ${captionStyleSettings.shadowY}px ${captionStyleSettings.shadowBlur}px ${captionStyleSettings.shadowColor}`)
                }

                return (
                  <div
                    className="absolute overflow-hidden"
                    style={{
                      left: `${captionPosition.x}%`,
                      top: `${captionPosition.y}%`,
                      transform: `translate(-50%, -50%) scale(${captionScale})`,
                      maxWidth: '90%',
                    }}
                  >
                    <div className="border-2 border-transparent rounded-lg">
                      <div className="p-3 overflow-hidden">
                        <div
                          className="text-center whitespace-nowrap"
                          style={{
                            fontFamily,
                            fontSize: `${captionStyleSettings.fontSize}px`,
                            fontWeight: captionStyleSettings.fontWeight,
                            letterSpacing: `${captionStyleSettings.letterSpacing}px`,
                            textTransform: captionStyleSettings.uppercase ? 'uppercase' : 'none',
                            color: captionStyleSettings.secondaryColor,
                            WebkitTextStroke: captionStyleSettings.strokeEnabled
                              ? `${captionStyleSettings.strokeWidth}px ${captionStyleSettings.strokeColor}`
                              : undefined,
                            textShadow: shadows.length > 0 ? shadows.join(', ') : undefined,
                          }}
                        >
                          <span style={{ color: captionStyleSettings.primaryColor }}>
                            {caption.current}
                          </span>
                          {caption.upcoming && (
                            <span style={{ marginLeft: '8px', color: captionStyleSettings.secondaryColor, opacity: 0.9 }}>
                              {caption.upcoming}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Title - text inside container, both clipped at frame (only when not editing) */}
              {clip.title && !isEditingTitle && (
                <div
                  className="absolute overflow-hidden"
                  style={{
                    left: `${titlePosition.x}%`,
                    top: `${titlePosition.y}%`,
                    transform: `translate(-50%, -50%) scale(${titleScale})`,
                    maxWidth: '90%', // Constrain width so overflow-hidden can clip
                  }}
                >
                  {/* Container clips text at its bounds */}
                  <div className="border-2 border-transparent rounded-lg">
                    <div className="p-3 overflow-hidden">
                      <div
                        className="text-center whitespace-nowrap"
                        style={{
                          fontFamily: '"Arial Black", "Arial Bold", Gadget, sans-serif',
                          fontSize: 'clamp(18px, 3.6vw, 26px)',
                          fontWeight: '900',
                          color: '#FFFFFF',
                          WebkitTextStroke: '2px #000000',
                          textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 2px 2px 4px rgba(0,0,0,0.5)',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {editedTitle}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Caption border and handles - outside frame clipping */}
            {clip.captionStyle !== 'none' && (caption.current || caption.upcoming) && (
              <div
                className="absolute z-20 pointer-events-auto"
                style={{
                  left: `${captionPosition.x}%`,
                  top: `${captionPosition.y}%`,
                  transform: `translate(-50%, -50%) scale(${captionScale})`,
                  maxWidth: '90%', // Match text container constraint
                }}
                onMouseEnter={() => setIsCaptionHovered(true)}
                onMouseLeave={() => !isDraggingCaption && !isResizingCaption && setIsCaptionHovered(false)}
                onMouseDown={handleCaptionDragStart}
              >
                <div
                  className={`relative cursor-move overflow-hidden ${
                    isCaptionHovered || isDraggingCaption || isResizingCaption
                      ? 'border-2 border-white rounded-lg'
                      : 'border-2 border-transparent'
                  }`}
                >
                  {/* Invisible text for sizing - clipped by overflow-hidden */}
                  <div className="invisible p-3 whitespace-nowrap" style={{
                    fontFamily: getFontById(captionStyleSettings.fontId)?.family || '"Arial Black", sans-serif',
                    fontSize: `${captionStyleSettings.fontSize}px`,
                    fontWeight: captionStyleSettings.fontWeight,
                    letterSpacing: `${captionStyleSettings.letterSpacing}px`,
                  }}>
                    {caption.current} {caption.upcoming}
                  </div>
                </div>
                {/* Corner resize handles - outside overflow-hidden so they're not clipped */}
                {(isCaptionHovered || isDraggingCaption || isResizingCaption) && (
                  <>
                    {['tl', 'tr', 'bl', 'br'].map((corner) => (
                      <div
                        key={corner}
                        onMouseDown={(e) => handleCaptionResizeStart(e, corner)}
                        className={`absolute w-3.5 h-3.5 bg-black rounded-full hover:bg-gray-700 border-2 border-white ${
                          corner === 'tl' || corner === 'br' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                        }`}
                        style={{
                          top: corner.includes('t') ? '-7px' : 'auto',
                          bottom: corner.includes('b') ? '-7px' : 'auto',
                          left: corner.includes('l') ? '-7px' : 'auto',
                          right: corner.includes('r') ? '-7px' : 'auto',
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Title border and handles - outside frame clipping */}
            {clip.title && (
              <div
                className="absolute z-20 pointer-events-auto"
                style={{
                  left: `${titlePosition.x}%`,
                  top: `${titlePosition.y}%`,
                  transform: `translate(-50%, -50%) scale(${titleScale})`,
                  maxWidth: '90%', // Match text container constraint
                }}
                onMouseEnter={() => setIsTitleHovered(true)}
                onMouseLeave={() => !isDraggingTitle && !isResizingTitle && setIsTitleHovered(false)}
                onMouseDown={!isEditingTitle ? handleTitleDragStart : undefined}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setIsEditingTitle(true)
                }}
              >
                <div
                  className={`relative cursor-move overflow-hidden ${
                    isTitleHovered || isDraggingTitle || isResizingTitle || isEditingTitle
                      ? 'border-2 border-white rounded-lg'
                      : 'border-2 border-transparent'
                  }`}
                >
                  {/* Title content - visible when editing, invisible otherwise (for sizing) */}
                  <div className={`p-3 whitespace-nowrap ${isEditingTitle ? '' : 'invisible'}`} style={{
                    fontSize: 'clamp(18px, 3.6vw, 26px)',
                    fontWeight: '900',
                  }}>
                    {isEditingTitle ? (
                      <input
                        ref={titleInputRef}
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        onBlur={() => setIsEditingTitle(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setIsEditingTitle(false)
                          } else if (e.key === 'Escape') {
                            setEditedTitle(clip.title)
                            setIsEditingTitle(false)
                          }
                        }}
                        className="bg-transparent text-center outline-none border-none"
                        style={{
                          fontFamily: '"Arial Black", "Arial Bold", Gadget, sans-serif',
                          fontSize: 'clamp(18px, 3.6vw, 26px)',
                          fontWeight: '900',
                          color: '#FFFFFF',
                          WebkitTextStroke: '2px #000000',
                          textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 2px 2px 4px rgba(0,0,0,0.5)',
                          letterSpacing: '0.5px',
                          minWidth: '100px',
                          caretColor: '#FFFF00',
                        }}
                      />
                    ) : (
                      editedTitle
                    )}
                  </div>
                </div>
                {/* Corner resize handles - outside overflow-hidden so they're not clipped */}
                {(isTitleHovered || isDraggingTitle || isResizingTitle) && !isEditingTitle && (
                  <>
                    {['tl', 'tr', 'bl', 'br'].map((corner) => (
                      <div
                        key={corner}
                        onMouseDown={(e) => handleTitleResizeStart(e, corner)}
                        className={`absolute w-3.5 h-3.5 bg-black rounded-full hover:bg-gray-700 border-2 border-white ${
                          corner === 'tl' || corner === 'br' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                        }`}
                        style={{
                          top: corner.includes('t') ? '-7px' : 'auto',
                          bottom: corner.includes('b') ? '-7px' : 'auto',
                          left: corner.includes('l') ? '-7px' : 'auto',
                          right: corner.includes('r') ? '-7px' : 'auto',
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            )}



          </div>
        </div>

          {/* Caption Style Panel (Right) */}
          {showCaptionPanel && (
            <CaptionStylePanel
              style={captionStyleSettings}
              onChange={setCaptionStyleSettings}
              onClose={() => setShowCaptionPanel(false)}
            />
          )}
        </div>{/* End of Upper Section flex container */}

        {/* Timeline */}
        <ProfessionalVideoTimeline
          videoRef={videoRef}
          segments={segments}
          currentTime={timelinePos}
          onSeek={handleSeek}
          onSegmentUpdate={handleSegmentUpdate}
          totalDuration={totalDuration}
          sourceDuration={sourceDuration}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          thumbnailBaseUrl={clip.thumbnailBaseUrl}
          videoUrl={clip.sourceVideoUrl}
        />
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
