import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync } from 'fs'
import { join } from 'path'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// ========================================
// LOGGING UTILITIES
// ========================================
function logSection(title: string) {
  console.log('\n' + '='.repeat(60))
  console.log(`🎬 ${title}`)
  console.log('='.repeat(60))
}

function logVisualEvent(event: any) {
  console.log(`  📍 [${event.startTime}s - ${event.endTime}s] ${event.visualType}`)
  console.log(`     ${event.description}`)
  console.log(`     Viral: ${event.viralPotential}/10 | Emotion: ${event.emotionalIntensity}`)
}

// ========================================
// VISUAL ANALYSIS WITH GEMINI
// ========================================
export async function POST(request: NextRequest) {
  // Import logging
  const { addLog } = await import('../logs/route')

  try {
    const { videoPath, transcript, metadata } = await request.json()

    if (!videoPath) {
      return NextResponse.json(
        { error: 'No video path provided' },
        { status: 400 }
      )
    }

    logSection('GEMINI VISUAL ANALYSIS STARTING')
    console.log('Video:', videoPath)
    console.log('Has transcript:', !!transcript)
    console.log('Has metadata:', !!metadata)

    addLog('gemini', 'Starting Gemini visual analysis', {
      video: videoPath,
      hasTranscript: !!transcript,
      hasMetadata: !!metadata
    })

    // Convert video path to file system path
    const videoFilename = videoPath.split('/').pop()
    const videoFullPath = join(process.cwd(), 'public', 'uploads', videoFilename)

    // Read video file as base64
    logSection('PREPARING VIDEO FOR GEMINI')
    const videoData = readFileSync(videoFullPath)
    const base64Video = videoData.toString('base64')
    console.log('Video size:', Math.round(videoData.length / 1024 / 1024), 'MB')

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash', // Using Gemini 1.5 Flash model
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 1,
        maxOutputTokens: 8192,
      }
    })

    // Create detailed prompt for visual analysis
    const prompt = `Analyze this video for viral clip potential with extreme detail. Your goal is to find moments that will make viewers stop scrolling and share.

VIDEO CONTEXT:
${metadata ? `Title: ${metadata.title}
Duration: ${metadata.duration ? Math.floor(metadata.duration / 60) + 'm ' + (metadata.duration % 60) + 's' : 'Unknown'}
Channel: ${metadata.uploader || 'Unknown'}` : 'No metadata available'}

CRITICAL ANALYSIS REQUIREMENTS:

1. VISUAL HOOKS (Find moments with high visual impact):
   - Facial expressions: shock, laughter, surprise, anger, crying
   - Body language: dramatic gestures, sudden movements, reactions
   - Scene changes: location switches, visual effects, transitions
   - On-screen elements: text, graphics, animations, overlays
   - Visual climaxes: reveals, transformations, before/after

2. EMOTIONAL PEAKS (Identify high-emotion moments):
   - Individual reactions: close-ups of strong emotions
   - Group dynamics: multiple people reacting together
   - Tension moments: anticipation, suspense building
   - Release moments: celebration, relief, resolution
   - Conflict or confrontation

3. MULTI-SCENE OPPORTUNITIES (Identify clips that could combine multiple scenes):
   - Setup + Payoff: scenes that build to a climax
   - Before + After: transformation or change sequences
   - Action + Reaction: cause and effect pairs
   - Multiple angles: same moment from different perspectives
   - Montage potential: related scenes that tell a story together

4. SCENE QUALITY ASSESSMENT:
   - Lighting quality (well-lit, dramatic, poor)
   - Camera stability (stable, shaky, moving)
   - Composition (close-up, wide shot, rule of thirds)
   - Visual clarity (clear, blurry, obstructed)
   - Production value (professional, amateur, mixed)

For EACH significant visual moment, provide:
{
  "startTime": number (seconds),
  "endTime": number (seconds),
  "visualType": "reaction|action|reveal|transition|emotion|gesture|text-overlay|montage",
  "description": "detailed description of what happens visually",
  "viralPotential": 1-10,
  "emotionalIntensity": "low|medium|high|extreme",
  "visualQuality": {
    "lighting": "excellent|good|fair|poor",
    "stability": "stable|slight-movement|shaky",
    "framing": "close-up|medium|wide|mixed"
  },
  "people": {
    "count": number,
    "mainSubject": "single-person|group|crowd|none",
    "facesVisible": boolean,
    "eyeContact": boolean
  },
  "specialElements": {
    "hasText": boolean,
    "hasGraphics": boolean,
    "hasTransition": boolean,
    "hasMusic": boolean,
    "hasSoundEffect": boolean
  },
  "multiSceneOpportunity": {
    "canCombineWith": [array of other timestamp ranges],
    "combinationType": "setup-payoff|before-after|action-reaction|montage|none",
    "transitionPoint": number (timestamp where transition would occur)
  },
  "screenshotWorthy": boolean,
  "memeability": "high|medium|low"
}

IMPORTANT:
- Focus on moments that would make someone stop scrolling
- Consider TikTok/Shorts viewing behavior (vertical format, sound often off initially)
- Look for "thumbnail moments" - frames that would make great video covers
- Identify natural cut points for smooth transitions
- Note any text on screen that adds context or humor
- Pay attention to facial expressions even in the background
- Consider viral patterns: reactions, surprises, transformations, fails, wins

Return a JSON object with:
{
  "visualEvents": [array of visual moments],
  "sceneBreakdown": {
    "totalScenes": number,
    "sceneChanges": [array of timestamps],
    "dominantVisualStyle": string,
    "overallQuality": "high|medium|low"
  },
  "multiSceneClips": [
    {
      "scenes": [array of timestamp ranges],
      "combinedDuration": number,
      "theme": "what connects these scenes",
      "viralPotential": 1-10,
      "suggestedTransitions": ["cut|fade|swipe|zoom", ...]
    }
  ],
  "topMoments": [array of top 5 timestamps by viral potential],
  "visualInsights": {
    "strongestEmotions": [array of emotions detected],
    "keyFaces": [description of main people/characters],
    "memorableMoments": [brief descriptions],
    "brandingElements": [logos, products, text],
    "technicalNotes": "any issues or opportunities"
  }
}`

    logSection('SENDING TO GEMINI FOR VISUAL ANALYSIS')
    console.log('Model: gemini-1.5-flash')
    console.log('Analyzing for:')
    console.log('  - Visual hooks and emotional peaks')
    console.log('  - Multi-scene clip opportunities')
    console.log('  - Scene quality and composition')
    console.log('  - Viral potential indicators')

    addLog('gemini', 'Sending video to Gemini 1.5 Flash', {
      model: 'gemini-1.5-flash',
      videoSizeMB: Math.round(videoData.length / 1024 / 1024),
      promptLength: prompt.length
    })

    // Send to Gemini for analysis
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'video/mp4',
          data: base64Video
        }
      }
    ])

    const response = await result.response
    const text = response.text()

    addLog('gemini', 'Gemini analysis complete', {
      responseLength: text.length
    })

    // Clean up the response (remove markdown code blocks if present)
    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let visualAnalysis
    try {
      visualAnalysis = JSON.parse(cleanedText)
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError)
      console.log('Raw response:', cleanedText.substring(0, 500))

      // Attempt to extract JSON from the response
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        visualAnalysis = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse visual analysis response')
      }
    }

    logSection('VISUAL ANALYSIS COMPLETE')
    console.log('Visual events found:', visualAnalysis.visualEvents?.length || 0)
    console.log('Multi-scene opportunities:', visualAnalysis.multiSceneClips?.length || 0)
    console.log('Scene changes detected:', visualAnalysis.sceneBreakdown?.sceneChanges?.length || 0)

    if (visualAnalysis.visualEvents) {
      console.log('\n📊 Top Visual Moments:')
      visualAnalysis.visualEvents
        .sort((a: any, b: any) => b.viralPotential - a.viralPotential)
        .slice(0, 5)
        .forEach((event: any) => logVisualEvent(event))
    }

    if (visualAnalysis.multiSceneClips?.length > 0) {
      console.log('\n🎬 Multi-Scene Clip Opportunities:')
      visualAnalysis.multiSceneClips.forEach((clip: any, i: number) => {
        console.log(`  ${i + 1}. ${clip.theme}`)
        console.log(`     Scenes: ${clip.scenes.length} | Duration: ${clip.combinedDuration}s`)
        console.log(`     Viral potential: ${clip.viralPotential}/10`)
        console.log(`     Transitions: ${clip.suggestedTransitions?.join(', ')}`)
      })
    }

    // Add timestamp alignment helper for later fusion with transcript
    if (transcript?.segments) {
      visualAnalysis.transcriptAlignment = alignVisualWithTranscript(
        visualAnalysis.visualEvents,
        transcript.segments
      )
    }

    return NextResponse.json({
      success: true,
      visualAnalysis,
      metadata: {
        videoPath,
        analyzedAt: new Date().toISOString(),
        model: 'gemini-1.5-flash',
        hasTranscript: !!transcript,
        hasMetadata: !!metadata
      }
    })

  } catch (error: any) {
    logSection('ERROR IN VISUAL ANALYSIS')
    console.error('Error details:', error)

    return NextResponse.json(
      {
        error: 'Failed to analyze video visually',
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    )
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function alignVisualWithTranscript(visualEvents: any[], segments: any[]) {
  return visualEvents.map(event => {
    // Find transcript segments that overlap with this visual event
    const overlappingSegments = segments.filter(seg => {
      const segStart = seg.start || 0
      const segEnd = seg.end || 0
      return (segStart >= event.startTime && segStart < event.endTime) ||
             (segEnd > event.startTime && segEnd <= event.endTime) ||
             (segStart <= event.startTime && segEnd >= event.endTime)
    })

    return {
      ...event,
      transcriptText: overlappingSegments.map(s => s.text).join(' '),
      hasDialogue: overlappingSegments.length > 0,
      wordCount: overlappingSegments.reduce((acc, seg) =>
        acc + (seg.text?.split(' ').length || 0), 0
      )
    }
  })
}

export const maxDuration = 300 // 5 minutes timeout for video processing