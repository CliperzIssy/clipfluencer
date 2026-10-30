// ========================================
// FRAME-BY-FRAME VIDEO ANALYSIS SYSTEM
// ========================================
// Analyzes EVERY frame/second of video for comprehensive search
// Cost: ~$0.50-1.00 per 10-min video (acceptable per user requirement)
//
// Strategy:
// 1. Extract frames at 1 FPS
// 2. Process in batches of 30-60 frames
// 3. Store simple observations for each frame
// 4. Merge with audio transcript
// 5. Enable natural language search

import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '')

// Simple observation structure
export interface FrameObservation {
  t: number  // timestamp in seconds
  v: string  // visual description (what's seen)
}

export interface FrameByFrameBlueprint {
  videoId: string
  duration: number
  fps: number
  frames: FrameObservation[]
  audio?: any  // AssemblyAI transcript
  metadata: {
    analyzedAt: string
    frameCount: number
    cost: number
    model: string
  }
}

/**
 * Extract frames from video at specified FPS
 */
async function extractFrames(
  videoPath: string,
  outputDir: string,
  fps: number = 1
): Promise<string[]> {
  console.log(`📸 Extracting frames at ${fps} FPS...`)

  // Create output directory
  await mkdir(outputDir, { recursive: true })

  // FFmpeg command to extract frames
  // -i: input file
  // -vf fps=1: extract 1 frame per second
  // -q:v 2: quality (2 is high quality)
  const command = `ffmpeg -i "${videoPath}" -vf fps=${fps} -q:v 2 "${outputDir}/frame_%04d.jpg" -hide_banner -loglevel error`

  try {
    await execAsync(command)

    // Get list of extracted frames
    const frames: string[] = []
    let frameNum = 1
    while (true) {
      const framePath = join(outputDir, `frame_${String(frameNum).padStart(4, '0')}.jpg`)
      if (!existsSync(framePath)) break
      frames.push(framePath)
      frameNum++
    }

    console.log(`✅ Extracted ${frames.length} frames`)
    return frames
  } catch (error) {
    console.error('❌ Frame extraction failed:', error)
    throw new Error('Failed to extract frames. Is FFmpeg installed?')
  }
}

/**
 * Process frames in batches with Gemini
 */
async function processFrameBatch(
  framePaths: string[],
  startTime: number,
  fps: number
): Promise<FrameObservation[]> {
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash-exp'
  })

  // Upload frames to Gemini
  const uploadPromises = framePaths.map(async (framePath, index) => {
    const uploadResult = await fileManager.uploadFile(framePath, {
      mimeType: 'image/jpeg',
      displayName: `frame_${startTime + index}`
    })
    return {
      uri: uploadResult.file.uri,
      mimeType: 'image/jpeg',
      timestamp: startTime + (index / fps)
    }
  })

  const uploadedFrames = await Promise.all(uploadPromises)

  // Create simple prompt
  const prompt = `For each image, describe ONLY what you see in 15 words or less.
Focus on: people, clothing colors, actions, objects, text, expressions.

Return a JSON array with EXACTLY ${framePaths.length} entries:
[
  {"t": 0, "v": "description of frame 1"},
  {"t": 1, "v": "description of frame 2"},
  ...
]

Be specific: "man in red shirt waving" not "person gesturing"
Include colors, positions, actions.`

  // Build content array with images
  const content = [
    { text: prompt },
    ...uploadedFrames.map(frame => ({
      fileData: {
        fileUri: frame.uri,
        mimeType: frame.mimeType
      }
    }))
  ]

  try {
    const result = await model.generateContent(content, {
      generationConfig: {
        temperature: 0.3,  // Low for consistency
        topP: 0.95,
        maxOutputTokens: 4096,  // Enough for batch
      }
    })

    const responseText = result.response.text()

    // Clean up uploaded files
    await Promise.all(uploadedFrames.map(frame =>
      fileManager.deleteFile(frame.uri.split('/').pop()!)
    ))

    // Parse simple JSON array
    let observations: FrameObservation[]
    try {
      const jsonMatch = responseText.match(/\[([\s\S]*?)\]/);
      const jsonText = jsonMatch ? `[${jsonMatch[1]}]` : responseText
      observations = JSON.parse(jsonText)

      // Adjust timestamps
      observations = observations.map((obs, index) => ({
        t: startTime + (index / fps),
        v: obs.v
      }))
    } catch (error) {
      console.error('Parse error, using fallback')
      // Fallback: create basic observations
      observations = framePaths.map((_, index) => ({
        t: startTime + (index / fps),
        v: "Frame data unavailable"
      }))
    }

    return observations
  } catch (error) {
    console.error('Batch processing error:', error)
    // Return basic observations on error
    return framePaths.map((_, index) => ({
      t: startTime + (index / fps),
      v: "Processing error"
    }))
  }
}

