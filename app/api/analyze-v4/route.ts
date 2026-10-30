import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

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

// ========================================
// GPT-5 FINAL SELECTION WITH REASONING
// ========================================
async function selectFinalClipsWithGPT5(
  geminiAnalysis: any,
  metadata: any
): Promise<any> {
  const { addLog } = await import('../logs/route')

  logSection('GPT-5 INTELLIGENT CLIP SELECTION')

  // Extract all the rich data from Gemini
  const transcript = geminiAnalysis.transcript || {}
  const visualAnalysis = geminiAnalysis.visualAnalysis || {}
  const audioAnalysis = geminiAnalysis.audioAnalysis || {}
  const potentialClips = geminiAnalysis.potentialClips || geminiAnalysis.viralClips || []

  addLog('gpt5', 'Starting GPT-5 final clip selection', {
    potentialClips: potentialClips.length,
    hasTranscript: !!transcript.fullText,
    hasWordTiming: !!(transcript.words && transcript.words.length > 0)
  })

  const prompt = `You are the world's best viral content curator. Using the comprehensive analysis from Gemini 2.5, select the ABSOLUTE BEST clips that will go viral.

VIDEO CONTEXT:
${metadata ? `Title: ${metadata.title}
Duration: ${metadata.duration ? Math.floor(metadata.duration / 60) + 'm ' + (metadata.duration % 60) + 's' : 'Unknown'}
Channel: ${metadata.uploader || 'Unknown'}
Views: ${metadata.viewCount?.toLocaleString() || 'Unknown'}` : 'No metadata'}

FULL TRANSCRIPT:
${transcript.fullText ? transcript.fullText.substring(0, 5000) + (transcript.fullText.length > 5000 ? '...' : '') : 'Not available'}

VISUAL ANALYSIS:
Key Moments: ${visualAnalysis.keyMoments?.length || 0} identified
Scene Changes at: ${visualAnalysis.sceneChanges?.join(', ') || 'Unknown'}
Style: ${visualAnalysis.overallStyle || 'Unknown'}

AUDIO ANALYSIS:
Music Segments: ${audioAnalysis.musicSegments?.map((m: any) => `${m.start}-${m.end}s: ${m.type}`).join(', ') || 'None'}
Tone Shifts: ${audioAnalysis.toneShifts?.map((t: any) => `${t.timestamp}s: ${t.from}→${t.to}`).join(', ') || 'None'}

POTENTIAL CLIPS IDENTIFIED BY GEMINI:
${potentialClips.map((clip: any, i: number) => `
${i + 1}. [${clip.startTime || clip.scenes?.[0]?.start}s - ${clip.endTime || clip.scenes?.[clip.scenes.length - 1]?.end}s] ${clip.multiScene ? 'MULTI-SCENE' : 'SINGLE'}
   Type: ${clip.type || 'moment'}
   Description: ${clip.description}
   Visual: ${clip.visualHighlight || 'N/A'}
   Audio: ${clip.audioHighlight || 'N/A'}
   ${clip.multiScene ? `Scenes: ${clip.scenes.map((s: any) => `${s.start}-${s.end}s (${s.role})`).join(', ')}` : ''}
   Viral Score: ${clip.viralScore || 'N/A'}/10
`).join('\n')}

YOUR SELECTION CRITERIA:
1. Maximum 3-5 clips (quality over quantity)
2. Each clip must have:
   - Strong hook (first 3 seconds)
   - Clear narrative or emotional arc
   - Satisfying conclusion
   - No mid-sentence cuts
3. Prioritize clips that work without context
4. For multi-scene clips, ensure the combined story is compelling
5. Mix clip types: include both quick hooks and story-driven content

CRITICAL: Adjust timestamps by 0.5-1 second if needed to capture complete sentences.

Return JSON:
{
  "selectedClips": [
    {
      "clipNumber": 1,
      "startTime": number,
      "endTime": number,
      "clipType": "single-scene" or "multi-scene",
      "scenes": [array if multi-scene],
      "title": "Compelling title under 50 chars",
      "description": "What happens in this clip",
      "transcript": "Exact words spoken in this clip - MUST be word-for-word from the full transcript",
      "hook": "What makes the first 3 seconds compelling",
      "visualHighlight": "Key visual element",
      "audioHighlight": "Key audio element",
      "viralScore": 1-10,
      "platforms": ["TikTok", "YouTube Shorts", "Instagram Reels"],
      "hashtags": ["#viral", "#trending"],
      "expectedReach": "50K-100K" or "100K-500K" or "500K-1M" or "1M+",
      "reasoning": "Why this specific clip will go viral",
      "editingNotes": "Any special considerations for export"
    }
  ],
  "selectionReasoning": "Overall strategy for clip selection",
  "rejectedClips": [
    {
      "clipIndex": number,
      "reason": "Why this clip wasn't selected despite potential"
    }
  ],
  "wordTimings": ${JSON.stringify(transcript.words?.slice(0, 100) || [])} // Include word timings for captions
}`

  logProgress('Sending comprehensive data to GPT-5')

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-2025-08-07',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at selecting viral video clips. Use advanced reasoning to identify the absolute best moments that will maximize engagement, shares, and views. Consider platform-specific optimization and current trends.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      // GPT-5 only supports default temperature (1)
      max_completion_tokens: 4000
    })

    const selection = JSON.parse(response.choices[0].message.content || '{}')

    addLog('success', 'GPT-5 selection complete', {
      clipsSelected: selection.selectedClips?.length || 0,
      model: 'gpt-5-2025-08-07'
    })

    logProgress('GPT-5 clip selection', 'complete')

    return selection

  } catch (gpt5Error: any) {
    console.error('GPT-5 failed, trying GPT-5-mini fallback:', gpt5Error)
    addLog('warning', 'GPT-5 failed, using GPT-5-mini', { error: gpt5Error.message })

    // Fallback to GPT-5-mini
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini-2025-08-07',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at selecting viral video clips. Identify the best moments for maximum engagement.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      // GPT-5-mini only supports default temperature (1)
      max_completion_tokens: 4000
    })

    const selection = JSON.parse(response.choices[0].message.content || '{}')

    addLog('info', 'GPT-5-mini selection complete', {
      clipsSelected: selection.selectedClips?.length || 0,
      model: 'gpt-5-mini-2025-08-07'
    })

    return selection
  }
}

