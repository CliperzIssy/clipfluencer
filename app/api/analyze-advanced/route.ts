import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// ========================================
// TYPES
// ========================================
interface VisualEvent {
  startTime: number
  endTime: number
  visualType: string
  description: string
  viralPotential: number
  emotionalIntensity: string
  transcriptText?: string
  hasDialogue?: boolean
  wordCount?: number
}

interface MultiSceneClip {
  scenes: Array<[number, number]>
  combinedDuration: number
  theme: string
  viralPotential: number
  suggestedTransitions?: string[]
}

interface AlignedMoment {
  startTime: number
  endTime: number
  scores: {
    audioHook: number
    visualHook: number
    emotionalPeak: number
    trendRelevance: number
    combined: number
  }
  content: {
    transcript: string
    visualDescription: string
    emotionalContext: string
    sceneQuality: string
  }
  clipType: 'single-scene' | 'multi-scene'
  scenes?: Array<{
    start: number
    end: number
    description: string
    transition?: string
  }>
  reasoning?: string
}

// ========================================
// LOGGING
// ========================================
function logSection(title: string) {
  console.log('\n' + '='.repeat(60))
  console.log(`🚀 ${title}`)
  console.log('='.repeat(60))
}

// ========================================
// TIMESTAMP ALIGNMENT
// ========================================
function alignMultiModalData(
  transcript: any,
  visualAnalysis: any,
  contentAnalysis: any
): AlignedMoment[] {
  const alignedMoments: AlignedMoment[] = []

  // Process single-scene visual events
  if (visualAnalysis.visualEvents) {
    visualAnalysis.visualEvents.forEach((visualEvent: VisualEvent) => {
      // Find corresponding transcript segments
      const transcriptSegments = transcript.segments?.filter((seg: any) => {
        const segStart = seg.start || 0
        const segEnd = seg.end || 0
        return (segStart >= visualEvent.startTime && segStart < visualEvent.endTime) ||
               (segEnd > visualEvent.startTime && segEnd <= visualEvent.endTime) ||
               (segStart <= visualEvent.startTime && segEnd >= visualEvent.endTime)
      }) || []

      const transcriptText = transcriptSegments.map((s: any) => s.text).join(' ')
      const wordCount = transcriptText.split(' ').filter((w: string) => w.length > 0).length

      alignedMoments.push({
        startTime: visualEvent.startTime,
        endTime: visualEvent.endTime,
        scores: {
          audioHook: calculateAudioHook(transcriptText),
          visualHook: visualEvent.viralPotential || 0,
          emotionalPeak: mapEmotionalIntensity(visualEvent.emotionalIntensity),
          trendRelevance: 0, // Will be updated based on content analysis
          combined: 0 // Will be calculated
        },
        content: {
          transcript: transcriptText,
          visualDescription: visualEvent.description,
          emotionalContext: visualEvent.emotionalIntensity,
          sceneQuality: 'good'
        },
        clipType: 'single-scene'
      })
    })
  }

  // Process multi-scene opportunities
  if (visualAnalysis.multiSceneClips) {
    visualAnalysis.multiSceneClips.forEach((multiClip: MultiSceneClip) => {
      const scenes = multiClip.scenes.map((scene: any) => {
        const [start, end] = Array.isArray(scene) ? scene : [scene.start, scene.end]

        // Get transcript for this scene
        const sceneTranscript = transcript.segments?.filter((seg: any) => {
          const segStart = seg.start || 0
          const segEnd = seg.end || 0
          return (segStart >= start && segStart < end) ||
                 (segEnd > start && segEnd <= end)
        }).map((s: any) => s.text).join(' ') || ''

        return {
          start,
          end,
          description: `Part of ${multiClip.theme}`,
          transcript: sceneTranscript
        }
      })

      const fullTranscript = scenes.map(s => s.transcript).join(' ... ')

      alignedMoments.push({
        startTime: scenes[0].start,
        endTime: scenes[scenes.length - 1].end,
        scores: {
          audioHook: calculateAudioHook(fullTranscript),
          visualHook: multiClip.viralPotential || 0,
          emotionalPeak: 8, // Multi-scene clips usually have high emotional arc
          trendRelevance: 0,
          combined: 0
        },
        content: {
          transcript: fullTranscript,
          visualDescription: multiClip.theme,
          emotionalContext: 'narrative-arc',
          sceneQuality: 'cinematic'
        },
        clipType: 'multi-scene',
        scenes: scenes.map((s, i) => ({
          ...s,
          transition: multiClip.suggestedTransitions?.[i] || 'cut'
        }))
      })
    })
  }

  // Calculate combined scores with weights
  alignedMoments.forEach(moment => {
    moment.scores.combined = calculateCombinedScore(moment.scores)
  })

  // Sort by combined score
  return alignedMoments.sort((a, b) => b.scores.combined - a.scores.combined)
}

