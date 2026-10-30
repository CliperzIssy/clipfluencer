import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { CostTracker, calculateOpenAICost, checkPricingFreshness } from '../utils/pricing'
import { runGeminiVisualAnalysis } from '../../../lib/geminiAnalysis'

// ========================================
// CONFIGURATION
// ========================================
const AI_CONFIG = {
  MODEL: 'gpt-5-2025-08-07',
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// ========================================
// LOGGING UTILITIES
// ========================================
function logSection(title: string) {
  console.log('\n' + '='.repeat(70))
  console.log(`🚀 ${title}`)
  console.log('='.repeat(70))
}

function logProgress(step: string, status: 'start' | 'complete' | 'error' = 'start') {
  const icon = status === 'complete' ? '✓' : status === 'error' ? '✗' : '→'
  console.log(`  ${icon} ${step}`)
}

// Removed - now using centralized pricing from ../utils/pricing.ts

function logAPIResponse(stageName: string, response: any) {
  logSection(`API RESPONSE - ${stageName}`)

  if (response.usage) {
    console.log('Token Usage:')
    console.log('  Prompt tokens:', response.usage.prompt_tokens?.toLocaleString() || 'N/A')
    console.log('  Completion tokens:', response.usage.completion_tokens?.toLocaleString() || 'N/A')
    console.log('  Total tokens:', response.usage.total_tokens?.toLocaleString() || 'N/A')

    const costs = calculateOpenAICost(AI_CONFIG.MODEL, response.usage)
    console.log('\n💰 API Costs:')
    console.log('  Input cost: $' + costs.inputCost.toFixed(4))
    console.log('  Output cost: $' + costs.outputCost.toFixed(4))
    console.log('  Total cost: $' + costs.totalCost.toFixed(4))
    console.log('  Pricing: ', costs.breakdown)
  }

  console.log('\nModel:', response.model || 'Unknown')
  console.log('Finish Reason:', response.choices?.[0]?.finish_reason || 'Unknown')
}

// ========================================
// STAGE 1: PARALLEL PROCESSING
// ========================================
async function parallelAnalysis(
  videoPath: string,
  transcript: any,
  metadata: any,
  addLog: any
) {
  logSection('STAGE 1: PARALLEL VISUAL ANALYSIS')
  logProgress('Transcription already complete (using provided transcript)')
  logProgress('Starting Gemini 2.5 Flash-Lite visual analysis')

  addLog('gemini', 'Starting visual analysis with Gemini 2.5 Flash-Lite', {
    videoPath,
    hasTranscript: !!transcript
  })

  try {
    // Analyze video with Gemini 2.5 Flash-Lite for visual context
    // Call the function directly instead of making an HTTP request
    // This avoids timeout issues with long-running analysis
    const visualResult = await runGeminiVisualAnalysis({
      videoPath,
      transcript,
      metadata,
      addLog
    })

    if (!visualResult.success) {
      // Check if it's a file size error (graceful skip)
      if (visualResult.error && visualResult.error.includes('too large')) {
        console.warn(`⚠️ ${visualResult.message}`)
        logProgress('Visual analysis skipped (file too large)', 'error')
        addLog('warning', 'Visual analysis skipped due to file size', {
          sizeMB: visualResult.sizeMB,
          reason: visualResult.message
        })

        // Continue without visual analysis
        return {
          transcript,
          visual: null
        }
      }

      // Other errors - throw
      throw new Error(`Visual analysis failed: ${visualResult.error || 'Unknown error'}`)
    }

    logProgress('Visual analysis complete', 'complete')
    addLog('success', 'Visual analysis complete', {
      visualEvents: visualResult.analysis?.visualAnalysis?.visualEvents?.length || 0,
      keyMoments: visualResult.analysis?.visualAnalysis?.keyMoments?.length || 0
    })

    return {
      transcript,
      visual: visualResult.analysis
    }
  } catch (error: any) {
    console.error('Visual analysis failed:', error)
    logProgress('Visual analysis failed, continuing with transcript only', 'error')
    addLog('warning', 'Visual analysis failed, using transcript only', {
      error: error.message
    })

    // Fallback to transcript-only if visual analysis fails
    return {
      transcript,
      visual: null
    }
  }
}

// ========================================
// STAGE 2: TIMELINE FUSION
// ========================================
function createEnrichedTimeline(transcript: any, visualAnalysis: any) {
  logSection('STAGE 2: TIMELINE FUSION')
  console.log('Merging audio transcript with visual events...')

  const segments = transcript.segments || []
  const visualEvents = visualAnalysis?.visualAnalysis?.visualEvents || []

  console.log(`  Transcript segments: ${segments.length}`)
  console.log(`  Visual events logged: ${visualEvents.length}`)

  // Simple merge: just attach visual data to segments
  // No scoring or judgments - let GPT-5 decide
  const enriched = segments.map((segment: any) => {
    // Find visual events during this segment (with 0.5s buffer)
    const visualsHere = visualEvents.filter((v: any) => {
      const vTime = v.timestamp || 0
      return vTime >= segment.start - 0.5 && vTime <= segment.end + 0.5
    })

    return {
      start: segment.start,
      end: segment.end,
      text: segment.text,

      // Attach comprehensive visual data (no filtering or scoring)
      visualEvents: visualsHere.map((v: any) => ({
        timestamp: v.timestamp || segment.start,
        visual: v.visual || '',
        bodyLanguage: v.bodyLanguage || '',
        facialExpression: v.facialExpression || '',
        cameraAngle: v.cameraAngle || '',
        movement: v.movement || '',
        context: v.context || ''
      }))
    }
  })

  // Log segments with visual events
  const segmentsWithVisuals = enriched.filter((s: any) => s.visualEvents.length > 0).length

  console.log('\n📊 Timeline Statistics:')
  console.log(`   Total segments: ${segments.length}`)
  console.log(`   With visual events: ${segmentsWithVisuals}`)

  logProgress('Timeline fusion complete', 'complete')
  console.log('\nNote: Data merged without scoring - GPT-5 will analyze and decide.')
  return enriched
}

// ========================================
// STAGE 3: GPT-5 WITH VISUAL CONTEXT
// ========================================
async function selectClipsWithVisualContext(
  enrichedTimeline: any[],
  transcript: any,
  metadata: any,
  addLog: any
): Promise<any> {
  logSection('STAGE 3: GPT-5 INTELLIGENT SELECTION')

  addLog('gpt5', 'Starting GPT-5 selection with visual context', {
    segments: enrichedTimeline.length,
    hasVisualData: enrichedTimeline.some(s => s.visualEvents.length > 0)
  })

  // Build the enhanced prompt with visual context
  const timelineText = enrichedTimeline.map((seg) => {
    const visual = seg.visualEvents.length > 0
      ? `\n    👀 VISUAL:\n` + seg.visualEvents.map((v: any) =>
        `       - ${v.timestamp ? v.timestamp.toFixed(1) : seg.start.toFixed(1)}s:\n` +
        `         Visual: ${v.visual || 'No description'}\n` +
        (v.bodyLanguage ? `         Body: ${v.bodyLanguage}\n` : '') +
        (v.facialExpression ? `         Face: ${v.facialExpression}\n` : '') +
        (v.movement ? `         Movement: ${v.movement}\n` : '') +
        (v.context ? `         Context: ${v.context}` : '')
      ).join('\n')
      : `\n    👀 VISUAL: Talking head / static scene`

    return `
[${seg.start.toFixed(1)}-${seg.end.toFixed(1)}s]
  🗣️ SPEECH: "${seg.text}"${visual}`
  }).join('\n')

  const metadataSection = metadata ? `
VIDEO METADATA (optional context):
Title: ${metadata.title || 'Unknown'}
Description: ${metadata.description || 'No description available'}
Channel/Uploader: ${metadata.uploader || 'Unknown'}
Views: ${metadata.viewCount ? metadata.viewCount.toLocaleString() : 'Unknown'}
Upload Date: ${metadata.uploadDate || 'Unknown'}
Duration: ${metadata.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Unknown'}
` : `VIDEO METADATA: Not available (this is fine - focus on content quality from audio/visual analysis)`

  // Build AssemblyAI insights section
  const assemblyAIInsights = transcript.sentiment_analysis || transcript.entities || transcript.topics || transcript.key_phrases || transcript.summary ? `
ASSEMBLYAI AUDIO INTELLIGENCE INSIGHTS:
${transcript.sentiment_analysis && transcript.sentiment_analysis.length > 0 ? `
📊 Sentiment Analysis:
${transcript.sentiment_analysis.slice(0, 10).map((s: any) =>
    `  • [${s.sentiment.toUpperCase()}] "${s.text.substring(0, 80)}${s.text.length > 80 ? '...' : ''}"`
  ).join('\n')}
${transcript.sentiment_analysis.length > 10 ? `  ... and ${transcript.sentiment_analysis.length - 10} more sentiment annotations` : ''}

💡 Use This: Prioritize clips with POSITIVE or SURPRISE sentiment for engagement
` : ''}${transcript.entities && transcript.entities.length > 0 ? `
🏷️  Key Entities Detected:
${transcript.entities.slice(0, 15).map((e: any) => `  • ${e.text} (${e.entity_type})`).join('\n')}
${transcript.entities.length > 15 ? `  ... and ${transcript.entities.length - 15} more entities` : ''}

💡 Use This: Include clips mentioning important people, places, or organizations
` : ''}${transcript.topics && transcript.topics.summary ? `
📚 Main Topics:
${Object.entries(transcript.topics.summary)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, relevance]: [string, any]) =>
          `  • ${topic.split('>').pop()?.trim()} (${(relevance * 100).toFixed(0)}% relevance)`
        ).join('\n')}