/**
 * Main function: Analyze video frame by frame
 */
export async function analyzeVideoFrameByFrame(
  videoPath: string,
  videoId: string,
  options?: {
    fps?: number  // Frames per second to extract (default: 1)
    batchSize?: number  // Frames per batch (default: 30)
    audioTranscript?: any  // AssemblyAI data
  }
): Promise<FrameByFrameBlueprint> {
  const fps = options?.fps || 1
  const batchSize = options?.batchSize || 30

  console.log('\n========================================')
  console.log('🎬 FRAME-BY-FRAME VIDEO ANALYSIS')
  console.log('========================================')
  console.log('Video:', videoPath)
  console.log('FPS:', fps)
  console.log('Batch size:', batchSize, 'frames')
  console.log('========================================\n')

  const startTime = Date.now()

  // Fix video path (handle both absolute and relative paths)
  let actualVideoPath = videoPath
  if (!videoPath.startsWith('/Users/')) {
    // It's a relative path like /uploads/video.mp4
    const cleanPath = videoPath.replace(/^\/+/, '') // Remove leading slashes
    actualVideoPath = join(process.cwd(), 'public', cleanPath)
  }

  // Step 1: Extract frames
  const framesDir = join(process.cwd(), 'tmp', `frames_${videoId}`)
  const framePaths = await extractFrames(actualVideoPath, framesDir, fps)

  // Step 2: Process in batches
  const allObservations: FrameObservation[] = []
  const numBatches = Math.ceil(framePaths.length / batchSize)

  console.log(`\n🔄 Processing ${numBatches} batches...`)

  for (let i = 0; i < numBatches; i++) {
    const batchStart = i * batchSize
    const batchEnd = Math.min(batchStart + batchSize, framePaths.length)
    const batchFrames = framePaths.slice(batchStart, batchEnd)

    console.log(`   Batch ${i + 1}/${numBatches}: frames ${batchStart}-${batchEnd}...`)

    const batchObservations = await processFrameBatch(
      batchFrames,
      batchStart,
      fps
    )

    allObservations.push(...batchObservations)

    // Small delay between batches to avoid rate limits
    if (i < numBatches - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Step 3: Clean up frame files
  try {
    await execAsync(`rm -rf "${framesDir}"`)
    console.log('🗑️  Cleaned up frame files')
  } catch (error) {
    console.warn('Could not clean up frames:', error)
  }

  // Step 4: Calculate cost
  // Gemini 2.0 Flash: ~$0.075 per 1M input tokens
  // Each image ~258 tokens at standard resolution
  // For 600 frames (10 min @ 1fps): 600 * 258 = 154,800 tokens = ~$0.012
  // With batching overhead: ~$0.02-0.05 per 10-min video
  const estimatedTokens = framePaths.length * 258
  const estimatedCost = estimatedTokens * 0.000075

  const analysisTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2)

  console.log('\n========================================')
  console.log('✅ FRAME-BY-FRAME ANALYSIS COMPLETE')
  console.log('========================================')
  console.log('Frames analyzed:', framePaths.length)
  console.log('Observations:', allObservations.length)
  console.log('Analysis time:', analysisTime, 'minutes')
  console.log('Estimated cost: $' + estimatedCost.toFixed(4))
  console.log('========================================\n')

  // Step 5: Build blueprint
  const blueprint: FrameByFrameBlueprint = {
    videoId,
    duration: framePaths.length / fps,
    fps,
    frames: allObservations,
    audio: options?.audioTranscript,
    metadata: {
      analyzedAt: new Date().toISOString(),
      frameCount: framePaths.length,
      cost: estimatedCost,
      model: 'gemini-2.0-flash-exp'
    }
  }

  return blueprint
}

/**
 * Save frame-by-frame blueprint
 */
export async function saveFrameByFrameBlueprint(
  blueprint: FrameByFrameBlueprint,
  outputDir: string = 'public/blueprints'
): Promise<string> {
  const filename = `frame-blueprint-${blueprint.videoId}.json`
  const filepath = join(process.cwd(), outputDir, filename)

  await writeFile(filepath, JSON.stringify(blueprint, null, 2), 'utf8')

  const sizeKB = (JSON.stringify(blueprint).length / 1024).toFixed(2)
  console.log('💾 Frame blueprint saved:', filepath)
  console.log('   Size:', sizeKB, 'KB')
  console.log('   Frames:', blueprint.frames.length)

  return filepath
}

/**
 * Query frame-by-frame blueprint
 */
export async function queryFrameByFrameBlueprint(
  blueprint: FrameByFrameBlueprint,
  query: string
): Promise<{
  results: Array<{
    timestamp: number
    description: string
    confidence: number
  }>
}> {
  console.log('🔍 Searching frames for:', query)

  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.3
    }
  })

  // Create search prompt with frame data
  const prompt = `Search these video frames for: "${query}"

Frame data (t=timestamp in seconds, v=visual description):
${JSON.stringify(blueprint.frames.slice(0, 300), null, 2)}
${blueprint.frames.length > 300 ? `\n... and ${blueprint.frames.length - 300} more frames` : ''}

Find ALL frames matching the query. Consider partial matches and related concepts.
For "person in red shirt waving", find frames with: red shirt, waving, both together, etc.

Return JSON array of matches:
[
  {"timestamp": 0, "description": "what's happening", "confidence": 0.95},
  ...
]

Return empty array [] if no matches found.`

  const result = await model.generateContent(prompt)
  const responseText = result.response.text()

  try {
    const jsonMatch = responseText.match(/\[([\s\S]*?)\]/)
    const results = jsonMatch ? JSON.parse(`[${jsonMatch[1]}]`) : []
    console.log(`✅ Found ${results.length} matching frames`)
    return { results }
  } catch (error) {
    console.error('Search parse error:', error)
    return { results: [] }
  }
}