// ========================================
// SCORING FUNCTIONS
// ========================================
function calculateAudioHook(transcript: string): number {
  if (!transcript) return 0

  const hookIndicators = [
    /^(oh my god|wow|holy|what the|no way|look at)/i,
    /(!|\?){2,}/,
    /(amazing|incredible|unbelievable|crazy|insane)/i,
    /(never|always|everyone|nobody)/i,
    /\d+\s*(million|billion|thousand)/i
  ]

  let score = 5 // Base score
  hookIndicators.forEach(pattern => {
    if (pattern.test(transcript)) score += 1
  })

  // Word density bonus
  const wordCount = transcript.split(' ').length
  if (wordCount > 50) score += 1
  if (wordCount > 100) score += 1

  return Math.min(10, score)
}

function mapEmotionalIntensity(intensity: string): number {
  const map: Record<string, number> = {
    'extreme': 10,
    'high': 8,
    'medium': 5,
    'low': 3,
    'none': 0
  }
  return map[intensity?.toLowerCase()] || 5
}

function calculateCombinedScore(scores: any): number {
  // Weighted average with emphasis on visual and audio hooks
  const weights = {
    audioHook: 0.3,
    visualHook: 0.35,
    emotionalPeak: 0.25,
    trendRelevance: 0.1
  }

  return Object.entries(weights).reduce((total, [key, weight]) => {
    return total + (scores[key] * weight)
  }, 0)
}

// ========================================
// FINAL SELECTION WITH GPT-5 REASONING MODEL
// ========================================
async function selectFinalClipsWithReasoning(
  alignedMoments: AlignedMoment[],
  metadata: any,
  contentAnalysis: any
): Promise<any> {
  // Import logging
  const { addLog } = await import('../logs/route')

  // Prepare context for GPT-5 reasoning model
  const topMoments = alignedMoments.slice(0, 10) // Top 10 candidates

  addLog('openai', 'Starting GPT-5 reasoning model for final clip selection', {
    candidates: topMoments.length,
    model: 'gpt-5-2025-08-07'
  })

  const prompt = `You are an expert viral content curator. Based on multi-modal analysis (visual + audio + emotional), select the BEST 1-3 clips that will go viral.

IMPORTANT: Take your time to reason through this decision. Consider:
1. What makes content go viral on TikTok, YouTube Shorts, and Instagram Reels
2. The emotional journey of each clip
3. Whether multi-scene clips tell a better story than single scenes
4. The hook quality (first 3 seconds) and conclusion quality
5. Whether combining scenes creates a more compelling narrative

VIDEO CONTEXT:
${metadata ? `Title: ${metadata.title}
Duration: ${metadata.duration}s
Type: ${contentAnalysis?.videoType || 'Unknown'}
Topics: ${contentAnalysis?.mainTopics?.join(', ') || 'Unknown'}` : 'No metadata'}

TOP CANDIDATE MOMENTS:
${topMoments.map((moment, i) => `
${i + 1}. [${moment.startTime}s - ${moment.endTime}s] ${moment.clipType}
   Scores: Audio=${moment.scores.audioHook}/10, Visual=${moment.scores.visualHook}/10, Emotion=${moment.scores.emotionalPeak}/10
   Visual: ${moment.content.visualDescription}
   Transcript: "${moment.content.transcript.substring(0, 150)}..."
   ${moment.clipType === 'multi-scene' ? `Scenes: ${moment.scenes?.length} scenes with transitions` : ''}
`).join('\n')}

SELECTION CRITERIA:
1. Maximum 3 clips (fewer is better - quality over quantity)
2. Each clip must have a compelling hook AND satisfying conclusion
3. Prioritize clips that work standalone (no context needed)
4. Multi-scene clips are great IF they tell a complete story
5. Avoid repetitive content - each clip should offer something unique

For multi-scene clips, evaluate if the scenes work better together or separately.

CRITICAL: Check for complete sentences at start/end. Extend by 1-2 seconds if needed.

Return JSON:
{
  "selectedClips": [
    {
      "index": <index from list above>,
      "startTime": <adjusted if needed>,
      "endTime": <adjusted if needed>,
      "clipType": "single-scene|multi-scene",
      "scenes": <if multi-scene, include scene array>,
      "title": "Catchy title for this clip",
      "reasoning": "Why this clip will go viral",
      "hook": "What makes the first 3 seconds compelling",
      "conclusion": "How it ends satisfyingly",
      "expectedViralReach": "high|very-high|extreme",
      "adjustments": "Any timestamp adjustments made and why"
    }
  ],
  "selectionStrategy": "Overall explanation of clip selection",
  "rejectedHighScorers": [
    {
      "index": <index>,
      "reason": "Why this high-scoring clip wasn't selected"
    }
  ]
}`

  logSection('FINAL SELECTION WITH GPT-5 REASONING')
  console.log('Candidates:', topMoments.length)
  console.log('Multi-scene clips:', topMoments.filter(m => m.clipType === 'multi-scene').length)
  console.log('Using GPT-5 with advanced reasoning for deeper analysis')

  addLog('openai', 'Sending to GPT-5 for reasoning', {
    promptLength: prompt.length,
    model: 'gpt-5-2025-08-07'
  })

  // Try GPT-5 first, fallback to GPT-5-mini if not available
  let response
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-5-2025-08-07',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at selecting viral video clips. Use your advanced reasoning capabilities to deeply analyze what makes content shareable. Consider emotional arcs, visual hooks, narrative structure, and platform-specific engagement patterns.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      // GPT-5 only supports default temperature (1)
      max_completion_tokens: 8000
    })

    addLog('success', 'GPT-5 reasoning complete', {
      tokensUsed: response.usage?.total_tokens,
      model: 'gpt-5-2025-08-07'
    })
  } catch (gpt5Error: any) {
    console.log('GPT-5 not available, falling back to GPT-5-mini')
    addLog('warning', 'GPT-5 not available, using GPT-5-mini fallback', {
      error: gpt5Error.message
    })

    // Fallback to GPT-5-mini
    response = await openai.chat.completions.create({
      model: 'gpt-5-mini-2025-08-07',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at selecting viral video clips. Think step-by-step about what makes content shareable. Consider emotional arcs, visual hooks, and narrative structure.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      // GPT-5 only supports default temperature (1)
      max_completion_tokens: 8000
    })

    addLog('info', 'GPT-5-mini analysis complete', {
      tokensUsed: response.usage?.total_tokens,
      model: 'gpt-5-mini-2025-08-07'
    })
  }

  const selection = JSON.parse(response.choices[0].message.content || '{}')

  logSection('FINAL CLIPS SELECTED')
  console.log('Selected:', selection.selectedClips?.length || 0, 'clips')
  selection.selectedClips?.forEach((clip: any) => {
    console.log(`\n  📹 "${clip.title}"`)
    console.log(`     Type: ${clip.clipType}`)
    console.log(`     Time: ${clip.startTime}s - ${clip.endTime}s`)
    console.log(`     Viral reach: ${clip.expectedViralReach}`)
    console.log(`     Reasoning: ${clip.reasoning}`)
  })

  return selection
}