💡 Use This: Ensure clips align with these main topics
` : ''}${transcript.key_phrases && transcript.key_phrases.results && transcript.key_phrases.results.length > 0 ? `
⭐ Key Phrases (High-Value Content):
${transcript.key_phrases.results.slice(0, 10).map((h: any) =>
          `  • "${h.text}" (mentioned ${h.count} time${h.count > 1 ? 's' : ''})`
        ).join('\n')}

💡 Use This: Prioritize clips containing these key phrases - they're the most important moments
` : ''}${transcript.summary ? `
📋 Content Summary:
${transcript.summary}

💡 Use This: Select clips that best represent this overall narrative
` : ''}` : ''

  const prompt = `You are an expert video editor and content strategist analyzing video content for short-form clips.

${metadataSection}
${assemblyAIInsights}
ENHANCED TIMELINE WITH AUDIO + VISUAL:
${timelineText}

YOUR MISSION:
Select 3-5 compelling clips that will engage viewers. Focus on AUTHENTIC ENGAGEMENT rather than just viral potential.

SELECTION PHILOSOPHY:
- Prioritize genuine value: educational insights, emotional moments, entertainment, or practical takeaways
- Look for natural story arcs with clear beginnings and satisfying conclusions
- Value authentic human moments over manufactured virality
- Consider multiple audience types (learners, entertainment seekers, professionals, etc.)
- Balance different types of content (informative, emotional, funny, surprising)

QUALITY INDICATORS TO LOOK FOR:
1. **Strong Hooks** (First 3 seconds):
   - Intriguing questions or statements
   - Visual surprises or changes
   - Emotional expressions
   - Direct address to viewer
   - Action starting mid-scene

2. **Engagement Drivers**:
   - Complete thoughts or mini-stories (beginning → middle → end)
   - "Aha" moments or revelations
   - Relatable experiences or emotions
   - Useful information clearly explained
   - Genuine reactions or interactions
   - Visual demonstrations that clarify concepts
   - Moments of humor or unexpected turns

3. **Visual-Audio Harmony**:
   - Moments where visuals enhance or complement the audio
   - Strong body language or facial expressions
   - Dynamic camera work or scene changes
   - Clear visual storytelling
   - Good pacing between visual and audio elements

4. **Content Value Types** (aim for variety):
   - Educational: Teaches something specific
   - Emotional: Creates genuine feeling
   - Entertaining: Fun, funny, or fascinating
   - Inspirational: Motivating or uplifting
   - Practical: Actionable advice or tips
   - Narrative: Tells a compelling story

SCORING GUIDELINES:
- 9-10/10: Exceptional - likely to be shared widely, memorable
- 7-8/10: Strong - highly engaging, delivers clear value
- 5-6/10: Good - solid content that serves its purpose well
- 3-4/10: Acceptable - has merit but may need context
- 1-2/10: Weak - avoid unless no alternatives

IMPORTANT: Aim for clips scoring 6/10 or higher, but prioritize diversity. One amazing 9/10 educational clip + two solid 7/10 entertaining clips is better than three similar 8/10 clips.

CLIP DURATION GUIDELINES:
- Minimum: 15 seconds (to develop an idea)
- Sweet spot: 30-60 seconds (optimal engagement)
- Maximum: 90 seconds (only if the content truly needs it)
- Multi-scene clips: Consider 2-3 related segments that tell a complete story

AVOID:
- Clips that require extensive context to understand
- Repetitive or redundant selections
- Content that feels incomplete or cuts off mid-thought
- Purely transitional moments without substance
- Similar clips that cannibalize each other's appeal

MULTI-SCENE OPPORTUNITIES:
Look for:
- Setup → Explanation → Payoff sequences
- Problem → Solution narratives
- Before → After transformations
- Question → Exploration → Answer arcs
- Multiple examples of the same concept

RESPOND WITH THIS EXACT JSON STRUCTURE:
{
  "understanding": {
    "coreTopic": "Main subject matter in one sentence",
    "videoType": "Educational/Entertainment/Tutorial/Documentary/Vlog/Review/etc",
    "visualStyle": "Production quality and visual approach",
    "purpose": "What the video aims to achieve",
    "targetAudience": "Who would find this most valuable",
    "audioVisualSyncQuality": 7,
    "shortFormPotential": {
      "score": 7,
      "strengths": ["List of strengths for short-form"],
      "weaknesses": ["List of challenges for short-form"],
      "visualStrengths": ["Specific visual elements that work well"]
    }
  },
  "selectedClips": [
    {
      "clipId": 1,
      "title": "Descriptive title that would work as a video title",
      "startTime": 0.00,
      "endTime": 0.00,
      "duration": 0.00,
      "clipType": "single-scene or multi-scene",
      "scenes": [
        {
          "startTime": 0.00,
          "endTime": 0.00,
          "duration": 0.00,
          "role": "setup/development/payoff/example/etc",
          "description": "What happens in this scene"
        }
      ],
      "hookStrength": 7,
      "engagementScore": 7,
      "valueType": "Educational/Emotional/Entertainment/Inspirational/Practical/Narrative",
      "whyThisWorks": "Specific explanation of what makes this clip engaging",
      "visualHighlight": "Most compelling visual moment or element",
      "audioHighlight": "Most compelling audio moment or message",
      "potentialTitle": "Suggested short-form video title",
      "suggestedCaption": "First line of caption to hook viewers",
      "expectedPerformance": "Strong/Very Strong/Exceptional",
      "targetViewers": "Who specifically would love this"
    }
  ],
  "selectionReasoning": {
    "strategy": "Explain your overall selection approach",
    "diversityNotes": "How clips complement each other",
    "missedOpportunities": "Any good content you had to leave out and why",
    "editingNotes": "Any specific editing suggestions for maximum impact"
  }
}

Remember: Select clips that deliver GENUINE VALUE to viewers, not just attention-grabbing moments. The best clips make people think, feel, learn, or laugh - ideally within the first few seconds.`

  logProgress('Sending enriched timeline to GPT-5')

  const response = await openai.chat.completions.create({
    model: AI_CONFIG.MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are an expert video editor and content strategist. You understand that the best clips deliver genuine value - they educate, inspire, entertain, or emotionally resonate. You prioritize authentic engagement over manufactured virality. You leverage audio intelligence insights (sentiment, entities, topics, key phrases) alongside visual analysis to select clips that truly connect with viewers. Return valid JSON only.'
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  })

  const rawContent = response.choices[0].message.content || '{}'

  let result
  try {
    result = JSON.parse(rawContent)
  } catch (parseError) {
    console.error('Failed to parse GPT-5 response:', parseError)
    console.error('Raw response:', rawContent.substring(0, 500))
    throw new Error('GPT-5 returned invalid JSON')
  }

  logAPIResponse('STAGE 3 - GPT-5 SELECTION', response)

  // Validate response
  if (!result.understanding) {
    console.warn('No understanding section in response')
    result.understanding = {
      coreTopic: 'Unknown',
      videoType: 'Unknown',
      audioVisualSyncQuality: 5
    }
  }

  if (!result.selectedClips || !Array.isArray(result.selectedClips)) {
    console.error('No selectedClips array in response:', result)
    throw new Error('GPT-5 response missing selectedClips array')
  }

  addLog('success', `GPT-5 selected ${result.selectedClips.length} clips with visual context`, {
    clipsSelected: result.selectedClips.length,
    audioVisualSyncQuality: result.understanding?.audioVisualSyncQuality,
    model: 'gpt-5-2025-08-07'
  })

  logProgress('GPT-5 selection complete', 'complete')

  return {
    understanding: result.understanding,
    selectedClips: result.selectedClips,
    selectionReasoning: result.selectionReasoning,
    usage: response.usage
  }
}

