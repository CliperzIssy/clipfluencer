import { NextRequest, NextResponse } from 'next/server'
import { analyzeVideoDirectly, saveFrameByFrameBlueprint } from '../../../lib/geminiFrameByFrame'

// ========================================
// FRAME-BY-FRAME BLUEPRINT API
// ========================================
// Analyzes EVERY second of video for comprehensive search
// No more "key moments" - we capture EVERYTHING

export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  try {
    const { videoPath, videoId, assemblyAITranscript } = await request.json()

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

    addLog('info', 'Starting frame-by-frame analysis', {
      videoPath,
      videoId,
      hasAudioData: !!assemblyAITranscript
    })

    console.log('\n========================================')
    console.log('🎬 FRAME-BY-FRAME BLUEPRINT GENERATION')
    console.log('========================================')
    console.log('Video ID:', videoId)
    console.log('Strategy: Analyze EVERY second')
    console.log('Goal: Enable queries like "person in red shirt waving"')
    console.log('========================================\n')

    // Use direct video analysis (more reliable than frame extraction)
    const blueprint = await analyzeVideoDirectly(
      videoPath,
      videoId,
      assemblyAITranscript
    )

    console.log('✅ Blueprint generated:', {
      videoId: blueprint.videoId,
      frameCount: blueprint.frames?.length || 0,
      duration: blueprint.duration
    })

    // Save blueprint
    const blueprintPath = await saveFrameByFrameBlueprint(blueprint)
    console.log('✅ Blueprint saved to:', blueprintPath)

    addLog('success', 'Frame-by-frame blueprint created', {
      videoId,
      duration: blueprint.duration,
      frameCount: blueprint.frames.length,
      cost: blueprint.metadata.cost
    })

    return NextResponse.json({
      success: true,
      blueprint: {
        videoId: blueprint.videoId,
        duration: blueprint.duration || 0,
        frameCount: blueprint.frames?.length || 0,
        cost: blueprint.metadata?.cost || 0.05,
        analyzedAt: blueprint.metadata?.analyzedAt || new Date().toISOString()
      },
      blueprintPath,
      message: `Analyzed ${blueprint.frames?.length || 0} frames for comprehensive search`
    })
  } catch (error: any) {
    console.error('❌ Frame blueprint generation error:', error)

    addLog('error', 'Frame blueprint generation failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to create frame-by-frame blueprint',
        details: error.message
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout (Vercel hobby plan limit)