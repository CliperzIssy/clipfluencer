import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// ========================================
// LOGGING UTILITIES
// ========================================
function logSection(title: string) {
  console.log('\n' + '='.repeat(60))
  console.log(`📋 ${title}`)
  console.log('='.repeat(60))
}

function logPrompt(stage: string, prompt: string) {
  logSection(`PROMPT - ${stage}`)
  console.log('Length:', prompt.length, 'characters')
  console.log('\n--- PROMPT START ---')
  console.log(prompt)
  console.log('--- PROMPT END ---\n')
}

function logResponse(stage: string, response: any) {
  logSection(`RESPONSE - ${stage}`)
  console.log('Tokens used:', response.usage?.total_tokens || 'unknown')
  console.log('\n--- RESPONSE START ---')
  console.log(JSON.stringify(response, null, 2))
  console.log('--- RESPONSE END ---\n')
}

// ========================================
// STAGE 1: CONTENT ANALYSIS
// ========================================
async function analyzeVideoContent(
  transcript: string,
  metadata?: {
    title?: string
    description?: string
    duration?: number
    uploader?: string
  }
): Promise<{
  videoType: string
  mainTopics: string[]
  contentStructure: string
  keyMoments: string[]
  targetAudience: string
  viralPotential: string
}> {
  const contextInfo = metadata ? `
VIDEO METADATA:
Title: ${metadata.title || 'Not provided'}
Channel/Uploader: ${metadata.uploader || 'Not provided'}
Duration: ${metadata.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Not provided'}

Description:
${metadata.description ? metadata.description.substring(0, 500) : 'Not provided'}
` : 'No metadata available'

  const prompt = `You are an expert video content analyst. Analyze this video and provide insights about its content, structure, and viral potential.

${contextInfo}

TRANSCRIPT (Full):
${transcript}

Analyze and return as JSON:
{
  "videoType": "podcast|vlog|tutorial|news|entertainment|documentary|reaction|gaming|etc",
  "mainTopics": ["topic1", "topic2", "topic3"],
  "contentStructure": "linear narrative|segmented topics|interview format|monologue|discussion|etc",
  "keyMoments": [
    "Brief description of key moment 1 with approximate timing if identifiable",
    "Brief description of key moment 2",
    "Brief description of key moment 3"
  ],
  "targetAudience": "description of likely target audience",
  "viralPotential": "analysis of what makes this content shareable or viral"
}`

  logPrompt('STAGE 1 - CONTENT ANALYSIS', prompt)

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a video content expert who understands viral content, social media trends, and audience engagement.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  })

  const result = JSON.parse(response.choices[0].message.content || '{}')
  logResponse('STAGE 1 - CONTENT ANALYSIS', result)

  return result
}

