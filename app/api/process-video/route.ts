import { NextRequest, NextResponse } from 'next/server'

/**
 * API endpoint to trigger Modal video processing
 * Called after video is uploaded to R2
 */
export async function POST(request: NextRequest) {
  try {
    const { video_url, video_key, fileKey } = await request.json()

    if (!video_url && !fileKey) {
      return NextResponse.json(
        { error: 'video_url or fileKey is required' },
        { status: 400 }
      )
    }

    // Use fileKey if provided (from R2 upload), otherwise use video_url
    const finalVideoUrl = video_url || `${process.env.R2_PUBLIC_URL}/${fileKey}`
    const finalVideoKey = video_key || fileKey

    console.log(`🚀 Triggering Modal video processing...`)
    console.log(`   Video URL: ${finalVideoUrl}`)
    console.log(`   Video Key: ${finalVideoKey}`)

    // Call Modal webhook
    const modalUrl = `${process.env.MODAL_WEBHOOK_URL}/process`

    console.log(`   Modal endpoint: ${modalUrl}`)

    const response = await fetch(modalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_url: finalVideoUrl,
        video_key: finalVideoKey,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Modal processing failed:', response.status, errorText)
      throw new Error(`Modal returned ${response.status}: ${errorText}`)
    }

    const result = await response.json()
    console.log('✅ Modal processing triggered successfully!')
    console.log('   Result:', JSON.stringify(result, null, 2))

    return NextResponse.json({
      success: true,
      message: 'Video processing started',
      result,
    })
  } catch (error: any) {
    console.error('Error triggering Modal processing:', error)
    return NextResponse.json(
      {
        error: 'Failed to start video processing',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
