import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { VideoBlueprint } from '../../../lib/videoIntelligence'

// ========================================
// VIDEO CHAT API
// ========================================
// Query videos using natural language by searching the stored blueprint
// No rate limits! The blueprint is already stored, we just query it
// Gemini is only used to interpret the query and format results

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  const { addLog } = await import('../logs/route')

  try {
    const { videoId, query } = await request.json()

    if (!videoId) {
      return NextResponse.json(
        { error: 'No video ID provided' },
        { status: 400 }
      )
    }

    if (!query) {
      return NextResponse.json(
        { error: 'No query provided' },
        { status: 400 }
      )
    }

    console.log('\n========================================')
    console.log('💬 VIDEO CHAT QUERY')
    console.log('========================================')
    console.log('Video ID:', videoId)
    console.log('Query:', query)
    console.log('========================================\n')

    addLog('info', 'Video chat query received', { videoId, query })

    // Load the blueprint from storage
    const blueprintPath = join(process.cwd(), 'public', 'blueprints', `blueprint-${videoId}.json`)
    const blueprintData = await readFile(blueprintPath, 'utf8')
    const blueprint: VideoBlueprint = JSON.parse(blueprintData)

    console.log('📊 Blueprint loaded')
    console.log('   Duration:', blueprint.duration, 'seconds')
    console.log('   Shot changes:', blueprint.shotChanges.length)
    console.log('   Objects tracked:', blueprint.objects.length)
    console.log('   Labels detected:', blueprint.labels.length)
    console.log('   Speech segments:', blueprint.transcript.length)

    // Use Gemini to interpret the query and search the blueprint
    const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    const prompt = `You are a video search assistant. A user wants to find specific moments in a video.

VIDEO BLUEPRINT DATA:
${JSON.stringify(createCompactBlueprintSummary(blueprint), null, 2)}

USER QUERY: "${query}"

TASK:
1. Analyze the user's query
2. Search the blueprint data for relevant moments
3. Return matching timestamps with descriptions

SEARCH STRATEGIES:

For "find the first goal":
- Search labels for "goal" or "score"
- Search transcript for "goal", "scores"
- Search objects for "ball" near "goal" or "net"
- Return the FIRST matching timestamp

For "find all gasps":
- Search transcript for moments with very short utterances
- Search for audio patterns (speech confidence drops)
- Look for face emotions showing "surprise"

For "find celebrations":
- Search labels for "celebration", "cheering"
- Search transcript for "yes!", "goal!", excited speech
- Search faces for "joy" emotion

For "find when player #10 shoots":
- Search transcript for "#10" or "ten" + "shoots", "kick"
- Search text detections for "10" on jerseys
- Search objects for "ball" movements

For "find the halftime":
- Search transcript for "halftime", "half time", "break"
- Look for long shot changes (scene transitions)
- Search text for "45:00" or "HALF TIME"

RESPONSE FORMAT (valid JSON only):
{
  "interpretation": "User wants to find...",
  "searchStrategy": "Searched labels for 'goal', found 3 matches",
  "results": [
    {
      "timestamp": 126.5,
      "description": "First goal scored at 2:06 - ball crosses line",
      "confidence": 0.95,
      "type": "goal",
      "context": {
        "startTime": 120.0,
        "endTime": 135.0,
        "labels": ["goal", "celebration"],
        "transcript": "And he scores! What a goal!"
      }
    }
  ],
  "totalResults": 1
}

IMPORTANT:
- Return actual timestamps from the blueprint data
- Be specific about what was found
- Include context (what happens before/after)
- Confidence = how sure you are this matches the query
- If no results, return empty array with explanation

Now search the blueprint and respond with JSON only.`

    console.log('🤖 Sending query to Gemini for interpretation...')

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    console.log('📝 Gemini response received')

    // Parse JSON response
    let parsedResponse
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                       responseText.match(/```\n([\s\S]*?)\n```/)

      const jsonText = jsonMatch ? jsonMatch[1] : responseText

      parsedResponse = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError)
      console.error('Raw response:', responseText.substring(0, 500))

      return NextResponse.json({
        error: 'Failed to parse response',
        rawResponse: responseText.substring(0, 500)
      }, { status: 500 })
    }

    console.log('\n✅ Query complete')
    console.log('   Found:', parsedResponse.results?.length || 0, 'results')
    console.log('   Strategy:', parsedResponse.searchStrategy)

    addLog('success', 'Video chat query completed', {
      videoId,
      query,
      resultsFound: parsedResponse.results?.length || 0
    })

    return NextResponse.json({
      success: true,
      query,
      videoId,
      ...parsedResponse,
      metadata: {
        videoDuration: blueprint.duration,
        blueprintStats: {
          shotChanges: blueprint.shotChanges.length,
          objects: blueprint.objects.length,
          labels: blueprint.labels.length,
          speechSegments: blueprint.transcript.length
        }
      }
    })
  } catch (error: any) {
    console.error('❌ Video chat error:', error)

    addLog('error', 'Video chat query failed', {
      error: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to process video chat query',
        details: error.message
      },
      { status: 500 }
    )
  }
}

/**
 * Create a compact summary of the blueprint for Gemini
 * This reduces token usage while keeping all searchable data
 */
function createCompactBlueprintSummary(blueprint: VideoBlueprint): any {
  return {
    duration: blueprint.duration,

    // Shot changes (for finding scene transitions)
    shotChanges: blueprint.shotChanges.map(s => ({
      start: s.startTime.toFixed(1),
      end: s.endTime.toFixed(1)
    })),

    // Labels (most important for searching events)
    labels: blueprint.labels.map(l => ({
      label: l.description,
      confidence: l.confidence.toFixed(2),
      timeRanges: l.segments.map(seg => ({
        start: seg.startTime.toFixed(1),
        end: seg.endTime.toFixed(1),
        conf: seg.confidence.toFixed(2)
      }))
    })),

    // Objects (for tracking specific items like balls, players)
    objects: blueprint.objects.map(o => ({
      object: o.description,
      confidence: o.confidence.toFixed(2),
      timestamps: o.frames.map(f => f.timestamp.toFixed(1))
    })),

    // Transcript (for finding spoken words)
    transcript: blueprint.transcript.map(t => ({
      start: t.startTime.toFixed(1),
      end: t.endTime.toFixed(1),
      text: t.text,
      words: t.words.map(w => ({
        word: w.word,
        time: w.startTime.toFixed(1)
      }))
    })),

    // Faces (for finding emotions)
    faces: blueprint.faces.map(f => ({
      trackId: f.trackId,
      emotions: f.frames
        .filter(frame => frame.attributes)
        .map(frame => ({
          time: frame.timestamp.toFixed(1),
          joy: frame.attributes?.joy?.toFixed(2),
          surprise: frame.attributes?.surprise?.toFixed(2),
          sorrow: frame.attributes?.sorrow?.toFixed(2),
          anger: frame.attributes?.anger?.toFixed(2)
        }))
    })),

    // Text detections (for finding on-screen text like scores)
    textDetections: blueprint.textDetections.map(t => ({
      text: t.text,
      timeRanges: t.segments.map(seg => ({
        start: seg.startTime.toFixed(1),
        end: seg.endTime.toFixed(1)
      }))
    })),

    // Logos (for finding team/brand moments)
    logos: blueprint.logos.map(l => ({
      logo: l.description,
      timeRanges: l.segments.map(seg => ({
        start: seg.startTime.toFixed(1),
        end: seg.endTime.toFixed(1)
      }))
    }))
  }
}

export const maxDuration = 60 // 1 minute timeout (queries are fast)