/**
 * Get actual video duration using ffprobe
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of json "${videoPath}"`
    )

    const result = JSON.parse(stdout)
    const duration = Math.ceil(parseFloat(result.format.duration))
    console.log(`📏 Video duration detected: ${duration} seconds`)
    return duration
  } catch (error) {
    console.warn('⚠️ Could not detect video duration with ffprobe:', error)
    return 600 // Default to 10 minutes if detection fails
  }
}

/**
 * Process video directly using Gemini 2.5 Flash
 * Sends entire video in one request - no chunking needed!
 */
export async function analyzeVideoDirectly(
  videoPath: string,
  videoId: string,
  audioTranscript?: any
): Promise<FrameByFrameBlueprint> {
  console.log('\n========================================')
  console.log('🎬 DIRECT VIDEO ANALYSIS (EVERY SECOND)')
  console.log('========================================\n')

  const startTime = Date.now()

  // Fix video path (handle both absolute and relative paths)
  let actualVideoPath = videoPath
  if (!videoPath.startsWith('/Users/')) {
    // It's a relative path like /uploads/video.mp4
    const cleanPath = videoPath.replace(/^\/+/, '') // Remove leading slashes
    actualVideoPath = join(process.cwd(), 'public', cleanPath)
  }

  console.log('📂 Video path:', actualVideoPath)

  // Check if file exists
  const { existsSync } = await import('fs')
  if (!existsSync(actualVideoPath)) {
    console.error('❌ Video file not found at:', actualVideoPath)
    throw new Error(`Video file not found: ${videoPath}`)
  }

  // STEP 1: Get actual video duration FIRST
  const actualVideoDuration = await getVideoDuration(actualVideoPath)

  // STEP 2: Upload video to Gemini
  console.log('📤 Uploading video to Gemini...')
  const uploadResult = await fileManager.uploadFile(actualVideoPath, {
    mimeType: 'video/mp4',
    displayName: videoId
  })

  // Wait for processing
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

  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-flash'
  })

  console.log(`\n🎯 Analyzing entire ${actualVideoDuration} seconds of video in ONE request...`)
  console.log('   Using Gemini 2.5 Flash - no chunking needed!')

  // Simple prompt for the entire video
  const prompt = `Describe what you see at EACH SECOND of this entire video (1 FPS).

For EVERY second from 0 to ${actualVideoDuration}, write what's visible:
- People: clothing colors, appearance, names if shown
- Actions: gestures, movements
- Objects: what's visible
- Text: any text on screen
- Scene: location, setting

Return ONLY a JSON array with ALL seconds:
[
  {"t": 0, "v": "Man in black shirt at desk with computer"},
  {"t": 1, "v": "Same man pointing at monitor, text overlay visible"},
  {"t": 2, "v": "Close up of face, surprised expression"},
  ...continue for EVERY second until ${actualVideoDuration}
]

CRITICAL:
- One entry per second (0 to ${actualVideoDuration})
- Keep descriptions under 15 words each
- Be specific (colors, actions, positions)
- Include ALL visible details
- Continue for ENTIRE video duration

Return ONLY the JSON array, no other text.`

  let frames: FrameObservation[] = []

  try {
    console.log('   📤 Sending entire video to Gemini 2.5 Flash...')

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: uploadResult.file.uri
        }
      },
      { text: prompt }
    ], {
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 65536, // Large output for full video
      },
      videoMetadata: {
        videoMetadata: {
          fps: 1,  // Process at 1 FPS
          mediaResolution: 'STANDARD'
        }
      }
    })

    const responseText = result.response.text()
    console.log('   ✓ Response received, parsing...')

    // Parse response
    const jsonMatch = responseText.match(/\[([\s\S]*)\]/)
    if (jsonMatch) {
      frames = JSON.parse(jsonMatch[0])
      console.log(`   ✓ Parsed ${frames.length} frames`)
    } else {
      console.error('   ✗ Could not find JSON array in response')
      throw new Error('Invalid response format from Gemini')
    }
  } catch (error: any) {
    console.error('   ✗ Error analyzing video:', error.message)
    throw error
  }

  // Clean up
  await fileManager.deleteFile(uploadResult.file.name)

  const analysisTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2)

  const analyzedDuration = frames.length > 0 ? Math.max(...frames.map(f => f.t || 0)) + 1 : 0
  const coveragePercent = actualVideoDuration > 0 ? ((analyzedDuration / actualVideoDuration) * 100).toFixed(1) : 100

  console.log('\n========================================')
  console.log('✅ ANALYSIS COMPLETE')
  console.log('========================================')
  console.log('Frames analyzed:', frames.length)
  console.log('Duration covered:', analyzedDuration, 'seconds')
  console.log('Actual video duration:', actualVideoDuration, 'seconds')
  console.log('Coverage:', coveragePercent + '%')
  if (parseFloat(coveragePercent) < 95) {
    console.log('⚠️  WARNING: Incomplete coverage! Some parts of the video may not be searchable.')
    console.log('   Missing:', actualVideoDuration - analyzedDuration, 'seconds')
  } else {
    console.log('✨ FULL COVERAGE ACHIEVED!')
  }
  console.log('Analysis time:', analysisTime, 'minutes')
  console.log('========================================\n')

  return {
    videoId,
    duration: actualVideoDuration,  // Use ACTUAL duration, not analyzed
    fps: 1,
    frames,
    audio: audioTranscript,
    metadata: {
      analyzedAt: new Date().toISOString(),
      frameCount: frames.length,
      actualDuration: actualVideoDuration,
      analyzedDuration: analyzedDuration,
      cost: 0.05,  // Rough estimate
      model: 'gemini-2.5-flash',
      coverage: coveragePercent + '%',
      processingMode: 'single-request'
    }
  }
}