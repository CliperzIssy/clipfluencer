// ========================================
// GOOGLE CLOUD VIDEO INTELLIGENCE SERVICE
// ========================================
// This service creates a "blueprint" of the video containing:
// - Shot changes (scene transitions)
// - Object tracking (ball, players, faces, cars, etc.)
// - Label detection (goal, celebration, explosion, etc.)
// - Facial expressions and emotions
// - Audio amplitude and speech transcription
// - Text detection (scoreboards, captions)
// - Logo recognition
//
// This is analyzed ONCE and stored as JSON for instant querying.
// No rate limits, no token limits, instant database searches.

import { VideoIntelligenceServiceClient } from '@google-cloud/video-intelligence'
import { writeFile } from 'fs/promises'
import { join } from 'path'

// Initialize the Video Intelligence client
// Make sure GOOGLE_APPLICATION_CREDENTIALS env var is set
const client = new VideoIntelligenceServiceClient()

export interface VideoBlueprint {
  videoId: string
  filename: string
  duration: number
  analyzedAt: string
  analysisCost: number

  // Shot changes (scene transitions)
  shotChanges: Array<{
    startTime: number
    endTime: number
  }>

  // Object tracking (ball, players, cars, etc.)
  objects: Array<{
    description: string
    confidence: number
    frames: Array<{
      timestamp: number
      boundingBox: {
        left: number
        top: number
        right: number
        bottom: number
      }
    }>
  }>

  // Label detection (goal, celebration, etc.)
  labels: Array<{
    description: string
    confidence: number
    segments: Array<{
      startTime: number
      endTime: number
      confidence: number
    }>
  }>

  // Face detection
  faces: Array<{
    trackId: number
    frames: Array<{
      timestamp: number
      boundingBox: {
        left: number
        top: number
        right: number
        bottom: number
      }
      // Emotions: joy, sorrow, anger, surprise
      attributes?: {
        joy?: number
        sorrow?: number
        anger?: number
        surprise?: number
      }
    }>
  }>

  // Person detection
  people: Array<{
    trackId: number
    frames: Array<{
      timestamp: number
      boundingBox: {
        left: number
        top: number
        right: number
        bottom: number
      }
      attributes?: {
        upperBodyColor?: string
        lowerBodyColor?: string
      }
    }>
  }>

  // Speech transcription
  transcript: Array<{
    startTime: number
    endTime: number
    text: string
    confidence: number
    words: Array<{
      word: string
      startTime: number
      endTime: number
      confidence: number
    }>
  }>

  // Text detection (on-screen text, scoreboards)
  textDetections: Array<{
    text: string
    segments: Array<{
      startTime: number
      endTime: number
      confidence: number
      frames: Array<{
        timestamp: number
        boundingBox: {
          left: number
          top: number
          right: number
          bottom: number
        }
      }>
    }>
  }>

  // Logo recognition
  logos: Array<{
    description: string
    segments: Array<{
      startTime: number
      endTime: number
      confidence: number
    }>
  }>
}

/**
 * Analyze video and create a comprehensive "blueprint"
 * This is done ONCE per video and stored permanently
 */
export async function createVideoBlueprint(
  videoPath: string,
  videoId: string,
  options?: {
    useGCS?: boolean // If true, videoPath should be gs:// URL
  }
): Promise<VideoBlueprint> {
  console.log('\n========================================')
  console.log('🎬 CREATING VIDEO BLUEPRINT')
  console.log('========================================')
  console.log('Video ID:', videoId)
  console.log('Path:', videoPath)
  console.log('Using Google Cloud Video Intelligence API')
  console.log('Extracting: shots, objects, labels, faces, speech, text, logos')
  console.log('This is a ONE-TIME analysis (no rate limits on queries after)')
  console.log('========================================\n')

  const startTime = Date.now()

  // Configure the request with ALL features
  const request: any = {
    inputUri: options?.useGCS ? videoPath : undefined,
    inputContent: options?.useGCS ? undefined : videoPath, // Base64 encoded video
    features: [
      'SHOT_CHANGE_DETECTION',
      'LABEL_DETECTION',
      'OBJECT_TRACKING',
      'FACE_DETECTION',
      'PERSON_DETECTION',
      'SPEECH_TRANSCRIPTION',
      'TEXT_DETECTION',
      'LOGO_RECOGNITION',
      'EXPLICIT_CONTENT_DETECTION'
    ],
    videoContext: {
      speechTranscriptionConfig: {
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        enableSpeakerDiarization: true
      }
    }
  }

  console.log('🚀 Starting Video Intelligence API analysis...')
  console.log('   This may take several minutes for long videos')

  // Start the video analysis operation
  const [operation] = await client.annotateVideo(request)

  console.log('⏳ Processing video... (operation:', operation.name, ')')

  // Wait for the operation to complete
  const [operationResult] = await operation.promise()

  const processingTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2)
  console.log(`✅ Analysis complete in ${processingTime} minutes`)

  // Extract annotations
  const annotations = operationResult.annotationResults?.[0]

  if (!annotations) {
    throw new Error('No annotations returned from Video Intelligence API')
  }

  // Parse shot changes
  const shotChanges = (annotations.shotAnnotations || []).map((shot: any) => ({
    startTime: parseTime(shot.startTimeOffset),
    endTime: parseTime(shot.endTimeOffset)
  }))

  console.log(`📊 Extracted ${shotChanges.length} shot changes`)

  // Parse object tracking
  const objects = (annotations.objectAnnotations || []).map((obj: any) => {
    const frames = (obj.frames || []).map((frame: any) => ({
      timestamp: parseTime(frame.timeOffset),
      boundingBox: {
        left: frame.normalizedBoundingBox?.left || 0,
        top: frame.normalizedBoundingBox?.top || 0,
        right: frame.normalizedBoundingBox?.right || 0,
        bottom: frame.normalizedBoundingBox?.bottom || 0
      }
    }))

    return {
      description: obj.entity?.description || 'unknown',
      confidence: obj.confidence || 0,
      frames
    }
  })

  console.log(`🎯 Tracked ${objects.length} objects`)

  // Parse label detection
  const labels = (annotations.segmentLabelAnnotations || []).map((label: any) => {
    const segments = (label.segments || []).map((seg: any) => ({
      startTime: parseTime(seg.segment?.startTimeOffset),
      endTime: parseTime(seg.segment?.endTimeOffset),
      confidence: seg.confidence || 0
    }))

    return {
      description: label.entity?.description || 'unknown',
      confidence: label.categoryEntities?.[0]?.description || '',
      segments
    }
  })

  console.log(`🏷️  Detected ${labels.length} labels`)

  // Parse face detection
  const faces = (annotations.faceDetectionAnnotations || []).map((face: any) => {
    const frames = (face.tracks?.[0]?.timestampedObjects || []).map((obj: any) => {
      const attrs = obj.attributes || []
      return {
        timestamp: parseTime(obj.timeOffset),
        boundingBox: {
          left: obj.normalizedBoundingBox?.left || 0,
          top: obj.normalizedBoundingBox?.top || 0,
          right: obj.normalizedBoundingBox?.right || 0,
          bottom: obj.normalizedBoundingBox?.bottom || 0
        },
        attributes: {
          joy: attrs.find((a: any) => a.name === 'joy')?.confidence,
          sorrow: attrs.find((a: any) => a.name === 'sorrow')?.confidence,
          anger: attrs.find((a: any) => a.name === 'anger')?.confidence,
          surprise: attrs.find((a: any) => a.name === 'surprise')?.confidence
        }
      }
    })

    return {
      trackId: face.tracks?.[0]?.id || 0,
      frames
    }
  })

  console.log(`👤 Detected ${faces.length} faces`)

  // Parse person detection
  const people = (annotations.personDetectionAnnotations || []).map((person: any) => {
    const frames = (person.tracks || []).flatMap((track: any) =>
      (track.timestampedObjects || []).map((obj: any) => ({
        timestamp: parseTime(obj.timeOffset),
        boundingBox: {
          left: obj.normalizedBoundingBox?.left || 0,
          top: obj.normalizedBoundingBox?.top || 0,
          right: obj.normalizedBoundingBox?.right || 0,
          bottom: obj.normalizedBoundingBox?.bottom || 0
        },
        attributes: obj.attributes
      }))
    )

    return {
      trackId: person.tracks?.[0]?.id || 0,
      frames
    }
  })

  console.log(`🚶 Detected ${people.length} people`)

  // Parse speech transcription
  const transcript = (annotations.speechTranscriptions || []).flatMap((trans: any) =>
    (trans.alternatives || []).map((alt: any) => ({
      startTime: parseTime(alt.words?.[0]?.startTime),
      endTime: parseTime(alt.words?.[alt.words.length - 1]?.endTime),
      text: alt.transcript || '',
      confidence: alt.confidence || 0,
      words: (alt.words || []).map((word: any) => ({
        word: word.word || '',
        startTime: parseTime(word.startTime),
        endTime: parseTime(word.endTime),
        confidence: word.confidence || 0
      }))
    }))
  )

  console.log(`🗣️  Transcribed ${transcript.length} speech segments`)

  // Parse text detection
  const textDetections = (annotations.textAnnotations || []).map((text: any) => ({
    text: text.text || '',
    segments: (text.segments || []).map((seg: any) => ({
      startTime: parseTime(seg.segment?.startTimeOffset),
      endTime: parseTime(seg.segment?.endTimeOffset),
      confidence: seg.confidence || 0,
      frames: (seg.frames || []).map((frame: any) => ({
        timestamp: parseTime(frame.timeOffset),
        boundingBox: {
          left: frame.rotatedBoundingBox?.vertices?.[0]?.x || 0,
          top: frame.rotatedBoundingBox?.vertices?.[0]?.y || 0,
          right: frame.rotatedBoundingBox?.vertices?.[2]?.x || 0,
          bottom: frame.rotatedBoundingBox?.vertices?.[2]?.y || 0
        }
      }))
    }))
  }))

  console.log(`📝 Detected ${textDetections.length} text elements`)

  // Parse logo recognition
  const logos = (annotations.logoRecognitionAnnotations || []).map((logo: any) => ({
    description: logo.entity?.description || 'unknown',
    segments: (logo.segments || []).map((seg: any) => ({
      startTime: parseTime(seg.startTimeOffset),
      endTime: parseTime(seg.endTimeOffset),
      confidence: seg.confidence || 0
    }))
  }))

  console.log(`🔖 Recognized ${logos.length} logos`)

  // Get video duration from last shot change
  const duration = shotChanges.length > 0
    ? shotChanges[shotChanges.length - 1].endTime
    : 0

  // Estimate cost (approximate)
  const durationMinutes = duration / 60
  const estimatedCost = durationMinutes * 0.10 // ~$0.10 per minute

  console.log('\n========================================')
  console.log('✅ BLUEPRINT CREATED')
  console.log('========================================')
  console.log('Duration:', duration.toFixed(2), 'seconds')
  console.log('Estimated cost: $' + estimatedCost.toFixed(4))
  console.log('Processing time:', processingTime, 'minutes')
  console.log('========================================\n')

  const blueprint: VideoBlueprint = {
    videoId,
    filename: videoPath,
    duration,
    analyzedAt: new Date().toISOString(),
    analysisCost: estimatedCost,
    shotChanges,
    objects,
    labels,
    faces,
    people,
    transcript,
    textDetections,
    logos
  }

  return blueprint
}