// ========================================
// WORD BOUNDARY ADJUSTMENT
// ========================================
interface Word {
  word: string
  start: number
  end: number
  confidence: number
  speaker?: string
}

function adjustToWordBoundary(
  timestamp: number,
  words: Word[],
  isEndBoundary: boolean,
  maxAdjustment: number = 2.0
): { adjustedTime: number; adjustment: number; wordMatched: string | null } {
  if (!words || words.length === 0) {
    return { adjustedTime: timestamp, adjustment: 0, wordMatched: null }
  }

  // Find words within adjustment range
  const candidateWords = words.filter(w => {
    const targetTime = isEndBoundary ? w.end : w.start
    return Math.abs(targetTime - timestamp) <= maxAdjustment
  })

  if (candidateWords.length === 0) {
    return { adjustedTime: timestamp, adjustment: 0, wordMatched: null }
  }

  // For end boundaries, prefer words that end with sentence-ending punctuation
  if (isEndBoundary) {
    const sentenceEnders = candidateWords.filter(w =>
      /[.!?]$/.test(w.word.trim())
    )

    if (sentenceEnders.length > 0) {
      // Find the closest sentence ender
      const closest = sentenceEnders.reduce((prev, curr) =>
        Math.abs(curr.end - timestamp) < Math.abs(prev.end - timestamp) ? curr : prev
      )
      return {
        adjustedTime: closest.end,
        adjustment: closest.end - timestamp,
        wordMatched: closest.word
      }
    }

    // If no sentence enders, find the closest word ending
    const closest = candidateWords.reduce((prev, curr) =>
      Math.abs(curr.end - timestamp) < Math.abs(prev.end - timestamp) ? curr : prev
    )
    return {
      adjustedTime: closest.end,
      adjustment: closest.end - timestamp,
      wordMatched: closest.word
    }
  } else {
    // For start boundaries, find the closest word start
    const closest = candidateWords.reduce((prev, curr) =>
      Math.abs(curr.start - timestamp) < Math.abs(prev.start - timestamp) ? curr : prev
    )
    return {
      adjustedTime: closest.start,
      adjustment: closest.start - timestamp,
      wordMatched: closest.word
    }
  }
}

// ========================================
// TIMING VALIDATION
// ========================================
function validateClipTimings(clips: any[], words: Word[]): any[] {
  logSection('TIMING VALIDATION WITH WORD BOUNDARY ADJUSTMENT')
  console.log('Adjusting clip boundaries to complete word boundaries...')
  console.log(`Available words for adjustment: ${words?.length || 0}`)

  const validatedClips = clips.map((clip: any, index: number) => {
    console.log(`\nClip ${index + 1}: ${clip.clipType || 'single-scene'}`)

    if (clip.clipType === 'multi-scene' && clip.scenes) {
      // Multi-scene clip - adjust each scene boundary
      const adjustedScenes = clip.scenes.map((scene: any, sceneIndex: number) => {
        const startAdjustment = adjustToWordBoundary(scene.startTime, words, false)
        const endAdjustment = adjustToWordBoundary(scene.endTime, words, true)

        console.log(`  Scene ${sceneIndex + 1}: [${scene.role}]`)
        console.log(`    Original: ${scene.startTime.toFixed(2)}s - ${scene.endTime.toFixed(2)}s`)
        console.log(`    Adjusted: ${startAdjustment.adjustedTime.toFixed(2)}s - ${endAdjustment.adjustedTime.toFixed(2)}s`)

        if (startAdjustment.adjustment !== 0) {
          console.log(`    Start: ${startAdjustment.adjustment > 0 ? '+' : ''}${startAdjustment.adjustment.toFixed(2)}s → "${startAdjustment.wordMatched}"`)
        }
        if (endAdjustment.adjustment !== 0) {
          console.log(`    End: ${endAdjustment.adjustment > 0 ? '+' : ''}${endAdjustment.adjustment.toFixed(2)}s → "${endAdjustment.wordMatched}"`)
        }

        return {
          ...scene,
          startTime: startAdjustment.adjustedTime,
          endTime: endAdjustment.adjustedTime,
          duration: endAdjustment.adjustedTime - startAdjustment.adjustedTime,
          originalStartTime: scene.startTime,
          originalEndTime: scene.endTime,
          startAdjustment: startAdjustment.adjustment,
          endAdjustment: endAdjustment.adjustment
        }
      })

      const totalDuration = adjustedScenes.reduce((sum: number, scene: any) =>
        sum + scene.duration, 0
      )

      const firstScene = adjustedScenes[0]
      const lastScene = adjustedScenes[adjustedScenes.length - 1]

      console.log(`  ✓ Word boundary adjustment applied to ${adjustedScenes.length} scenes`)
      console.log(`  Total Duration: ${totalDuration.toFixed(2)}s`)

      return {
        ...clip,
        scenes: adjustedScenes,
        startTime: firstScene.startTime,
        endTime: lastScene.endTime,
        duration: totalDuration,
        originalStartTime: clip.startTime,
        originalEndTime: clip.endTime,
        systemAdjusted: true
      }
    } else {
      // Single-scene clip - adjust start and end
      const startAdjustment = adjustToWordBoundary(clip.startTime, words, false)
      const endAdjustment = adjustToWordBoundary(clip.endTime, words, true)

      console.log(`  Type: Single-scene`)
      console.log(`  Original: ${clip.startTime.toFixed(2)}s - ${clip.endTime.toFixed(2)}s`)
      console.log(`  Adjusted: ${startAdjustment.adjustedTime.toFixed(2)}s - ${endAdjustment.adjustedTime.toFixed(2)}s`)

      if (startAdjustment.adjustment !== 0) {
        console.log(`  Start adjustment: ${startAdjustment.adjustment > 0 ? '+' : ''}${startAdjustment.adjustment.toFixed(2)}s → word: "${startAdjustment.wordMatched}"`)
      }
      if (endAdjustment.adjustment !== 0) {
        console.log(`  End adjustment: ${endAdjustment.adjustment > 0 ? '+' : ''}${endAdjustment.adjustment.toFixed(2)}s → word: "${endAdjustment.wordMatched}"`)
      }

      const adjustedDuration = endAdjustment.adjustedTime - startAdjustment.adjustedTime
      console.log(`  Duration: ${adjustedDuration.toFixed(2)}s (${(adjustedDuration - (clip.endTime - clip.startTime)).toFixed(2)}s change)`)
      console.log(`  ✓ Word boundary adjustment applied`)

      return {
        ...clip,
        startTime: startAdjustment.adjustedTime,
        endTime: endAdjustment.adjustedTime,
        duration: adjustedDuration,
        originalStartTime: clip.startTime,
        originalEndTime: clip.endTime,
        startAdjustment: startAdjustment.adjustment,
        endAdjustment: endAdjustment.adjustment,
        startWord: startAdjustment.wordMatched,
        endWord: endAdjustment.wordMatched,
        systemAdjusted: true
      }
    }
  })

  logProgress('Word boundary adjustment complete', 'complete')
  return validatedClips
}

// ========================================
// MAIN ORCHESTRATION HANDLER
// ========================================
export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  // Check API key first
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.')
    addLog('error', 'V6 analysis failed: API key not configured')
    return NextResponse.json(
      { error: 'Server configuration error: Missing OpenAI API key' },
      { status: 500 }
    )
  }

  try {
    const { transcript, metadata, videoPath } = await request.json()

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      )
    }

    if (!videoPath) {
      return NextResponse.json(
        { error: 'No video path provided' },
        { status: 400 }
      )
    }

    logSection('ADVANCED AI CLIP SELECTION V6 - VISUAL + AUDIO FUSION')
    console.log('Video:', metadata?.title || 'Unknown')
    console.log('Description:', metadata?.description ? metadata.description.substring(0, 100) + '...' : 'None')
    console.log('Channel:', metadata?.uploader || 'Unknown')
    console.log('Views:', metadata?.viewCount ? metadata.viewCount.toLocaleString() : 'Unknown')
    console.log('Duration:', metadata?.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Unknown')
    console.log('\nPipeline:')
    console.log('  🎬 Stage 1: Visual analysis (Gemini 2.5 Flash-Lite)')
    console.log('  🔗 Stage 2: Timeline fusion (audio + visual sync)')
    console.log('  🤖 Stage 3: Intelligent selection (GPT-5 with visual context)')
    console.log('  ✅ Stage 4: Word boundary adjustment (prevents mid-sentence cuts)')

    const startTime = Date.now()

    // ========================================
    // STAGE 1: PARALLEL ANALYSIS
    // ========================================
    const { transcript: finalTranscript, visual } = await parallelAnalysis(
      videoPath,
      transcript,
      metadata,
      addLog
    )

    // ========================================
    // STAGE 2: TIMELINE FUSION
    // ========================================
    const enrichedTimeline = createEnrichedTimeline(finalTranscript, visual)

    const highScoreCount = enrichedTimeline.filter((s: any) => s.viralScore >= 8).length
    console.log(`\n📊 Timeline Statistics:`)
    console.log(`   Total segments: ${enrichedTimeline.length}`)
    console.log(`   High viral score (8+): ${highScoreCount}`)
    console.log(`   With visual events: ${enrichedTimeline.filter((s: any) => s.visualEvents.length > 0).length}`)

    // ========================================
    // STAGE 3: GPT-5 WITH VISUAL CONTEXT
    // ========================================
    const result = await selectClipsWithVisualContext(
      enrichedTimeline,
      finalTranscript,
      metadata,
      addLog
    )

    const understanding = result.understanding
    const selectedClips = result.selectedClips
    const selectionReasoning = result.selectionReasoning

    // Track costs using centralized pricing system
    const costs = calculateOpenAICost(AI_CONFIG.MODEL, result.usage)
    const totalCost = costs.totalCost
    const totalInputTokens = result.usage.prompt_tokens || 0
    const totalOutputTokens = result.usage.completion_tokens || 0

    console.log('\n📊 Analysis Results:')
    console.log('  Core Topic:', understanding.coreTopic?.substring(0, 60) || 'Unknown')
    console.log('  Video Type:', understanding.videoType || 'Unknown')
    console.log('  Visual Style:', understanding.visualStyle || 'Unknown')
    console.log('  A/V Sync Quality:', understanding.audioVisualSyncQuality || 'N/A', '/10')
    console.log('  Short-Form Score:', understanding.shortFormPotential?.score || 'Unknown', '/10')
    console.log('  Clips Selected:', selectedClips.length)

    // ========================================
    // TIMING VALIDATION WITH WORD BOUNDARIES
    // ========================================
    const words = finalTranscript.words || []
    const validatedClips = validateClipTimings(selectedClips, words)

    // ========================================
    // FORMAT RESULTS
    // ========================================
    logSection('FINAL RESULTS')

    const clips = validatedClips.map((clip: any) => ({
      ...clip,
      wordTimings: finalTranscript.words || [],
      segments: finalTranscript.segments || []
    }))

    console.log(`\n✅ Selected ${clips.length} clips with visual context:`)
    clips.forEach((clip: any, i: number) => {
      console.log(`\n${i + 1}. "${clip.title}"`)
      console.log(`   Type: ${clip.clipType || 'single-scene'}`)

      if (clip.clipType === 'multi-scene' && clip.scenes) {
        console.log(`   🎬 Multi-scene (${clip.scenes.length} scenes):`)
        clip.scenes.forEach((scene: any, j: number) => {
          console.log(`      Scene ${j + 1}: ${scene.startTime.toFixed(1)}s - ${scene.endTime.toFixed(1)}s [${scene.role}]`)
        })
        console.log(`   Total Duration: ${clip.duration.toFixed(2)}s`)
      } else {
        console.log(`   Time: ${clip.startTime.toFixed(2)}s - ${clip.endTime.toFixed(2)}s (${(clip.duration || clip.endTime - clip.startTime).toFixed(2)}s)`)
      }

      console.log(`   Hook Strength: ${clip.hookStrength}/10`)
      console.log(`   Engagement Score: ${clip.engagementScore}/10`)
      console.log(`   Visual Highlight: ${clip.visualHighlight || 'N/A'}`)
      console.log(`   Expected Performance: ${clip.expectedPerformance || 'Unknown'}`)
      console.log(`   Why: ${clip.whyThisWorks?.substring(0, 100)}...`)
    })

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)

    // ========================================
    // COST SUMMARY
    // ========================================
    logSection('TOTAL API COST SUMMARY')
    console.log('Model:', AI_CONFIG.MODEL)
    console.log('Total Input Tokens:', totalInputTokens.toLocaleString())
    console.log('Total Output Tokens:', totalOutputTokens.toLocaleString())
    console.log('Total Tokens:', (totalInputTokens + totalOutputTokens).toLocaleString())
    console.log('\n💰 Total Cost Breakdown:')
    console.log('  Pricing: ', costs.breakdown)
    console.log('  Input cost: $' + costs.inputCost.toFixed(4))
    console.log('  Output cost: $' + costs.outputCost.toFixed(4))
    console.log('  TOTAL COST: $' + totalCost.toFixed(4))
    console.log('\nProcessing Time:', totalTime + 's')
    console.log('Visual Analysis: Included ✓')
    console.log('Audio-Visual Sync: Quality', understanding.audioVisualSyncQuality || 'N/A', '/10')
    console.log('Word Boundary Adjustment: Enabled ✓')

    addLog('success', `V6 analysis complete: ${clips.length} clips selected with word boundary adjustment in ${totalTime}s`, {
      model: AI_CONFIG.MODEL,
      totalProcessingTime: totalTime,
      clipsSelected: clips.length,
      totalCost: '$' + totalCost.toFixed(4),
      totalTokens: totalInputTokens + totalOutputTokens,
      visualAnalysisIncluded: !!visual,
      audioVisualSyncQuality: understanding.audioVisualSyncQuality,
      wordBoundaryAdjustmentEnabled: true
    })

    return NextResponse.json({
      success: true,
      clips,
      understanding,
      contentAnalysis: {
        videoType: understanding.videoType,
        visualStyle: understanding.visualStyle,
        coreTopic: understanding.coreTopic,
        purpose: understanding.purpose,
        targetAudience: understanding.targetAudience,
        audioVisualSyncQuality: understanding.audioVisualSyncQuality,
        shortFormScore: understanding.shortFormPotential?.score,
        visualStrengths: understanding.shortFormPotential?.visualStrengths
      },
      selectionReasoning: selectionReasoning,
      enrichedTimeline, // Include for debugging/analysis
      metadata: {
        videoDuration: metadata?.duration,
        videoTitle: metadata?.title,
        videoDescription: metadata?.description,
        videoUploader: metadata?.uploader,
        videoViews: metadata?.viewCount,
        analysisVersion: 'v6-visual-audio-fusion',
        model: AI_CONFIG.MODEL,
        timestamp: new Date().toISOString(),
        processingTimeSeconds: parseFloat(totalTime),
        visualAnalysisIncluded: !!visual,
        audioVisualSyncQuality: understanding.audioVisualSyncQuality,
        wordBoundaryAdjustmentEnabled: true,
        stages: ['visual-analysis', 'timeline-fusion', 'gpt5-selection', 'word-boundary-adjustment'],
        costs: {
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          inputCostUSD: parseFloat(costs.inputCost.toFixed(4)),
          outputCostUSD: parseFloat(costs.outputCost.toFixed(4)),
          totalCostUSD: parseFloat(totalCost.toFixed(4)),
          pricingBreakdown: costs.breakdown
        }
      }
    })

  } catch (error: any) {
    logSection('ERROR IN V6 ANALYSIS')
    console.error('Error details:', error)

    addLog('error', 'V6 analysis failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to complete visual + audio fusion analysis',
        details: error.message,
        message: 'V6 analysis failed. The system may have fallen back to text-only analysis.',
        stack: error.stack
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout (Vercel hobby plan limit)
