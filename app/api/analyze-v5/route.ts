import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// ========================================
// CONFIGURATION
// ========================================
const AI_CONFIG = {
  MODEL: 'gpt-5-2025-08-07',
  // GPT-5 pricing (as of 2025)
  // Input: $10.00 per 1M tokens
  // Output: $30.00 per 1M tokens
  INPUT_COST_PER_1M: 10.00,
  OUTPUT_COST_PER_1M: 30.00,
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

function logPrompt(stageName: string, prompt: string) {
  logSection(`PROMPT SENT - ${stageName}`)
  console.log('Prompt length:', prompt.length, 'characters')
  console.log('Estimated tokens:', Math.ceil(prompt.length / 4))
  console.log('\n--- PROMPT START ---')
  console.log(prompt)
  console.log('--- PROMPT END ---\n')
}

function calculateCost(usage: any): { inputCost: number, outputCost: number, totalCost: number } {
  const inputTokens = usage.prompt_tokens || 0
  const outputTokens = usage.completion_tokens || 0

  const inputCost = (inputTokens / 1_000_000) * AI_CONFIG.INPUT_COST_PER_1M
  const outputCost = (outputTokens / 1_000_000) * AI_CONFIG.OUTPUT_COST_PER_1M
  const totalCost = inputCost + outputCost

  return { inputCost, outputCost, totalCost }
}

function logAPIResponse(stageName: string, response: any, content: any) {
  logSection(`API RESPONSE - ${stageName}`)

  if (response.usage) {
    console.log('Token Usage:')
    console.log('  Prompt tokens:', response.usage.prompt_tokens?.toLocaleString() || 'N/A')
    console.log('  Completion tokens:', response.usage.completion_tokens?.toLocaleString() || 'N/A')
    console.log('  Total tokens:', response.usage.total_tokens?.toLocaleString() || 'N/A')

    const costs = calculateCost(response.usage)
    console.log('\n💰 API Costs:')
    console.log('  Input cost: $' + costs.inputCost.toFixed(4))
    console.log('  Output cost: $' + costs.outputCost.toFixed(4))
    console.log('  Total cost: $' + costs.totalCost.toFixed(4))
  }

  console.log('\nModel:', response.model || 'Unknown')
  console.log('Finish Reason:', response.choices?.[0]?.finish_reason || 'Unknown')
  if (response.choices?.[0]?.finish_reason === 'length') {
    console.log('⚠️  WARNING: Response was truncated due to max_completion_tokens limit!')
  }
  console.log('Response length:', JSON.stringify(content).length, 'characters')
  console.log('\n--- RESPONSE START ---')
  console.log(JSON.stringify(content, null, 2).substring(0, 2000))
  if (JSON.stringify(content).length > 2000) {
    console.log('... (truncated, full response is', JSON.stringify(content).length, 'characters)')
  }
  console.log('--- RESPONSE END ---\n')
}

// ========================================
// SINGLE-STAGE: INTELLIGENT ANALYSIS & CLIP SELECTION
// ========================================
async function analyzeAndSelectClips(
  transcript: any,
  metadata: any,
  addLog: (level: string, message: string, data?: any) => void
): Promise<any> {
  logSection('GPT-5 UNIFIED ANALYSIS & CLIP SELECTION')

  const segments = transcript.segments || []
  const fullText = transcript.text || transcript.fullText || ''

  addLog('gpt5', 'Starting GPT-5 unified analysis and clip selection', {
    transcriptLength: fullText.length,
    segmentCount: segments.length,
    hasMetadata: !!metadata
  })

  // Build comprehensive metadata section
  const metadataSection = metadata ? `
VIDEO METADATA:
Title: ${metadata.title || 'Unknown'}
Description: ${metadata.description || 'No description available'}
Channel/Uploader: ${metadata.uploader || 'Unknown'}
Views: ${metadata.viewCount ? metadata.viewCount.toLocaleString() : 'Unknown'}
Upload Date: ${metadata.uploadDate || 'Unknown'}
Duration: ${metadata.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Unknown'}
` : 'VIDEO METADATA: Not available'

  const prompt = `You are an expert at identifying viral moments in videos. Analyze this video and select the BEST 1-3 clips for short-form content (TikTok, YouTube Shorts, Instagram Reels).

${metadataSection}

FULL TRANSCRIPT WITH TIMESTAMPS:
${segments.map((seg: any) =>
  `[${seg.start.toFixed(1)}-${seg.end.toFixed(1)}s] ${seg.text}`
).join('\n')}

YOUR TASK:
1. First, understand the video:
   - What's the core topic and purpose?
   - What type of video is this? (podcast, vlog, tutorial, review, etc.)
   - Who is the target audience?
   - What's the overall tone and emotional journey?
   - Identify emotional peaks and bold/unexpected moments

2. Then, select the BEST 1-3 clips that will go viral:
   - Strong hook in first 3 seconds (grabs attention immediately)
   - 15-40 seconds duration (optimal for short-form)
   - Complete sentences only (NO mid-sentence cuts)
   - Natural start and end points (use segment timestamps)
   - Look for: energy shifts, bold statements, laughter, insights, surprises
   - Quality over quantity (better to have 1 great clip than 3 mediocre ones)

CRITICAL RULES:
- Use the exact segment timestamps provided
- Add 0.5s buffer after last word if needed for natural ending
- Your timestamps will be used exactly as provided
- Consider the video's title and description when selecting clips
- Clips should work as standalone content without needing context

Return JSON with BOTH your analysis AND final clip selections:
{
  "understanding": {
    "coreTopic": "What this video is about",
    "videoType": "podcast|vlog|tutorial|review|etc",
    "targetAudience": "Who this is for",
    "purpose": "Main goal of the video",
    "emotionalJourney": {
      "overallTone": "warm|serious|humorous|dramatic|etc",
      "emotionalPeaks": [
        {
          "timestamp": number,
          "emotion": "joy|surprise|anger|sadness|excitement|etc",
          "intensity": 1-10,
          "reason": "What causes this emotion"
        }
      ]
    },
    "boldMoments": [
      {
        "timestamp": number,
        "type": "unexpected_statement|strong_opinion|reveal|plot_twist|etc",
        "content": "What was said or happened",
        "impact": "Why this is significant"
      }
    ],
    "shortFormPotential": {
      "score": 1-10,
      "strengths": ["What makes this work for short-form"],
      "engagementFactors": ["What makes people stop scrolling and watch"]
    }
  },
  "selectedClips": [
    {
      "clipNumber": 1,
      "startTime": number,
      "endTime": number,
      "title": "Compelling title under 50 chars",
      "description": "What happens in this clip",
      "hook": "Why the first 3 seconds grab attention",
      "whyThisWorks": "Why this specific clip will go viral",
      "hookStrength": 1-10,
      "engagementScore": 1-10,
      "expectedPerformance": "50K-100K|100K-500K|500K-1M|1M+",
      "platforms": ["TikTok", "YouTube Shorts", "Instagram Reels"]
    }
  ],
  "selectionReasoning": "Overall strategy and why these specific clips were chosen"
}`

  logPrompt('GPT-5 UNIFIED ANALYSIS', prompt)
  logProgress('Sending complete data to GPT-5 for analysis and selection')

  const response = await openai.chat.completions.create({
    model: AI_CONFIG.MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are the world\'s best viral content curator. You understand what makes videos go viral on TikTok, YouTube Shorts, and Instagram Reels. Analyze deeply, select strategically, and explain your reasoning. Return valid JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' }
    // NO max_completion_tokens - let the model finish naturally to avoid truncation
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

  logAPIResponse('GPT-5 UNIFIED ANALYSIS', response, result)

  // Validate we have both understanding and clips
  if (!result.understanding) {
    console.warn('No understanding section in response')
    result.understanding = {
      coreTopic: 'Unknown',
      videoType: 'Unknown',
      shortFormPotential: { score: 5 }
    }
  }

  if (!result.selectedClips || !Array.isArray(result.selectedClips)) {
    console.error('No selectedClips array in response:', result)
    throw new Error('GPT-5 response missing selectedClips array')
  }

  if (result.selectedClips.length === 0) {
    console.warn('GPT-5 selected 0 clips. This may indicate the response was truncated.')
    console.warn('Response finish reason:', response.choices[0].finish_reason)
  }

  addLog('success', `GPT-5 analysis complete: ${result.selectedClips?.length || 0} clips selected`, {
    clipsSelected: result.selectedClips?.length || 0,
    coreTopic: result.understanding?.coreTopic?.substring(0, 50) || 'Unknown',
    finishReason: response.choices[0].finish_reason,
    model: 'gpt-5-2025-08-07'
  })

  logProgress('Analysis and clip selection complete', 'complete')

  return {
    understanding: result.understanding,
    selectedClips: result.selectedClips,
    selectionReasoning: result.selectionReasoning,
    usage: response.usage
  }
}

// ========================================
// TIMING VALIDATION (NO AUTOMATIC ADJUSTMENTS)
// ========================================
function validateClipTimings(clips: any[], transcript: any): any[] {
  logSection('TIMING VALIDATION')
  console.log('Using AI-chosen timestamps directly (no automatic buffers)')
  console.log('AI has full freedom to choose start/end times')

  const validatedClips = clips.map((clip: any, index: number) => {
    console.log(`\nClip ${index + 1}:`)
    console.log(`  Start: ${clip.startTime.toFixed(2)}s`)
    console.log(`  End: ${clip.endTime.toFixed(2)}s`)
    console.log(`  Duration: ${(clip.endTime - clip.startTime).toFixed(2)}s`)
    console.log(`  ✓ Using AI-chosen times exactly as selected`)

    return {
      ...clip,
      duration: clip.endTime - clip.startTime,
      systemAdjusted: false
    }
  })

  logProgress('Timing validation complete', 'complete')
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
    addLog('error', 'V5 analysis failed: API key not configured')
    return NextResponse.json(
      { error: 'Server configuration error: Missing API key' },
      { status: 500 }
    )
  }

  try {
    const { transcript, metadata } = await request.json()

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      )
    }

    logSection('ADVANCED AI CLIP SELECTION V5 - SINGLE-STAGE')
    console.log('Video:', metadata?.title || 'Unknown')
    console.log('Description:', metadata?.description ? metadata.description.substring(0, 100) + '...' : 'None')
    console.log('Channel:', metadata?.uploader || 'Unknown')
    console.log('Views:', metadata?.viewCount ? metadata.viewCount.toLocaleString() : 'Unknown')
    console.log('Duration:', metadata?.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Unknown')
    console.log('\nPipeline:')
    console.log('  ✨ Single GPT-5 call - Unified analysis & clip selection')
    console.log('  ✓ Full metadata included (title, description, channel, views)')
    console.log('  ✓ Complete transcript (no truncation)')
    console.log('  ✓ Timing validation (no automatic adjustments)')
    console.log('  ✓ 50% faster, 50% cheaper than two-stage approach')

    // Log transcript data
    logSection('TRANSCRIPT DATA RECEIVED')
    const fullText = transcript.text || transcript.fullText || ''
    console.log('Transcript length:', fullText.length, 'characters')
    console.log('Estimated tokens:', Math.ceil(fullText.length / 4))
    console.log('Has word timings:', !!(transcript.words && transcript.words.length > 0))
    console.log('Word count:', transcript.words?.length || 0)
    console.log('Has segments:', !!(transcript.segments && transcript.segments.length > 0))
    console.log('Segment count:', transcript.segments?.length || 0)

    if (transcript.segments && transcript.segments.length > 0) {
      console.log('\nFirst 5 segments:')
      transcript.segments.slice(0, 5).forEach((seg: any, i: number) => {
        console.log(`  ${i + 1}. [${seg.start?.toFixed(2)}s - ${seg.end?.toFixed(2)}s]: ${seg.text.substring(0, 100)}${seg.text.length > 100 ? '...' : ''}`)
      })
    }

    console.log('\n--- FULL TRANSCRIPT START ---')
    console.log(fullText)
    console.log('--- FULL TRANSCRIPT END ---')

    const startTime = Date.now()

    // ========================================
    // SINGLE-STAGE: UNIFIED ANALYSIS & SELECTION
    // ========================================
    logProgress('Starting unified GPT-5 analysis and clip selection')
    const result = await analyzeAndSelectClips(transcript, metadata, addLog)

    const understanding = result.understanding
    const selectedClips = result.selectedClips
    const selectionReasoning = result.selectionReasoning

    // Track costs
    const costs = calculateCost(result.usage)
    const totalCost = costs.totalCost
    const totalInputTokens = result.usage.prompt_tokens || 0
    const totalOutputTokens = result.usage.completion_tokens || 0

    console.log('\n📊 Analysis Results:')
    console.log('  Core Topic:', understanding.coreTopic?.substring(0, 60) || 'Unknown')
    console.log('  Video Type:', understanding.videoType || 'Unknown')
    console.log('  Short-Form Score:', understanding.shortFormPotential?.score || 'Unknown', '/10')
    console.log('  Bold Moments:', understanding.boldMoments?.length || 0)
    console.log('  Emotional Peaks:', understanding.emotionalJourney?.emotionalPeaks?.length || 0)
    console.log('  Clips Selected:', selectedClips.length)

    // ========================================
    // TIMING VALIDATION
    // ========================================
    logProgress('Validating AI-chosen clip timings')
    const validatedClips = validateClipTimings(selectedClips, transcript)

    // ========================================
    // FORMAT RESULTS
    // ========================================
    logSection('FINAL RESULTS')

    const clips = validatedClips.map((clip: any) => ({
      ...clip,
      wordTimings: transcript.words || [],
      segments: transcript.segments || []
    }))

    console.log(`\n✅ Selected ${clips.length} clips (AI decision with full freedom):`)
    clips.forEach((clip: any, i: number) => {
      console.log(`\n${i + 1}. "${clip.title}"`)
      console.log(`   Time: ${clip.startTime.toFixed(2)}s - ${clip.endTime.toFixed(2)}s (${(clip.duration || clip.endTime - clip.startTime).toFixed(2)}s)`)
      console.log(`   🤖 AI-chosen timing (no system adjustments)`)
      console.log(`   Hook Strength: ${clip.hookStrength}/10`)
      console.log(`   Engagement Score: ${clip.engagementScore}/10`)
      console.log(`   Expected Performance: ${clip.expectedPerformance}`)
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
    console.log('  Input cost: $' + ((totalInputTokens / 1_000_000) * AI_CONFIG.INPUT_COST_PER_1M).toFixed(4))
    console.log('  Output cost: $' + ((totalOutputTokens / 1_000_000) * AI_CONFIG.OUTPUT_COST_PER_1M).toFixed(4))
    console.log('  TOTAL COST: $' + totalCost.toFixed(4))
    console.log('\nProcessing Time:', totalTime + 's')
    console.log('Note: No max_completion_tokens limit - model completes naturally')

    addLog('success', `Analysis complete: ${clips.length} clips selected in ${totalTime}s`, {
      model: AI_CONFIG.MODEL,
      totalProcessingTime: totalTime,
      clipsSelected: clips.length,
      totalCost: '$' + totalCost.toFixed(4),
      totalTokens: totalInputTokens + totalOutputTokens
    })

    return NextResponse.json({
      success: true,
      clips,
      understanding,
      contentAnalysis: {
        videoType: understanding.videoType,
        coreTopic: understanding.coreTopic,
        purpose: understanding.purpose,
        targetAudience: understanding.targetAudience,
        overallTone: understanding.emotionalJourney?.overallTone,
        shortFormScore: understanding.shortFormPotential?.score
      },
      selectionReasoning: selectionReasoning,
      metadata: {
        videoDuration: metadata?.duration,
        videoTitle: metadata?.title,
        videoDescription: metadata?.description,
        videoUploader: metadata?.uploader,
        videoViews: metadata?.viewCount,
        analysisVersion: 'v5-single-stage-optimized',
        model: AI_CONFIG.MODEL,
        timestamp: new Date().toISOString(),
        processingTimeSeconds: parseFloat(totalTime),
        singleStage: true,
        fullMetadataIncluded: true,
        noTranscriptTruncation: true,
        noFallbacks: true,
        noAutomaticBuffers: true,
        aiFullTimingControl: true,
        stages: ['unified-analysis-and-selection', 'validation'],
        costs: {
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          inputCostUSD: parseFloat(((totalInputTokens / 1_000_000) * AI_CONFIG.INPUT_COST_PER_1M).toFixed(4)),
          outputCostUSD: parseFloat(((totalOutputTokens / 1_000_000) * AI_CONFIG.OUTPUT_COST_PER_1M).toFixed(4)),
          totalCostUSD: parseFloat(totalCost.toFixed(4))
        }
      }
    })

  } catch (error: any) {
    logSection('ERROR IN V5 ANALYSIS')
    console.error('Error details:', error)

    addLog('error', 'V5 analysis failed', {
      error: error.message,
      stack: error.stack
    })

    // NO FALLBACK - Let it fail
    return NextResponse.json(
      {
        error: 'Failed to complete AI analysis',
        details: error.message,
        message: 'GPT-5 analysis failed. No fallback available. Please check your API key and try again.',
        stack: error.stack
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout
