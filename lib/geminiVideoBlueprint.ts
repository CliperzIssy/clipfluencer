// ========================================
// GEMINI VISUAL BLUEPRINT SERVICE (Cost-Efficient)
// ========================================
// Uses Gemini 2.5 Flash for VISUAL-ONLY analysis (AssemblyAI handles audio)
// Cost: ~$0.007 per 90-min video (14x cheaper than Video Intelligence API!)
//
// What Gemini analyzes:
// - Facial expressions, gestures, body language
// - Scene changes, camera movements
// - Visual reactions and key moments
// - Text overlays and on-screen content
//
// What AssemblyAI handles:
// - Audio transcription with word-level timing
// - Sentiment, entities, topics, key phrases
// - Speaker detection and audio intelligence
//
// Key settings:
// - LOW resolution (100 tokens/sec vs 300)
// - 1 FPS sampling for visual analysis
// - Structured JSON with searchable fields
// - Up to 6 hours of video supported

import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'path'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '')

export interface GeminiVideoBlueprint {
  videoId: string
  filename: string
  duration: number
  analyzedAt: string
  analysisCost: number
  model: string

  // Timeline events (what happens at each timestamp)
  timeline: Array<{
    timestamp: number
    visual: string
    audio: string
    eventType: string // goal, foul, celebration, gasp, scene_change, etc.
    keyMoment: boolean
    confidence: number
  }>

  // Key events (important moments)
  keyEvents: Array<{
    type: string
    timestamp: number
    startTime: number
    endTime: number
    description: string
    context: string
  }>

  // Labels and categories detected
  labels: Array<{
    label: string
    timestamps: number[]
    confidence: number
  }>

  // Transcript (if speech detected)
  transcript: Array<{
    timestamp: number
    text: string
    speaker?: string
  }>

  // Search index for fast querying
  searchIndex: {
    [key: string]: number[] // keyword -> timestamps
  }
}

/**
 * Create a video blueprint using Gemini 2.5 Flash
 * Much cheaper than Video Intelligence API (~$0.007 vs $0.10 for 90-min video)
 */
export async function createGeminiVideoBlueprint(
  videoPath: string,
  videoId: string,
  options?: {
    fps?: number // Default: 1 FPS
    useLocalFile?: boolean // If true, videoPath is local file system path
    assemblyAITranscript?: any // Pass in AssemblyAI transcript to merge with visual data
  }
): Promise<GeminiVideoBlueprint> {
  console.log('\n========================================')
  console.log('🎬 GEMINI VISUAL BLUEPRINT ANALYSIS')
  console.log('========================================')
  console.log('Video ID:', videoId)
  console.log('Path:', videoPath)
  console.log('Analysis: VISUAL ONLY (AssemblyAI handles audio)')
  console.log('Model: Gemini 2.0 Flash (LOW resolution, 1 FPS)')
  console.log('Cost: ~$0.007 per 90-min video')
  console.log('========================================\n')

  const startTime = Date.now()

  // Upload video to Gemini File API
  console.log('📤 Uploading video to Gemini...')

  let uploadResult
  if (options?.useLocalFile) {
    uploadResult = await fileManager.uploadFile(videoPath, {
      mimeType: 'video/mp4',
      displayName: videoId
    })
  } else {
    // Read from public uploads - handle both with and without leading slash
    const cleanPath = videoPath.replace(/^\/+/, '') // Remove leading slashes
    let fullPath = join(process.cwd(), 'public', cleanPath)

    console.log('🔍 Looking for video file at:', fullPath)

    // Check if file exists
    const { existsSync } = await import('fs')

    // Try multiple variations of the path
    const pathsToTry = [
      fullPath,
      fullPath.replace('.mp4', ''), // Remove .mp4 extension if present
      fullPath.replace('.mov.mp4', '.mov'), // Fix double extension
      videoPath, // Try original path
      join(process.cwd(), 'public', 'uploads', videoId + '.mp4'),
      join(process.cwd(), 'public', 'uploads', videoId + '.mov'),
      join(process.cwd(), 'public', 'uploads', videoId)
    ]

    let foundPath: string | null = null
    for (const tryPath of pathsToTry) {
      if (existsSync(tryPath)) {
        foundPath = tryPath
        console.log('✅ Found video at:', foundPath)
        break
      }
    }

    if (!foundPath) {
      console.error('❌ Could not find video file. Tried:')
      pathsToTry.forEach(p => console.error('   -', p))
      throw new Error(`Video file not found. Tried ${pathsToTry.length} different paths. Please check the file exists in public/uploads/`)
    }

    uploadResult = await fileManager.uploadFile(foundPath, {
      mimeType: 'video/mp4',
      displayName: videoId
    })
  }

  console.log('✅ Video uploaded:', uploadResult.file.uri)
  console.log('   File name:', uploadResult.file.name)
  const sizeBytes = Number(uploadResult.file.sizeBytes || 0)
  console.log('   Size:', (sizeBytes / 1024 / 1024).toFixed(2), 'MB')

  // Wait for video to be processed
  let file = await fileManager.getFile(uploadResult.file.name)
  while (file.state === 'PROCESSING') {
    console.log('⏳ Processing video...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    file = await fileManager.getFile(uploadResult.file.name)
  }

  if (file.state === 'FAILED') {
    throw new Error('Video processing failed')
  }

  console.log('✅ Video ready for analysis')

  // VISUAL-ONLY analysis prompt (AssemblyAI handles audio)
  const prompt = `Analyze VISUAL elements ONLY (we have audio separately).

Return valid JSON with these fields (NO markdown, NO extra text):

{
  "duration": <video_length_in_seconds>,
  "keyEvents": [
    {"type": "gesture|expression|scene_change", "timestamp": 0.0, "startTime": 0.0, "endTime": 5.0, "description": "Brief description", "context": "Why important"}
  ],
  "labels": [
    {"label": "keyword", "timestamps": [0.0, 10.0], "confidence": 0.9}
  ],
  "searchIndex": {
    "keyword": [0.0, 10.0, 20.0]
  },
  "timeline": [
    {"timestamp": 0.0, "visual": "Brief description", "audio": "", "eventType": "type", "keyMoment": true, "confidence": 0.9}
  ],
  "transcript": []
}

DETECT:
- Gestures (pointing, waving, emphatic movements)
- Expressions (surprise, shock, joy, anger)
- Scene changes (cuts, transitions)
- Actions (demonstrations, interactions)
- Text overlays

REQUIREMENTS:
- keyEvents: 8-15 entries (major visual moments) - PRIORITY 1
- labels: 10-20 entries (patterns like "gesture", "surprised", "talking_head") - PRIORITY 1
- searchIndex: Map all visual keywords to timestamps - PRIORITY 1
- timeline: Key moments every 15-30 seconds (not every second!) - PRIORITY 2
- Keep descriptions under 10 words each

IMPORTANT: Generate keyEvents, labels, and searchIndex FIRST. Timeline is secondary.
Focus on SEARCHABLE moments. Return ONLY the JSON object (no markdown blocks).`

  console.log('🤖 Starting Gemini analysis...')
  console.log('   Model: gemini-2.0-flash-exp')
  console.log('   Settings: LOW resolution, 1 FPS')

  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash-exp'
  })

  const result = await model.generateContent([
    {
      fileData: {
        mimeType: uploadResult.file.mimeType,
        fileUri: uploadResult.file.uri
      }
    },
    {
      text: prompt
    }
  ], {
    generationConfig: {
      temperature: 0.7, // Lower for more consistent JSON
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 65536, // Gemini 2.0 Flash supports up to 65k output tokens
    },
    // IMPORTANT: Configure video processing
    // Low resolution = 100 tokens/sec (vs 300 at default)
    // This allows processing up to 6 hours of video!
    videoMetadata: {
      videoMetadata: {
        fps: options?.fps || 1,
        // Low resolution for cost efficiency and longer videos
        mediaResolution: 'LOW'
      }
    }
  })

  const analysisTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2)
  console.log(`✅ Analysis complete in ${analysisTime} minutes`)

  const responseText = result.response.text()

  console.log('📊 Response length:', responseText.length, 'characters')

  // Parse JSON response with intelligent repair
  let analysisData
  try {
    // Extract JSON from markdown code blocks if present
    let jsonText = responseText

    // Remove markdown code blocks
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                     responseText.match(/```\n([\s\S]*?)\n```/) ||
                     responseText.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      jsonText = jsonMatch[1] || jsonMatch[0]
    }

    // Try parsing first
    try {
      analysisData = JSON.parse(jsonText)
    } catch (firstError) {
      console.warn('⚠️ Initial JSON parse failed, attempting advanced repairs...')

      // Advanced repair strategy: Remove incomplete trailing content
      let repairedJson = jsonText

      // Step 1: Find the last COMPLETE property value
      // A complete value ends with: ", } , ] , number, true, false, null
      const completeValuePatterns = [
        /"\s*,/g,        // String property followed by comma
        /"\s*\}/g,       // String property followed by closing brace
        /"\s*\]/g,       // String property followed by closing bracket
        /\d+\s*,/g,      // Number followed by comma
        /\d+\s*\}/g,     // Number followed by closing brace
        /\d+\s*\]/g,     // Number followed by closing bracket
        /true\s*,/g,     // Boolean true
        /false\s*,/g,    // Boolean false
        /null\s*,/g,     // Null value
      ]

      // Find all positions of complete values
      let lastCompletePos = 0
      for (const pattern of completeValuePatterns) {
        let match
        while ((match = pattern.exec(repairedJson)) !== null) {
          lastCompletePos = Math.max(lastCompletePos, match.index + match[0].length - 1)
        }
      }

      // If we found a complete position, truncate there
      if (lastCompletePos > 0) {
        console.log(`   Truncating at position ${lastCompletePos} (last complete value)`)
        repairedJson = repairedJson.substring(0, lastCompletePos + 1)
      }

      // Step 2: Count brackets and braces
      const openBraces = (repairedJson.match(/\{/g) || []).length
      const closeBraces = (repairedJson.match(/\}/g) || []).length
      const openBrackets = (repairedJson.match(/\[/g) || []).length
      const closeBrackets = (repairedJson.match(/\]/g) || []).length

      console.log(`   Braces: ${openBraces} open, ${closeBraces} close`)
      console.log(`   Brackets: ${openBrackets} open, ${closeBrackets} close`)

      // Step 3: Remove trailing commas before adding closing brackets
      repairedJson = repairedJson.replace(/,(\s*)$/, '$1')

      // Step 4: Add missing closing brackets first (inner structures)
      if (closeBrackets < openBrackets) {
        console.log(`   Adding ${openBrackets - closeBrackets} closing brackets`)
        repairedJson += ']'.repeat(openBrackets - closeBrackets)
      }

      // Step 5: Add missing closing braces (outer structures)
      if (closeBraces < openBraces) {
        console.log(`   Adding ${openBraces - closeBraces} closing braces`)
        repairedJson += '}'.repeat(openBraces - closeBraces)
      }

      // Try parsing repaired JSON
      try {
        analysisData = JSON.parse(repairedJson)
        console.log('✅ JSON successfully repaired!')
      } catch (repairError: any) {
        console.error('❌ JSON repair failed:', repairError.message)

        // Save the problematic JSON for debugging
        console.log('💾 Saving problematic JSON for debugging...')
        const debugJson = {
          original: jsonText.substring(0, 1000),
          repaired: repairedJson.substring(0, 1000),
          error: repairError.message
        }
        console.log(JSON.stringify(debugJson, null, 2))

        throw repairError
      }
    }
  } catch (parseError) {
    console.error('❌ Failed to parse Gemini response after repair attempts')
    console.error('Response start:', responseText.substring(0, 500))
    console.error('Response end:', responseText.substring(responseText.length - 500))
    console.error('Parse error:', parseError)
    throw new Error('Failed to parse Gemini video analysis. Try analyzing a shorter video or contact support.')
  }

  // Calculate cost
  // Estimate: 360K tokens for 90-min video at LOW resolution
  const durationMinutes = analysisData.duration / 60
  const estimatedTokens = durationMinutes * 4000 // ~4K tokens per minute
  const estimatedCost = estimatedTokens * 0.00001875 // Gemini input pricing

  console.log('\n========================================')
  console.log('✅ BLUEPRINT CREATED')
  console.log('========================================')
  console.log('Duration:', analysisData.duration.toFixed(2), 'seconds')
  console.log('Timeline entries:', analysisData.timeline?.length || 0)
  console.log('Key events:', analysisData.keyEvents?.length || 0)
  console.log('Labels detected:', analysisData.labels?.length || 0)
  console.log('Transcript segments:', analysisData.transcript?.length || 0)
  console.log('Estimated tokens:', estimatedTokens.toLocaleString())
  console.log('Estimated cost: $' + estimatedCost.toFixed(4))
  console.log('Analysis time:', analysisTime, 'minutes')
  console.log('========================================\n')

  // Clean up uploaded file
  await fileManager.deleteFile(uploadResult.file.name)
  console.log('🗑️  Cleaned up uploaded file')

  // ========================================
  // MERGE ASSEMBLYAI AUDIO DATA (if provided)
  // ========================================
  if (options?.assemblyAITranscript) {
    console.log('\n🎤 Merging AssemblyAI audio data with visual analysis...')
    const assemblyData = options.assemblyAITranscript

    // 1. Merge transcript from AssemblyAI
    if (assemblyData.words && assemblyData.words.length > 0) {
      analysisData.transcript = assemblyData.words.map((word: any) => ({
        timestamp: word.start / 1000, // Convert ms to seconds
        text: word.text,
        speaker: word.speaker || undefined
      }))
      console.log(`   ✓ Added ${analysisData.transcript.length} transcript words`)
    }

    // 2. Enhance searchIndex with audio keywords
    const audioKeywords: { [key: string]: number[] } = {}

    // Add key phrases to searchIndex
    if (assemblyData.auto_highlights_result?.results) {
      for (const highlight of assemblyData.auto_highlights_result.results) {
        const keyword = highlight.text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
        if (!audioKeywords[keyword]) {
          audioKeywords[keyword] = []
        }
        // Add all timestamps where this phrase appears
        highlight.timestamps?.forEach((ts: any) => {
          audioKeywords[keyword].push(ts.start / 1000)
        })
      }
    }

    // Add entities to searchIndex
    if (assemblyData.entities) {
      for (const entity of assemblyData.entities) {
        const keyword = entity.text.toLowerCase()
        if (!audioKeywords[keyword]) {
          audioKeywords[keyword] = [entity.start / 1000]
        }
      }
    }

    // Merge with visual searchIndex
    analysisData.searchIndex = {
      ...analysisData.searchIndex,
      ...audioKeywords
    }
    console.log(`   ✓ Added ${Object.keys(audioKeywords).length} audio keywords to searchIndex`)

    // 3. Add audio-based labels
    const audioLabels = []

    // Add sentiment as labels
    if (assemblyData.sentiment_analysis_results) {
      const sentimentMap: { [key: string]: number[] } = {}
      for (const segment of assemblyData.sentiment_analysis_results) {
        const sentiment = segment.sentiment
        if (!sentimentMap[sentiment]) {
          sentimentMap[sentiment] = []
        }
        sentimentMap[sentiment].push(segment.start / 1000)
      }

      for (const [sentiment, timestamps] of Object.entries(sentimentMap)) {
        audioLabels.push({
          label: `audio_${sentiment}`,
          timestamps,
          confidence: 0.9
        })
      }
    }

    // Add topics as labels
    if (assemblyData.iab_categories_result?.summary) {
      for (const [topic, confidence] of Object.entries(assemblyData.iab_categories_result.summary)) {
        const topicName = topic.split('>').pop()?.trim().toLowerCase().replace(/\s+/g, '_')
        if (topicName) {
          audioLabels.push({
            label: `audio_topic_${topicName}`,
            timestamps: [0], // Topics apply to whole video
            confidence: confidence as number
          })
        }
      }
    }

    analysisData.labels = [...(analysisData.labels || []), ...audioLabels]
    console.log(`   ✓ Added ${audioLabels.length} audio-based labels`)

    // 4. Add audio key events
    if (assemblyData.auto_highlights_result?.results) {
      const audioKeyEvents = assemblyData.auto_highlights_result.results
        .filter((h: any) => h.rank && h.rank > 0.7) // High-rank highlights only
        .slice(0, 10) // Top 10
        .map((highlight: any) => ({
          type: 'audio_highlight',
          timestamp: highlight.timestamps?.[0]?.start / 1000 || 0,
          startTime: highlight.timestamps?.[0]?.start / 1000 || 0,
          endTime: highlight.timestamps?.[0]?.end / 1000 || 0,
          description: `Audio: "${highlight.text}"`,
          context: `Key phrase (rank: ${(highlight.rank * 100).toFixed(0)}%)`
        }))

      analysisData.keyEvents = [...(analysisData.keyEvents || []), ...audioKeyEvents]
      console.log(`   ✓ Added ${audioKeyEvents.length} audio key events`)
    }

    console.log('✅ Audio + Visual data merged!\n')
  }

  const blueprint: GeminiVideoBlueprint = {
    videoId,
    filename: videoPath,
    duration: analysisData.duration,
    analyzedAt: new Date().toISOString(),
    analysisCost: estimatedCost,
    model: 'gemini-2.0-flash-exp',
    timeline: analysisData.timeline || [],
    keyEvents: analysisData.keyEvents || [],
    labels: analysisData.labels || [],
    transcript: analysisData.transcript || [],
    searchIndex: analysisData.searchIndex || {}
  }

  return blueprint
}

/**
 * Save Gemini blueprint to JSON file
 */
export async function saveGeminiBlueprintToFile(
  blueprint: GeminiVideoBlueprint,
  outputDir: string = 'public/blueprints'
): Promise<string> {
  const filename = `gemini-blueprint-${blueprint.videoId}.json`
  const filepath = join(process.cwd(), outputDir, filename)

  await writeFile(filepath, JSON.stringify(blueprint, null, 2), 'utf8')

  const sizeKB = (JSON.stringify(blueprint).length / 1024).toFixed(2)
  console.log('💾 Gemini blueprint saved to:', filepath)
  console.log('   Size:', sizeKB, 'KB')

  return filepath
}

/**
 * Load Gemini blueprint from file
 */
export async function loadGeminiBlueprint(
  videoId: string,
  blueprintsDir: string = 'public/blueprints'
): Promise<GeminiVideoBlueprint> {
  const filepath = join(process.cwd(), blueprintsDir, `gemini-blueprint-${videoId}.json`)
  const data = await readFile(filepath, 'utf8')
  return JSON.parse(data)
}

/**
 * Query Gemini blueprint using natural language
 * This searches the stored blueprint (fast, cheap)
 */
export async function queryGeminiBlueprint(
  blueprint: GeminiVideoBlueprint,
  query: string
): Promise<{
  results: Array<{
    timestamp: number
    startTime: number
    endTime: number
    description: string
    confidence: number
    type: string
    context: any
  }>
  interpretation: string
  totalResults: number
}> {
  console.log('\n🔍 Querying Gemini blueprint:', query)

  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

  const prompt = `You are a video search assistant. Search the video blueprint for moments matching the user's query.

VIDEO BLUEPRINT:
Duration: ${blueprint.duration}s
Timeline entries: ${blueprint.timeline.length}
Key events: ${blueprint.keyEvents.length}

TIMELINE DATA:
${JSON.stringify(blueprint.timeline.slice(0, 100), null, 2)}
${blueprint.timeline.length > 100 ? `\n... and ${blueprint.timeline.length - 100} more entries` : ''}

KEY EVENTS:
${JSON.stringify(blueprint.keyEvents, null, 2)}

LABELS:
${JSON.stringify(blueprint.labels, null, 2)}

TRANSCRIPT:
${JSON.stringify(blueprint.transcript, null, 2)}

SEARCH INDEX:
${JSON.stringify(blueprint.searchIndex, null, 2)}

USER QUERY: "${query}"

TASK: Find all moments that match the query.

For "first goal": Return the earliest timestamp where eventType="goal"
For "all gasps": Return all timestamps where eventType="gasp" or audio mentions gasping
For "celebrations": Return timestamps where eventType="celebration" or labels include "celebration"
For "when player #10 shoots": Search transcript and visual descriptions for "#10" + "shoot"

RESPONSE (valid JSON only):
{
  "interpretation": "User wants to find...",
  "results": [
    {
      "timestamp": 126.5,
      "startTime": 120.0,
      "endTime": 135.0,
      "description": "First goal scored at 2:06",
      "confidence": 0.95,
      "type": "goal",
      "context": {
        "visual": "...",
        "audio": "...",
        "what_happened_before": "...",
        "what_happened_after": "..."
      }
    }
  ],
  "totalResults": 1
}

Search the blueprint and return matching moments.`

  const result = await model.generateContent(prompt)
  const responseText = result.response.text()

  // Parse response
  let queryResult
  try {
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                     responseText.match(/```\n([\s\S]*?)\n```/)
    const jsonText = jsonMatch ? jsonMatch[1] : responseText
    queryResult = JSON.parse(jsonText)
  } catch (parseError) {
    console.error('Failed to parse query response')
    throw new Error('Failed to parse search results')
  }

  console.log(`✅ Found ${queryResult.results?.length || 0} results`)

  return queryResult
}