// ========================================
// STAGE 2: INTELLIGENT CLIP SELECTION
// ========================================
async function selectViralClips(
  transcript: any,
  contentAnalysis: any,
  metadata?: any
): Promise<{
  clips: Array<{
    startTime: number
    endTime: number
    title: string
    description: string
    reasoning: string
    hookAnalysis: string
    outroAnalysis: string
    viralScore: number
    contentWarnings?: string[]
  }>
  selectionReasoning: string
}> {
  // Build context about the video
  const videoContext = `
VIDEO CONTEXT:
Type: ${contentAnalysis.videoType}
Main Topics: ${contentAnalysis.mainTopics.join(', ')}
Structure: ${contentAnalysis.contentStructure}
Target Audience: ${contentAnalysis.targetAudience}
Viral Potential: ${contentAnalysis.viralPotential}

Key Moments Identified:
${contentAnalysis.keyMoments.map((moment: string, i: number) => `${i + 1}. ${moment}`).join('\n')}

VIDEO METADATA:
Title: ${metadata?.title || 'Not provided'}
Duration: ${metadata?.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Not provided'}
`

  // Extract segment information for better timestamp awareness
  let segmentInfo = ''
  if (transcript.segments && Array.isArray(transcript.segments)) {
    segmentInfo = `
TRANSCRIPT SEGMENTS WITH TIMESTAMPS:
${transcript.segments.map((seg: any, i: number) =>
  `[${Math.floor(seg.start)}s - ${Math.floor(seg.end)}s]: ${seg.text.substring(0, 150)}...`
).join('\n')}
`
  }

  const prompt = `You are an expert viral content curator specializing in creating engaging short-form content from longer videos. Your task is to identify the BEST moments for viral clips.

${videoContext}

${segmentInfo}

FULL TRANSCRIPT:
${transcript.text || transcript}

CRITICAL REQUIREMENTS:
1. Select 1-3 clips MAXIMUM (fewer is better - only select truly exceptional moments)
2. Each clip should be 15-60 seconds long
3. Each clip MUST have:
   - A compelling hook in the first 3 seconds
   - A satisfying conclusion (complete thought, punchline, or revelation)
   - NO mid-sentence cuts at start or end
4. Prioritize clips that are:
   - Self-contained (viewer doesn't need context from rest of video)
   - Emotionally engaging (funny, shocking, inspiring, controversial)
   - Shareable (people would want to send to friends)
5. AVOID:
   - Intro/outro segments unless exceptionally engaging
   - Clips that require watching previous content to understand
   - Pure B-roll or music without substantial dialogue
   - Repetitive or similar clips

TIMESTAMP PRECISION (CRITICAL):
- ALWAYS align clip boundaries with sentence endings
- Start clips AFTER a period, question mark, or exclamation point
- End clips BEFORE the next sentence begins
- If you see text like "sentence one. Sentence two." at 45s, start at "Sentence" not mid-word
- Look for natural pauses in speech (periods, paragraph breaks in segments)
- NEVER cut someone off mid-word or mid-sentence
- Use segment timestamps to identify sentence boundaries
- If unsure, extend the clip slightly to capture complete thoughts

Think step-by-step:
1. What are the most engaging, shareable moments in this video?
2. Do these moments work as standalone clips?
3. Where exactly should each clip start and end for maximum impact?

Return as JSON:
{
  "clips": [
    {
      "startTime": <number in seconds>,
      "endTime": <number in seconds>,
      "title": "Short, catchy title for the clip",
      "description": "What happens in this clip",
      "reasoning": "Why this clip was selected and why it will perform well",
      "hookAnalysis": "What makes the first 3 seconds compelling",
      "outroAnalysis": "How the clip ends satisfyingly",
      "viralScore": <1-10>,
      "contentWarnings": ["if any: violence, profanity, controversial, etc"]
    }
  ],
  "selectionReasoning": "Overall explanation of clip selection strategy for this specific video"
}`

  logPrompt('STAGE 2 - CLIP SELECTION', prompt)

  // Use o1-preview/o1-mini if available for better reasoning, otherwise GPT-4
  let modelToUse = 'gpt-4o'
  let temperature = 0.5

  // Check if o1 models are available (you can enable these when available)
  // Uncomment when o1 models are accessible:
  // modelToUse = 'o1-preview'  // or 'o1-mini'
  // temperature = 1  // o1 models use temperature=1

  const response = await openai.chat.completions.create({
    model: modelToUse,
    messages: [
      {
        role: 'system',
        content: 'You are an expert at identifying viral moments in videos. You understand what makes content shareable on TikTok, YouTube Shorts, and Instagram Reels. You are very selective and only choose truly exceptional moments.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: temperature
  })

  const result = JSON.parse(response.choices[0].message.content || '{"clips":[],"selectionReasoning":""}')

  // Post-process to ensure we have max 3 clips
  if (result.clips && result.clips.length > 3) {
    console.log(`⚠️ AI returned ${result.clips.length} clips, limiting to top 3 by viral score`)
    result.clips = result.clips
      .sort((a: any, b: any) => (b.viralScore || 0) - (a.viralScore || 0))
      .slice(0, 3)
  }

  logResponse('STAGE 2 - CLIP SELECTION', result)

  return result
}

// ========================================
// MAIN HANDLER
// ========================================
export async function POST(request: NextRequest) {
  try {
    const { transcript, metadata } = await request.json()

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      )
    }

    logSection('NEW MULTI-AGENT ANALYSIS STARTED')
    console.log('Metadata provided:', !!metadata)
    console.log('Transcript type:', typeof transcript)
    console.log('Transcript has segments:', !!(transcript.segments))
    console.log('Transcript has words:', !!(transcript.words))

    // ========================================
    // STAGE 1: CONTENT ANALYSIS
    // ========================================
    console.log('\n🔍 Starting Stage 1: Content Analysis...')
    const contentAnalysis = await analyzeVideoContent(
      transcript.text || transcript,
      metadata
    )

    // ========================================
    // STAGE 2: CLIP SELECTION WITH REASONING
    // ========================================
    console.log('\n🎯 Starting Stage 2: Intelligent Clip Selection...')
    const clipSelection = await selectViralClips(
      transcript,
      contentAnalysis,
      metadata
    )

    // ========================================
    // FINAL RESULT COMPILATION
    // ========================================
    const result = {
      success: true,
      contentAnalysis,
      clips: clipSelection.clips,
      selectionReasoning: clipSelection.selectionReasoning,
      metadata: {
        videoTitle: metadata?.title,
        videoDuration: metadata?.duration,
        analysisVersion: 'v2-multi-agent',
        timestamp: new Date().toISOString()
      }
    }

    logSection('FINAL ANALYSIS COMPLETE')
    console.log('Total clips selected:', result.clips.length)
    console.log('Clips:')
    result.clips.forEach((clip, i) => {
      console.log(`\n  Clip ${i + 1}: "${clip.title}"`)
      console.log(`    Time: ${clip.startTime}s - ${clip.endTime}s (${clip.endTime - clip.startTime}s)`)
      console.log(`    Viral Score: ${clip.viralScore}/10`)
      console.log(`    Hook: ${clip.hookAnalysis}`)
      console.log(`    Outro: ${clip.outroAnalysis}`)
    })
    console.log('\nSelection Strategy:', clipSelection.selectionReasoning)

    return NextResponse.json(result)

  } catch (error: any) {
    logSection('ERROR IN ANALYSIS')
    console.error('Error details:', error)

    return NextResponse.json(
      {
        error: 'Failed to analyze transcript',
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout for longer videos