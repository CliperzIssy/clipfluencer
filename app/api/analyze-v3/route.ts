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
  console.log(`🎯 ${title}`)
  console.log('='.repeat(70))
}

function logProgress(step: string, status: 'start' | 'complete' | 'error' = 'start') {
  const icon = status === 'complete' ? '✓' : status === 'error' ? '✗' : '→'
  console.log(`  ${icon} ${step}`)
}

// ========================================
// STAGE 1: CONTENT UNDERSTANDING
// ========================================
async function analyzeContent(transcript: string, metadata?: any): Promise<any> {
  const contextInfo = metadata ? `
VIDEO METADATA:
Title: ${metadata.title || 'Not provided'}
Channel/Uploader: ${metadata.uploader || 'Not provided'}
Duration: ${metadata.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Not provided'}
Views: ${metadata.viewCount?.toLocaleString() || 'Not provided'}

Description Preview:
${metadata.description ? metadata.description.substring(0, 300) : 'Not provided'}
` : 'No metadata available'

  const prompt = `Analyze this video content to understand its nature and viral potential.

${contextInfo}

TRANSCRIPT PREVIEW (first 2000 chars):
${transcript.substring(0, 2000)}

Return JSON:
{
  "videoType": "podcast|vlog|tutorial|news|entertainment|documentary|reaction|gaming|sports|comedy|education",
  "mainTopics": ["topic1", "topic2", "topic3"],
  "contentStructure": "linear|episodic|montage|interview|demonstration",
  "targetAudience": "description of audience",
  "viralElements": ["element1", "element2"],
  "contentTone": "serious|humorous|educational|inspirational|controversial",
  "productionQuality": "professional|semi-professional|amateur|mixed"
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a video content analyst specializing in viral content patterns.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  })

  return JSON.parse(response.choices[0].message.content || '{}')
}

// ========================================
// ORCHESTRATION HANDLER
// ========================================
export async function POST(request: NextRequest) {
  try {
    const { transcript, metadata, videoPath } = await request.json()

    if (!transcript || !videoPath) {
      return NextResponse.json(
        { error: 'Missing required data (transcript and videoPath)' },
        { status: 400 }
      )
    }

    logSection('MULTI-MODEL VIRAL CLIP DETECTION v3')
    console.log('Video:', metadata?.title || videoPath)
    console.log('Duration:', metadata?.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Unknown')
    console.log('\nModels in use:')
    console.log('  • OpenAI Whisper - Transcription ✓')
    console.log('  • Gemini 1.5 Flash - Visual Analysis')
    console.log('  • GPT-4o-mini - Content Understanding')
    console.log('  • GPT-5 (2025-08-07) - Final Selection & Advanced Reasoning')

    // ========================================
    // PARALLEL ANALYSIS PHASE
    // ========================================
    logSection('PHASE 1: PARALLEL MULTI-MODAL ANALYSIS')

    logProgress('Content analysis with GPT-4o-mini')
    logProgress('Visual analysis with Gemini 1.5 Flash')
    logProgress('Trend detection (if configured)')

    // Run all analyses in parallel for speed
    const [contentAnalysis, visualAnalysisResponse] = await Promise.all([
      // Content understanding
      analyzeContent(transcript.text || transcript, metadata),

      // Visual analysis with Gemini
      fetch(new URL('/api/analyze-visual', request.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath, transcript, metadata })
      }).then(res => res.json()).catch(error => {
        console.error('Visual analysis failed:', error)
        return { error: error.message, visualAnalysis: null }
      })
    ])

    logProgress('Content analysis with GPT-4o-mini', 'complete')
    logProgress('Visual analysis with Gemini 1.5 Flash',
      visualAnalysisResponse.success ? 'complete' : 'error')

    // Log results
    if (contentAnalysis) {
      console.log('\n📊 Content Analysis Results:')
      console.log('  Video type:', contentAnalysis.videoType)
      console.log('  Topics:', contentAnalysis.mainTopics?.join(', '))
      console.log('  Tone:', contentAnalysis.contentTone)
      console.log('  Quality:', contentAnalysis.productionQuality)
    }

    if (visualAnalysisResponse.visualAnalysis) {
      const va = visualAnalysisResponse.visualAnalysis
      console.log('\n🎬 Visual Analysis Results:')
      console.log('  Visual events:', va.visualEvents?.length || 0)
      console.log('  Scene changes:', va.sceneBreakdown?.sceneChanges?.length || 0)
      console.log('  Multi-scene opportunities:', va.multiSceneClips?.length || 0)
      console.log('  Overall quality:', va.sceneBreakdown?.overallQuality)
    }

    // ========================================
    // FUSION PHASE
    // ========================================
    logSection('PHASE 2: MULTI-MODAL FUSION & SELECTION')

    // If visual analysis failed, fall back to text-only analysis
    if (!visualAnalysisResponse.visualAnalysis) {
      console.log('⚠️ Visual analysis unavailable, using enhanced text analysis')

      // Use the existing v2 text-only analysis as fallback
      const fallbackResponse = await fetch(new URL('/api/analyze-v2', request.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, metadata })
      })

      const fallbackResult = await fallbackResponse.json()

      return NextResponse.json({
        ...fallbackResult,
        analysisVersion: 'v3-text-fallback',
        warning: 'Visual analysis was not available, using text-only analysis'
      })
    }

    logProgress('Aligning visual events with transcript')
    logProgress('Calculating multi-modal scores')
    logProgress('Selecting optimal clips with GPT-5')

    // Call the advanced fusion endpoint
    const fusionResponse = await fetch(new URL('/api/analyze-advanced', request.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        visualAnalysis: visualAnalysisResponse.visualAnalysis,
        metadata,
        contentAnalysis
      })
    })

    const fusionResult = await fusionResponse.json()

    if (!fusionResult.success) {
      throw new Error(fusionResult.error || 'Fusion analysis failed')
    }

    logProgress('Aligning visual events with transcript', 'complete')
    logProgress('Calculating multi-modal scores', 'complete')
    logProgress('Selecting optimal clips with GPT-5', 'complete')

    // ========================================
    // RESULTS COMPILATION
    // ========================================
    logSection('PHASE 3: RESULTS')

    console.log('\n📹 Final Clip Selection:')
    fusionResult.clips?.forEach((clip: any, i: number) => {
      console.log(`\n${i + 1}. "${clip.title}"`)
      console.log(`   Type: ${clip.clipType}`)
      console.log(`   Duration: ${clip.endTime - clip.startTime}s`)
      console.log(`   Time: ${clip.startTime}s - ${clip.endTime}s`)

      if (clip.clipType === 'multi-scene' && clip.scenes) {
        console.log(`   Scenes: ${clip.scenes.length} scenes`)
        clip.scenes.forEach((scene: any, j: number) => {
          console.log(`     ${j + 1}. [${scene.start}s - ${scene.end}s] ${scene.transition || 'cut'}`)
        })
      }

      console.log(`   Scores:`)
      console.log(`     • Visual: ${clip.visualScore}/10`)
      console.log(`     • Audio: ${clip.audioScore}/10`)
      console.log(`     • Emotion: ${clip.emotionalScore}/10`)
      console.log(`     • Overall: ${clip.viralScore?.toFixed(1)}/10`)
      console.log(`   Expected reach: ${clip.expectedReach}`)
    })

    if (fusionResult.selectionStrategy) {
      console.log('\n📋 Selection Strategy:')
      console.log(fusionResult.selectionStrategy)
    }

    // ========================================
    // FINAL RESPONSE
    // ========================================
    const response = {
      success: true,
      clips: fusionResult.clips,
      contentAnalysis,
      selectionReasoning: fusionResult.selectionStrategy,
      metadata: {
        videoTitle: metadata?.title,
        videoDuration: metadata?.duration,
        analysisVersion: 'v3-multi-model',
        modelsUsed: ['whisper', 'gemini-1.5-flash', 'gpt-4o-mini', 'gpt-5-2025-08-07'],
        timestamp: new Date().toISOString(),
        visualAnalysisAvailable: true,
        multiSceneClipsFound: fusionResult.clips?.some((c: any) => c.clipType === 'multi-scene'),
        totalProcessingTime: Date.now() - (request.headers.get('x-start-time') as any || Date.now())
      },
      insights: {
        dominantVideoType: contentAnalysis.videoType,
        mainTopics: contentAnalysis.mainTopics,
        visualHighlights: visualAnalysisResponse.visualAnalysis?.visualInsights?.memorableMoments,
        productionQuality: contentAnalysis.productionQuality,
        recommendedPlatforms: getRecommendedPlatforms(fusionResult.clips)
      }
    }

    logSection('ANALYSIS COMPLETE')
    console.log('✅ All systems processed successfully')
    console.log(`⏱️ Total clips selected: ${response.clips?.length || 0}`)
    console.log(`🎬 Multi-scene clips: ${response.clips?.filter((c: any) => c.clipType === 'multi-scene').length || 0}`)

    return NextResponse.json(response)

  } catch (error: any) {
    logSection('ERROR IN MULTI-MODEL ANALYSIS')
    console.error('Error details:', error)

    // Graceful fallback to simpler analysis
    console.log('\n⚠️ Attempting fallback to v2 analysis...')

    try {
      const { transcript, metadata } = await request.json()

      const fallbackResponse = await fetch(new URL('/api/analyze-v2', request.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, metadata })
      })

      const fallbackResult = await fallbackResponse.json()

      return NextResponse.json({
        ...fallbackResult,
        analysisVersion: 'v3-with-v2-fallback',
        warning: 'Multi-model analysis failed, used text-only fallback',
        originalError: error.message
      })

    } catch (fallbackError) {
      return NextResponse.json(
        {
          error: 'Multi-model analysis failed',
          details: error.message,
          fallbackError: (fallbackError as any).message,
          stack: error.stack
        },
        { status: 500 }
      )
    }
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function getRecommendedPlatforms(clips: any[]): string[] {
  const platforms: Set<string> = new Set()

  clips?.forEach(clip => {
    const duration = clip.endTime - clip.startTime

    if (duration <= 60) {
      platforms.add('TikTok')
      platforms.add('YouTube Shorts')
      platforms.add('Instagram Reels')
    }
    if (duration <= 90) {
      platforms.add('Instagram Reels')
    }
    if (clip.clipType === 'multi-scene') {
      platforms.add('YouTube Shorts') // Better for story-telling
    }
  })

  return Array.from(platforms)
}

export const maxDuration = 300 // 5 minutes timeout