// ========================================
// MAIN HANDLER
// ========================================
export async function POST(request: NextRequest) {
  try {
    const { transcript, visualAnalysis, metadata, contentAnalysis } = await request.json()

    if (!transcript || !visualAnalysis) {
      return NextResponse.json(
        { error: 'Missing required data (transcript and visual analysis)' },
        { status: 400 }
      )
    }

    logSection('ADVANCED MULTI-MODEL ANALYSIS')
    console.log('Data sources:')
    console.log('  ✓ Transcript (Whisper)')
    console.log('  ✓ Visual analysis (Gemini)')
    console.log('  ✓ Content analysis (GPT-4o-mini)')
    console.log('  ' + (metadata ? '✓' : '✗') + ' Metadata')

    // ========================================
    // STAGE 1: ALIGN MULTI-MODAL DATA
    // ========================================
    logSection('STAGE 1: ALIGNING MULTI-MODAL DATA')
    const alignedMoments = alignMultiModalData(
      transcript,
      visualAnalysis,
      contentAnalysis
    )
    console.log('Aligned moments:', alignedMoments.length)
    console.log('Single-scene:', alignedMoments.filter(m => m.clipType === 'single-scene').length)
    console.log('Multi-scene:', alignedMoments.filter(m => m.clipType === 'multi-scene').length)

    // ========================================
    // STAGE 2: FINAL SELECTION WITH REASONING
    // ========================================
    logSection('STAGE 2: INTELLIGENT CLIP SELECTION')
    const finalSelection = await selectFinalClipsWithReasoning(
      alignedMoments,
      metadata,
      contentAnalysis
    )

    // ========================================
    // STAGE 3: FORMAT RESULTS
    // ========================================
    const clips = finalSelection.selectedClips.map((selected: any) => {
      const originalMoment = alignedMoments[selected.index]

      return {
        startTime: selected.startTime,
        endTime: selected.endTime,
        title: selected.title,
        description: selected.reasoning,
        clipType: selected.clipType,
        scenes: selected.scenes,
        reasoning: selected.reasoning,
        hookAnalysis: selected.hook,
        outroAnalysis: selected.conclusion,
        viralScore: originalMoment.scores.combined,
        visualScore: originalMoment.scores.visualHook,
        audioScore: originalMoment.scores.audioHook,
        emotionalScore: originalMoment.scores.emotionalPeak,
        expectedReach: selected.expectedViralReach,
        adjustmentNote: selected.adjustments,
        contentWarnings: [] // Could be enhanced with content moderation
      }
    })

    logSection('ANALYSIS COMPLETE')
    console.log('Final clips:', clips.length)
    console.log('Strategy:', finalSelection.selectionStrategy)

    return NextResponse.json({
      success: true,
      clips,
      selectionStrategy: finalSelection.selectionStrategy,
      rejectedHighScorers: finalSelection.rejectedHighScorers,
      analysisMetadata: {
        totalCandidates: alignedMoments.length,
        multiSceneOpportunities: alignedMoments.filter(m => m.clipType === 'multi-scene').length,
        processingModel: 'multi-model-fusion',
        models: ['whisper', 'gemini-1.5-flash', 'gpt-5-2025-08-07', 'gpt-4o-mini'],
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    logSection('ERROR IN ADVANCED ANALYSIS')
    console.error('Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to perform advanced analysis',
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout