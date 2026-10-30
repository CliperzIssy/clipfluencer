import { NextRequest, NextResponse } from 'next/server'
import { loadGeminiBlueprint, queryGeminiBlueprint } from '../../../lib/geminiVideoBlueprint'

// ========================================
// GEMINI VIDEO CHAT API (Cost-Efficient)
// ========================================
// Query videos using natural language by searching Gemini blueprints
// Cost: ~$0.0001 per query
// Speed: <1 second
// NO RATE LIMITS (blueprint is already stored!)

export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  let videoId = ''
  try {
    const body = await request.json()
    videoId = body.videoId
    const query = body.query

    if (!videoId) {
      return NextResponse.json(
        { error: 'No video ID provided' },
        { status: 400 }
      )
    }

    if (!query) {
      return NextResponse.json(
        { error: 'No query provided' },
        { status: 400 }
      )
    }

    console.log('\n========================================')
    console.log('💬 GEMINI VIDEO CHAT QUERY')
    console.log('========================================')
    console.log('Video ID:', videoId)
    console.log('Query:', query)
    console.log('Cost: ~$0.0001 per query')
    console.log('========================================\n')

    addLog('info', 'Gemini video chat query received', { videoId, query })

    // Load the Gemini blueprint from storage
    const blueprint = await loadGeminiBlueprint(videoId)

    console.log('📊 Gemini blueprint loaded')
    console.log('   Duration:', blueprint.duration, 'seconds')
    console.log('   Timeline entries:', blueprint.timeline.length)
    console.log('   Key events:', blueprint.keyEvents.length)
    console.log('   Labels:', blueprint.labels.length)

    // Query the blueprint
    const result = await queryGeminiBlueprint(blueprint, query)

    console.log('\n✅ Query complete')
    console.log('   Found:', result.results?.length || 0, 'results')
    console.log('   Interpretation:', result.interpretation)

    addLog('success', 'Gemini video chat query completed', {
      videoId,
      query,
      resultsFound: result.results?.length || 0
    })

    return NextResponse.json({
      success: true,
      query,
      videoId,
      ...result,
      metadata: {
        videoDuration: blueprint.duration,
        blueprintStats: {
          timelineEntries: blueprint.timeline.length,
          keyEvents: blueprint.keyEvents.length,
          labels: blueprint.labels.length,
          transcriptSegments: blueprint.transcript.length
        },
        model: blueprint.model,
        cost: '~$0.0001'
      }
    })
  } catch (error: any) {
    console.error('❌ Gemini video chat error:', error)

    // Check if blueprint doesn't exist
    if (error.message?.includes('ENOENT') || error.message?.includes('no such file')) {
      return NextResponse.json(
        {
          error: 'Blueprint not found',
          message: 'Please create a blueprint for this video first using /api/create-gemini-blueprint',
          videoId
        },
        { status: 404 }
      )
    }

    addLog('error', 'Gemini video chat query failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to process video chat query',
        details: error.message
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 60 // 1 minute timeout
