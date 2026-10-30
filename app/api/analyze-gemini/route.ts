import { NextRequest, NextResponse } from 'next/server'
import { runGeminiVisualAnalysis } from '../../../lib/geminiAnalysis'

// ========================================
// UNIFIED GEMINI 2.5 FLASH ANALYSIS API ROUTE
// ========================================
export async function POST(request: NextRequest) {
  // Import logging
  const { addLog } = await import('../logs/route')

  try {
    const { videoPath, transcript, metadata } = await request.json()

    if (!videoPath) {
      return NextResponse.json(
        { error: 'No video path provided' },
        { status: 400 }
      )
    }

    // Call the core analysis function
    const result = await runGeminiVisualAnalysis({
      videoPath,
      transcript,
      metadata,
      addLog
    })

    // Return the result directly
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('❌ Error in Gemini analysis route:', error)

    addLog('error', 'Gemini 2.5 analysis failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to analyze video with Gemini 2.5',
        details: error.message,
        suggestion: 'Check if the video file is valid and under 2GB'
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout (Vercel hobby plan limit)
