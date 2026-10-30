/**
 * SIMPLIFIED EDITOR TYPES
 *
 * Single coordinate system: All times reference the SOURCE VIDEO
 * Timeline position is derived from array order, not stored separately
 */

// A single segment within a clip (references source video timestamps)
export interface Segment {
  id: string
  sourceStart: number  // Start time in source video (seconds)
  sourceEnd: number    // End time in source video (seconds)
  description?: string // Optional description from AI
}

// The clip being edited
export interface EditorClip {
  id: string
  title: string

  // Source video info
  sourceVideoUrl: string      // Original video URL (R2)
  sourceVideoDuration: number // Total duration of source video

  // Thumbnail info
  thumbnailBaseUrl?: string   // e.g., "https://r2.../thumbnails/video-id"

  // Segments (in playback order - array index = timeline position)
  segments: Segment[]

  // Styling options
  captionStyle: 'bold-center' | 'highlight' | 'minimal' | 'none'
  cropStyle: 'center-crop' | 'blur-bars'

  // Optional metadata
  description?: string
  transcript?: {
    text: string
    words: Array<{ word: string; start: number; end: number }>
  }
}

// Helper functions
export function getSegmentDuration(segment: Segment): number {
  return segment.sourceEnd - segment.sourceStart
}

export function getTotalDuration(segments: Segment[]): number {
  return segments.reduce((total, seg) => total + getSegmentDuration(seg), 0)
}

export function getTimelinePosition(segments: Segment[], segmentIndex: number): number {
  // Timeline position = sum of durations of all previous segments
  let position = 0
  for (let i = 0; i < segmentIndex; i++) {
    position += getSegmentDuration(segments[i])
  }
  return position
}

export function findSegmentAtTimelinePosition(
  segments: Segment[],
  timelinePos: number
): { segment: Segment; index: number; positionInSegment: number } | null {
  let cumulativeTime = 0

  for (let i = 0; i < segments.length; i++) {
    const duration = getSegmentDuration(segments[i])
    const segmentEnd = cumulativeTime + duration

    if (timelinePos >= cumulativeTime && timelinePos <= segmentEnd) {
      return {
        segment: segments[i],
        index: i,
        positionInSegment: timelinePos - cumulativeTime
      }
    }

    cumulativeTime = segmentEnd
  }

  return null
}

export function mapTimelineToSource(
  segments: Segment[],
  timelinePos: number
): number | null {
  const result = findSegmentAtTimelinePosition(segments, timelinePos)
  if (!result) return null

  return result.segment.sourceStart + result.positionInSegment
}

export function getThumbnailUrl(
  baseUrl: string | undefined,
  sourceTime: number
): string | null {
  if (!baseUrl) return null

  // Thumbnails are generated at 1fps, starting from frame 1
  const frameIndex = Math.floor(sourceTime) + 1
  return `${baseUrl}/thumb_${frameIndex.toString().padStart(4, '0')}.jpg`
}

// Convert AI clip format to EditorClip
export function aiClipToEditorClip(
  aiClip: any,
  sourceVideoUrl: string,
  sourceVideoDuration: number,
  clipId: string,
  thumbnailBaseUrl?: string
): EditorClip {
  let segments: Segment[]

  if (aiClip.clipType === 'multi-scene' && aiClip.scenes?.length > 0) {
    // Multi-scene: convert each scene to a segment
    segments = aiClip.scenes
      .filter((scene: any) => {
        const start = scene.startTime ?? scene.start ?? 0
        const end = scene.endTime ?? scene.end ?? start
        return end > start // Filter invalid scenes
      })
      .map((scene: any, index: number) => ({
        id: `segment-${index}`,
        sourceStart: scene.startTime ?? scene.start ?? 0,
        sourceEnd: scene.endTime ?? scene.end ?? 0,
        description: scene.description || `Scene ${index + 1}`
      }))
  } else {
    // Single-scene: one segment covering the whole clip
    segments = [{
      id: 'segment-0',
      sourceStart: aiClip.startTime ?? 0,
      sourceEnd: aiClip.endTime ?? 0,
      description: aiClip.description || 'Main clip'
    }]
  }

  return {
    id: clipId,
    title: aiClip.title || 'Untitled Clip',
    sourceVideoUrl,
    sourceVideoDuration,
    thumbnailBaseUrl,
    segments,
    captionStyle: 'bold-center',
    cropStyle: 'center-crop',
    description: aiClip.description,
    transcript: undefined // Will be set separately if needed
  }
}
