import { NextRequest, NextResponse } from 'next/server'
import { createGeminiVideoBlueprint, saveGeminiBlueprintToFile } from '../../../lib/geminiVideoBlueprint'

// ========================================
// GEMINI VIDEO BLUEPRINT API (Cost-Efficient!)
// ========================================
// Creates a video blueprint using Gemini 2.5 Flash
// Cost: ~$0.007 per 90-min video (14x cheaper than Video Intelligence API!)
//
// This is the ECONOMICAL approach for scale:
// - 1,000 videos = $7 (vs $100 with Video Intelligence)
// - 10,000 videos = $70 (vs $1,000 with Video Intelligence)

export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  try {
    const { videoPath, videoId, fps, assemblyAITranscript } = await request.json()

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

    // Check if Gemini API key is set
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      )
    }

    addLog('info', 'Starting Gemini visual + AssemblyAI audio blueprint', {
      videoPath,
      videoId,
      hasAudioData: !!assemblyAITranscript,
      estimatedCost: '$0.007 for 90-min video'
    })

    console.log('\n========================================')
    console.log('🎬 GEMINI + ASSEMBLYAI BLUEPRINT GENERATION')
    console.log('========================================')
    console.log('Video ID:', videoId)
    console.log('Video Path:', videoPath)
    console.log('Visual Analysis: Gemini 2.0 Flash')
    console.log('Audio Analysis:', assemblyAITranscript ? 'AssemblyAI (provided)' : 'None')
    console.log('Cost: ~$0.007 per 90-min video (visual only)')
    console.log('========================================\n')

    // Create the blueprint using Gemini (visual) + AssemblyAI (audio)
    const blueprint = await createGeminiVideoBlueprint(videoPath, videoId, {
      fps: fps || 1,
      useLocalFile: false,
      assemblyAITranscript // Pass AssemblyAI data for merging
    })

    // Save to file
    const blueprintPath = await saveGeminiBlueprintToFile(blueprint)

    addLog('success', 'Gemini blueprint created successfully', {
      videoId,
      duration: blueprint.duration,
      timelineEntries: blueprint.timeline.length,
      keyEvents: blueprint.keyEvents.length,
      labels: blueprint.labels.length,
      transcriptSegments: blueprint.transcript.length,
      cost: blueprint.analysisCost,
      model: blueprint.model
    })

    return NextResponse.json({
      success: true,
      blueprint: {
        videoId: blueprint.videoId,
        duration: blueprint.duration,
        analyzedAt: blueprint.analyzedAt,
        cost: blueprint.analysisCost,
        model: blueprint.model,
        stats: {
          timelineEntries: blueprint.timeline.length,
          keyEvents: blueprint.keyEvents.length,
          labelsDetected: blueprint.labels.length,
          transcriptSegments: blueprint.transcript.length,
          searchableKeywords: Object.keys(blueprint.searchIndex).length
        },
        blueprintPath
      },
      message: 'Gemini blueprint created! Cost: $' + blueprint.analysisCost.toFixed(4),
      comparison: {
        geminiCost: blueprint.analysisCost,
        videoIntelligenceCost: 0.10,
        savings: '14x cheaper!',
        scaleExample: {
          videos1000: {
            gemini: '$7',
            videoIntelligence: '$100'
          },
          videos10000: {
            gemini: '$70',
            videoIntelligence: '$1,000'
          }
        }
      }
    })
  } catch (error: any) {
    console.error('❌ Gemini blueprint generation error:', error)

    addLog('error', 'Gemini blueprint generation failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to create Gemini video blueprint',
        details: error.message,
        suggestion: 'Check if GEMINI_API_KEY environment variable is set correctly'
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout (Vercel hobby plan limit)
