import { NextRequest, NextResponse } from 'next/server'
import { createVideoBlueprint, saveBlueprintToFile } from '../../../lib/videoIntelligence'
import { readFile } from 'fs/promises'
import { join } from 'path'

// ========================================
// VIDEO BLUEPRINT GENERATION API
// ========================================
// Creates a comprehensive "blueprint" of the video using Google Cloud Video Intelligence API
// This is done ONCE per video and provides:
// - Shot changes (scene transitions)
// - Object tracking (ball, players, etc.)
// - Label detection (goal, celebration, etc.)
// - Face detection with emotions
// - Speech transcription with timestamps
// - Text detection (scoreboards, captions)
// - Logo recognition
//
// The blueprint is stored as JSON and can be queried instantly without API calls

export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  try {
    const { videoPath, videoId } = await request.json()

    if (!videoPath) {
      return NextResponse.json(
        { error: 'No video path provided' },
        { status: 400 }
      )
    }

    if (!videoId) {
      return NextResponse.json(
        { error: 'No video ID provided' },
        { status: 400 }
      )
    }

    addLog('info', 'Starting blueprint generation', {
      videoPath,
      videoId
    })

    console.log('\n========================================')
    console.log('🎬 BLUEPRINT GENERATION REQUEST')
    console.log('========================================')
    console.log('Video ID:', videoId)
    console.log('Video Path:', videoPath)
    console.log('========================================\n')

    // Convert public path to file system path
    const videoFilename = videoPath.split('/').pop()
    const videoFullPath = join(process.cwd(), 'public', 'uploads', videoFilename)

    // Read video file and convert to base64 for API
    // Note: For large videos (>10MB), you should upload to Google Cloud Storage
    // and use the GCS URI instead
    const videoBuffer = await readFile(videoFullPath)
    const videoBase64 = videoBuffer.toString('base64')

    addLog('info', 'Video file loaded, starting Video Intelligence API analysis', {
      sizeKB: (videoBuffer.length / 1024).toFixed(2)
    })

    // Check if file is too large for direct upload (>10MB)
    const fileSizeMB = videoBuffer.length / 1024 / 1024
    if (fileSizeMB > 10) {
      console.warn(`⚠️  Video file is ${fileSizeMB.toFixed(2)}MB`)
      console.warn('   For files > 10MB, consider uploading to Google Cloud Storage first')
      console.warn('   Set useGCS: true and provide gs:// URI')

      return NextResponse.json({
        error: 'Video file too large for direct upload',
        message: 'Please upload video to Google Cloud Storage and provide gs:// URI',
        sizeMB: fileSizeMB,
        suggestion: 'Upload to GCS bucket and use inputUri parameter'
      }, { status: 413 })
    }

    // Create the blueprint
    const blueprint = await createVideoBlueprint(videoBase64, videoId, {
      useGCS: false
    })

    // Save to file
    const blueprintPath = await saveBlueprintToFile(blueprint)

    addLog('success', 'Blueprint created successfully', {
      videoId,
      duration: blueprint.duration,
      shotChanges: blueprint.shotChanges.length,
      objects: blueprint.objects.length,
      labels: blueprint.labels.length,
      faces: blueprint.faces.length,
      transcriptSegments: blueprint.transcript.length,
      textDetections: blueprint.textDetections.length,
      cost: blueprint.analysisCost
    })

    return NextResponse.json({
      success: true,
      blueprint: {
        videoId: blueprint.videoId,
        duration: blueprint.duration,
        analyzedAt: blueprint.analyzedAt,
        cost: blueprint.analysisCost,
        stats: {
          shotChanges: blueprint.shotChanges.length,
          objectsTracked: blueprint.objects.length,
          labelsDetected: blueprint.labels.length,
          facesDetected: blueprint.faces.length,
          peopleDetected: blueprint.people.length,
          speechSegments: blueprint.transcript.length,
          textDetections: blueprint.textDetections.length,
          logosRecognized: blueprint.logos.length
        },
        blueprintPath
      },
      message: 'Blueprint created successfully. You can now query this video instantly!'
    })
  } catch (error: any) {
    console.error('❌ Blueprint generation error:', error)

    addLog('error', 'Blueprint generation failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to create video blueprint',
        details: error.message,
        suggestion: 'Check if GOOGLE_APPLICATION_CREDENTIALS environment variable is set'
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout (Vercel hobby plan limit)