// ========================================
// MAIN ORCHESTRATION HANDLER
// ========================================
export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  try {
    const { videoPath, metadata } = await request.json()

    if (!videoPath) {
      return NextResponse.json(
        { error: 'No video path provided' },
        { status: 400 }
      )
    }

    logSection('ADVANCED MULTI-AGENT ANALYSIS V4')
    console.log('Video:', metadata?.title || videoPath)
    console.log('Duration:', metadata?.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Unknown')
    console.log('\nPipeline:')
    console.log('  Stage 1: Gemini 2.5 Flash - Comprehensive analysis')
    console.log('  Stage 2: GPT-5 - Intelligent clip selection')

    // ========================================
    // STAGE 1: GEMINI COMPREHENSIVE ANALYSIS
    // ========================================
    logSection('STAGE 1: GEMINI 2.5 COMPREHENSIVE ANALYSIS')
    logProgress('Sending video to Gemini 2.5 Flash')

    addLog('info', 'Starting Gemini 2.5 analysis', { videoPath })

    const geminiResponse = await fetch(new URL('/api/analyze-gemini', request.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoPath, metadata })
    })

    const geminiData = await geminiResponse.json()

    if (!geminiData.success || !geminiData.analysis) {
      throw new Error(geminiData.error || 'Gemini analysis failed')
    }

    logProgress('Gemini 2.5 analysis', 'complete')
    console.log('\n📊 Gemini Results:')
    console.log('  Transcript:', geminiData.analysis.transcript?.fullText?.length || 0, 'characters')
    console.log('  Word timings:', geminiData.analysis.transcript?.words?.length || 0, 'words')
    console.log('  Visual moments:', geminiData.analysis.visualAnalysis?.keyMoments?.length || 0)
    console.log('  Potential clips:', geminiData.analysis.potentialClips?.length || 0)

    // ========================================
    // STAGE 2: GPT-5 INTELLIGENT SELECTION
    // ========================================
    logSection('STAGE 2: GPT-5 FINAL SELECTION')
    logProgress('Analyzing all data with GPT-5')

    const finalSelection = await selectFinalClipsWithGPT5(
      geminiData.analysis,
      metadata
    )

    logProgress('GPT-5 selection', 'complete')

    // ========================================
    // STAGE 3: FORMAT RESULTS
    // ========================================
    logSection('FINAL RESULTS')

    // Ensure we have word timings for captions
    const clips = finalSelection.selectedClips?.map((clip: any) => ({
      ...clip,
      wordTimings: geminiData.analysis.transcript?.words || [],
      segments: geminiData.analysis.transcript?.segments || []
    })) || []

    console.log(`\n✅ Selected ${clips.length} viral clips:`)
    clips.forEach((clip: any, i: number) => {
      console.log(`\n${i + 1}. "${clip.title}"`)
      console.log(`   Type: ${clip.clipType}`)
      console.log(`   Time: ${clip.startTime}s - ${clip.endTime}s`)
      console.log(`   Viral Score: ${clip.viralScore}/10`)
      console.log(`   Expected Reach: ${clip.expectedReach}`)
      console.log(`   Reasoning: ${clip.reasoning}`)
    })

    addLog('success', `Analysis complete: ${clips.length} clips selected`, {
      model: 'gpt-5-2025-08-07',
      totalProcessingTime: Date.now() - (request.headers.get('x-start-time') as any || Date.now())
    })

    return NextResponse.json({
      success: true,
      clips,
      transcript: geminiData.analysis.transcript,
      contentAnalysis: {
        videoType: geminiData.analysis.visualAnalysis?.overallStyle,
        mainTopics: metadata?.title ? [metadata.title] : [],
        strongestEmotions: geminiData.analysis.visualAnalysis?.keyMoments?.map((m: any) => m.emotion) || [],
        overallTone: 'analyzed'
      },
      selectionReasoning: finalSelection.selectionReasoning,
      metadata: {
        videoPath,
        videoDuration: metadata?.duration,
        analysisVersion: 'v4-multi-agent',
        models: ['gemini-2.5-flash', 'gpt-5-2025-08-07'],
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    logSection('ERROR IN V4 ANALYSIS')
    console.error('Error details:', error)

    addLog('error', 'V4 analysis failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to complete multi-agent analysis',
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout