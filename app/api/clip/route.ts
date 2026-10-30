import { NextRequest, NextResponse } from 'next/server'

// ========================================
// CLIP RENDERING API - MODAL CLOUD VERSION
// ========================================
// All FFmpeg rendering is done on Modal cloud servers.
// This endpoint simply forwards the request to Modal.
//
// Benefits:
// - Works for all users (no local FFmpeg needed)
// - Scales automatically with Modal
// - 1-hour timeout for long videos
// - Production-ready for commercial use

const MODAL_WEBHOOK_URL = process.env.MODAL_WEBHOOK_URL || 'https://cliperzissy--clipfluencer-video-processor-fastapi-app.modal.run'
const R2_PUBLIC_URL = 'https://pub-2ae315c752e74a34be839fc681f792d8.r2.dev'

/**
 * Extract R2 key from a public R2 URL
 * Example: "https://pub-xxx.r2.dev/uploads/video.mp4" -> "uploads/video.mp4"
 */
function extractR2Key(videoPath: string): string {
  if (videoPath.startsWith(R2_PUBLIC_URL)) {
    return videoPath.replace(R2_PUBLIC_URL + '/', '')
  }
  // Handle other R2 URL formats
  if (videoPath.startsWith('https://pub-')) {
    const urlParts = videoPath.split('.r2.dev/')
    if (urlParts.length > 1) {
      return urlParts[1]
    }
  }
  // Legacy local path - extract filename and assume uploads/
  if (videoPath.startsWith('/uploads/')) {
    return videoPath.replace('/uploads/', 'uploads/')
  }
  // Return as-is if already a key
  return videoPath
}

export async function POST(request: NextRequest) {
  // Import logging
  const { addLog } = await import('../logs/route')

  try {
    const {
      videoPath,
      startTime,
      endTime,
      clipNumber,
      captionStyle = 'none',
      customCaptionText = '',
      transcript = null,
      clipType = 'single-scene',
      scenes = null,
      cropStyle = 'center-crop',
      title = ''
    } = await request.json()

    // Validate required parameters
    if (!videoPath || startTime === undefined || endTime === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Extract R2 key from video path
    const videoKey = extractR2Key(videoPath)

    console.log('🎬 Sending clip render request to Modal...')
    console.log(`   Video: ${videoKey}`)
    console.log(`   Time: ${startTime}s - ${endTime}s`)
    console.log(`   Type: ${clipType}`)
    console.log(`   Caption style: ${captionStyle}`)
    console.log(`   Crop style: ${cropStyle}`)

    addLog('info', 'Sending clip to Modal for rendering', {
      videoKey,
      startTime,
      endTime,
      clipType,
      captionStyle,
      cropStyle
    })

    // Call Modal render-clip endpoint
    const modalResponse = await fetch(`${MODAL_WEBHOOK_URL}/render-clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_url: videoPath,
        video_key: videoKey,
        start_time: startTime,
        end_time: endTime,
        clip_number: clipNumber,
        caption_style: captionStyle,
        custom_caption_text: customCaptionText || null,
        transcript: transcript,
        clip_type: clipType,
        scenes: scenes,
        crop_style: cropStyle,
        title: title || null,
      }),
    })

    if (!modalResponse.ok) {
      const errorText = await modalResponse.text()
      console.error('❌ Modal render failed:', errorText)
      addLog('error', 'Modal render failed', { error: errorText })
      return NextResponse.json(
        { error: 'Failed to render clip on Modal', details: errorText },
        { status: 500 }
      )
    }

    const result = await modalResponse.json()

    if (!result.success) {
      console.error('❌ Modal render returned error:', result)
      addLog('error', 'Modal render returned error', result)
      return NextResponse.json(
        { error: 'Clip rendering failed', details: result },
        { status: 500 }
      )
    }

    console.log('✅ Clip rendered successfully on Modal!')
    console.log(`   URL: ${result.clip_url}`)
    console.log(`   Duration: ${result.duration}s`)

    addLog('success', 'Clip rendered on Modal', {
      clipUrl: result.clip_url,
      duration: result.duration,
      clipNumber: result.clip_number
    })

    // Return R2 URL (compatible with existing frontend)
    return NextResponse.json({
      outputPath: result.clip_url,  // R2 public URL
      filename: result.filename,
      duration: result.duration,
      renderedOnCloud: true,
    })

  } catch (error: any) {
    console.error('❌ Clip API error:', error)

    return NextResponse.json(
      { error: 'Failed to create clip', details: error.message },
      { status: 500 }
    )
  }
}

// Timeout can be shorter now since we're just making an API call
// The actual rendering timeout is handled by Modal (1 hour)
export const maxDuration = 60 // 1 minute for API call overhead
