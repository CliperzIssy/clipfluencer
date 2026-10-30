import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { VideoBlueprint } from '../../../lib/videoIntelligence'

// ========================================
// LIST VIDEO BLUEPRINTS
// ========================================
// Returns a list of all available video blueprints for chat querying

export async function GET() {
  try {
    const blueprintsDir = join(process.cwd(), 'public', 'blueprints')

    // Read all blueprint files (various types)
    const files = await readdir(blueprintsDir)
    const blueprintFiles = files.filter(f =>
      f.endsWith('.json') &&
      (f.includes('blueprint') || f.includes('frame'))
    )

    console.log(`📋 Found ${blueprintFiles.length} blueprint files`)

    // Load summary info from each blueprint (handle different types)
    const blueprints = await Promise.all(
      blueprintFiles.map(async (filename) => {
        try {
          const filepath = join(blueprintsDir, filename)
          const data = await readFile(filepath, 'utf8')
          const blueprint = JSON.parse(data)

          // Handle frame-by-frame blueprints
          if (filename.startsWith('frame-blueprint-')) {
            return {
              videoId: blueprint.videoId,
              type: 'frame-by-frame',
              duration: blueprint.duration,
              analyzedAt: blueprint.metadata?.analyzedAt,
              cost: blueprint.metadata?.cost,
              stats: {
                frameCount: blueprint.frames?.length || 0,
                fps: blueprint.fps || 1
              }
            }
          }

          // Handle gemini blueprints
          if (filename.startsWith('gemini-blueprint-')) {
            return {
              videoId: blueprint.videoId,
              type: 'gemini',
              filename: blueprint.filename,
              duration: blueprint.duration,
              analyzedAt: blueprint.analyzedAt,
              cost: blueprint.analysisCost,
              stats: {
                timelineEntries: blueprint.timeline?.length || 0,
                keyEvents: blueprint.keyEvents?.length || 0,
                labels: blueprint.labels?.length || 0,
                searchableKeywords: Object.keys(blueprint.searchIndex || {}).length
              }
            }
          }

          // Handle old Video Intelligence blueprints
          if (filename.startsWith('blueprint-')) {
            return {
              videoId: blueprint.videoId,
              type: 'video-intelligence',
              filename: blueprint.filename,
              duration: blueprint.duration,
              analyzedAt: blueprint.analyzedAt,
              cost: blueprint.analysisCost,
              stats: {
                shotChanges: blueprint.shotChanges?.length || 0,
                objects: blueprint.objects?.length || 0,
                labels: blueprint.labels?.length || 0,
                faces: blueprint.faces?.length || 0,
                speechSegments: blueprint.transcript?.length || 0,
                textDetections: blueprint.textDetections?.length || 0,
                logos: blueprint.logos?.length || 0
              }
            }
          }

          // Unknown type - return basic info
          return {
            videoId: filename.replace('.json', ''),
            type: 'unknown',
            filename: filename
          }
        } catch (err) {
          console.error(`Error loading ${filename}:`, err)
          return null
        }
      })
    )

    // Filter out null entries (failed loads)
    const validBlueprints = blueprints.filter(b => b !== null)

    return NextResponse.json({
      success: true,
      total: validBlueprints.length,
      blueprints: validBlueprints
    })
  } catch (error: any) {
    console.error('Error listing blueprints:', error)

    return NextResponse.json(
      {
        error: 'Failed to list blueprints',
        details: error.message
      },
      { status: 500 }
    )
  }
}
