import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { queryFrameByFrameBlueprint } from '../../../lib/geminiFrameByFrame'

export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  try {
    const { videoId, query } = await request.json()

    if (!videoId || !query) {
      return NextResponse.json(
        { error: 'Missing videoId or query' },
        { status: 400 }
      )
    }

    console.log('🔍 Frame search query:', query)

    // Load blueprint
    const blueprintPath = join(
      process.cwd(),
      'public/blueprints',
      `frame-blueprint-${videoId}.json`
    )

    const blueprintData = await readFile(blueprintPath, 'utf8')
    const blueprint = JSON.parse(blueprintData)

    // Search frames
    const results = await queryFrameByFrameBlueprint(blueprint, query)

    addLog('info', 'Frame search completed', {
      videoId,
      query,
      resultsFound: results.results.length
    })

    return NextResponse.json({
      success: true,
      query,
      results: results.results,
      totalFrames: blueprint.frames.length,
      interpretation: `Found ${results.results.length} frames matching "${query}"`
    })
  } catch (error: any) {
    console.error('❌ Frame search error:', error)

    return NextResponse.json(
      {
        error: 'Failed to search frames',
        details: error.message
      },
      { status: 500 }
    )
  }
}