/**
 * Save blueprint to JSON file
 */
export async function saveBlueprintToFile(
  blueprint: VideoBlueprint,
  outputDir: string = 'public/blueprints'
): Promise<string> {
  const filename = `blueprint-${blueprint.videoId}.json`
  const filepath = join(process.cwd(), outputDir, filename)

  await writeFile(filepath, JSON.stringify(blueprint, null, 2), 'utf8')

  console.log('💾 Blueprint saved to:', filepath)
  console.log('   Size:', (JSON.stringify(blueprint).length / 1024).toFixed(2), 'KB')

  return filepath
}

/**
 * Helper: Parse time offset from Video Intelligence API format
 */
function parseTime(timeOffset: any): number {
  if (!timeOffset) return 0

  const seconds = parseInt(timeOffset.seconds || '0', 10)
  const nanos = parseInt(timeOffset.nanos || '0', 10)

  return seconds + nanos / 1e9
}

/**
 * Query blueprint using natural language
 * This is where we use Gemini to interpret the query and search the blueprint
 */
export async function queryBlueprint(
  blueprint: VideoBlueprint,
  query: string,
  geminiApiKey: string
): Promise<{
  results: Array<{
    timestamp: number
    description: string
    type: string
  }>
  interpretation: string
}> {
  console.log('\n🔍 Querying blueprint:', query)

  // TODO: Use Gemini to interpret the query
  // For now, return a simple example

  return {
    results: [],
    interpretation: 'Query interpretation coming soon'
  }
}
