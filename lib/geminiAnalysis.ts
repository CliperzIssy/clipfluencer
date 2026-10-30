import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { calculateGeminiCost } from '../app/api/utils/pricing'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)

// ========================================
// LOGGING UTILITIES
// ========================================
function logSection(title: string) {
  console.log('\n' + '='.repeat(60))
  console.log(`🚀 ${title}`)
  console.log('='.repeat(60))
}

// ========================================
// VIDEO CODEC CONVERSION FOR GEMINI
// ========================================
async function ensureH264Codec(videoPath: string): Promise<string> {
  try {
    // Check current codec using ffprobe
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    )

    const currentCodec = probeOutput.trim()
    console.log(`Current video codec: ${currentCodec}`)

    // If already H.264, return original path
    if (currentCodec === 'h264') {
      console.log('✅ Video already in H.264 format')
      return videoPath
    }

    // Need to convert to H.264
    console.log(`⚠️ Converting ${currentCodec} → H.264 (Gemini requires H.264)`)

    // Generate output path (handle any extension)
    const pathParts = videoPath.split('.')
    const extension = pathParts.pop()
    const basePath = pathParts.join('.')
    const outputPath = `${basePath}-h264.mp4`

    console.log(`Input: ${videoPath}`)
    console.log(`Output: ${outputPath}`)

    // Convert using ffmpeg (with 5 minute timeout)
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputPath}" -y`
    console.log('Running ffmpeg conversion...')

    const startTime = Date.now()
    await execAsync(ffmpegCmd, { timeout: 300000 }) // 5 minute timeout
    const conversionTime = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log(`✅ Conversion complete in ${conversionTime}s`)
    console.log(`New file: ${outputPath}`)

    return outputPath

  } catch (error: any) {
    console.error('❌ Codec conversion failed:', error.message)
    // Return original path as fallback
    return videoPath
  }
}

// ========================================
// CORE GEMINI ANALYSIS FUNCTION
// ========================================
export async function runGeminiVisualAnalysis(params: {
  videoPath: string
  transcript?: any
  metadata?: any
  addLog?: (type: string, message: string, data?: any) => void
}): Promise<{
  success: boolean
  analysis: any
  metadata: any
  error?: string
  message?: string
  sizeMB?: number
}> {
  const { videoPath, transcript, metadata, addLog } = params
  let uploadResult: any = null

  try {
    logSection('GEMINI 2.5 FLASH UNIFIED ANALYSIS')
    console.log('Video:', videoPath)
    console.log('Title:', metadata?.title || 'Unknown')
    console.log('Duration:', metadata?.duration ? `${Math.floor(metadata.duration / 60)}m ${metadata.duration % 60}s` : 'Unknown')
    console.log('Has transcript:', !!transcript)

    if (addLog) {
      addLog('gemini', 'Starting Gemini 2.5 Flash unified analysis', {
        video: videoPath,
        hasMetadata: !!metadata
      })
    }

    // Convert video path to file system path
    const videoFilename = videoPath.split('/').pop() || 'video.mp4'
    const videoFullPath = join(process.cwd(), 'public', 'uploads', videoFilename)

    // Ensure video is in H.264 codec (Gemini requirement)
    logSection('PREPARING VIDEO FOR GEMINI 2.0')
    const h264VideoPath = await ensureH264Codec(videoFullPath)

    // Check video size
    const { size: videoSize } = require('fs').statSync(h264VideoPath)
    const videoSizeMB = Math.round(videoSize / 1024 / 1024)
    console.log('Video size:', videoSizeMB, 'MB')
    console.log('Video path:', h264VideoPath)

    // Check if video exceeds Gemini's 2GB limit
    if (videoSizeMB > 2000) {
      console.error('⚠️ Video exceeds Gemini File API limit (2GB)')
      if (addLog) {
        addLog('error', 'Video too large for Gemini', { sizeMB: videoSizeMB })
      }

      return {
        success: false,
        error: 'Video file too large',
        message: `Video is ${videoSizeMB}MB (limit: 2000MB). Please reduce file size.`,
        sizeMB: videoSizeMB,
        analysis: {
          visualAnalysis: {
            visualEvents: [],
            keyMoments: [],
            sceneComposition: {}
          }
        },
        metadata: {}
      }
    }

    // Upload video to Gemini File API (supports up to 2GB)
    console.log('📤 Uploading video to Gemini File API...')
    const uploadStartTime = Date.now()

    uploadResult = await fileManager.uploadFile(h264VideoPath, {
      mimeType: 'video/mp4',
      displayName: `video-analysis-${Date.now()}`
    })

    const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(1)
    console.log(`✅ Upload complete in ${uploadTime}s`)
    console.log('File URI:', uploadResult.file.uri)
    console.log('File name:', uploadResult.file.name)

    // Wait for file to be processed by Gemini
    let file = await fileManager.getFile(uploadResult.file.name)
    while (file.state === 'PROCESSING') {
      console.log('⏳ Waiting for Gemini to process video...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      file = await fileManager.getFile(uploadResult.file.name)
    }

    if (file.state === 'FAILED') {
      console.error('❌ Gemini failed to process video')
      throw new Error('Gemini failed to process uploaded video')
    }

    console.log('✅ Video ready for analysis')

    if (videoSizeMB > 200) {
      console.warn('⚠️ Large video detected. Processing may be slow.')
      if (addLog) {
        addLog('warning', 'Large video file', { sizeMB: videoSizeMB })
      }
    }

    // Calculate appropriate maxOutputTokens based on video duration
    // Gemini 2.5 Flash-Lite supports up to 65536 output tokens
    const videoDuration = metadata?.duration || 600
    const maxTokens = videoDuration > 1800 ? 65536 : // 30+ min videos need max
                      videoDuration > 900 ? 49152 :   // 15-30 min videos
                      videoDuration > 300 ? 32768 :   // 5-15 min videos
                      16384                            // <5 min videos

    console.log(`📊 Token allocation: ${maxTokens} tokens for ${Math.floor(videoDuration / 60)}m ${videoDuration % 60}s video`)

    // Initialize Gemini 2.5 Flash-Lite model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.4,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: maxTokens,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT' as any,
          threshold: 'BLOCK_ONLY_HIGH' as any
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH' as any,
          threshold: 'BLOCK_ONLY_HIGH' as any
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any,
          threshold: 'BLOCK_ONLY_HIGH' as any
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any,
          threshold: 'BLOCK_ONLY_HIGH' as any
        }
      ]
    })

    // Build transcript context for Gemini
    const transcriptContext = transcript ? `
AUDIO TRANSCRIPT (from AssemblyAI with timestamps):
${transcript.segments?.slice(0, 50).map((seg: any) =>
  `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s]: "${seg.text}"`
).join('\n')}
${transcript.segments?.length > 50 ? `\n... (${transcript.segments.length - 50} more segments)` : ''}
` : 'No transcript available'

    // Determine verbosity level based on video duration
    const isLongVideo = videoDuration > 600 // 10+ minutes
    const verbosityGuidance = isLongVideo
      ? `\n⚠️ LONG VIDEO DETECTED (${Math.floor(videoDuration / 60)}+ minutes):
- Log only SIGNIFICANT visual changes (major scene changes, prominent gestures, notable expressions)
- Skip minor movements and subtle changes
- Focus on moments that differ substantially from talking-head baseline
- Aim for 1-2 events per minute of content, not every small change`
      : `\n✓ Standard video length: Log all noticeable visual changes comprehensively`

    // COMPREHENSIVE VISUAL LOGGING - Give director maximum detail
    const prompt = `You are a camera operator documenting this video for the director.

Video Title: ${metadata?.title || 'Video'}
Duration: ${metadata?.duration ? Math.floor(metadata.duration / 60) + 'm ' + (metadata.duration % 60) + 's' : 'Unknown'}

${transcriptContext}

YOUR ROLE: Provide a COMPREHENSIVE, OBJECTIVE visual log of everything you see.
DO NOT judge viral potential or importance - the director will decide that.
${verbosityGuidance}

YOUR TASK: Watch the video and create a detailed visual timeline synced with the spoken words.

Return JSON with this structure:

{
  "visualAnalysis": {
    "visualEvents": [
      {
        "timestamp": 15.5,
        "visual": "Person points index finger directly at camera",
        "bodyLanguage": "Leaning forward, direct eye contact",
        "facialExpression": "Serious, intense gaze",
        "cameraAngle": "Medium close-up, centered",
        "movement": "Sudden gesture from relaxed to pointing",
        "lighting": "Bright, even lighting on face",
        "context": "Speaking during emphasized statement"
      }
    ],
    "sceneComposition": {
      "overallStyle": "podcast" | "vlog" | "interview" | "tutorial" | "reaction" | "documentary" | "talking-head",
      "cameraWork": "static" | "dynamic" | "multi-angle" | "handheld" | "tripod",
      "setting": "indoor" | "outdoor" | "studio" | "location",
      "numberOfPeople": 1,
      "visualPacing": "Description of how often visuals change"
    }
  }
}

DOCUMENT THESE VISUAL ELEMENTS:

1. **Body Language & Gestures**
   - Hand movements (pointing, open palms, fists, gesturing)
   - Arm positions (crossed, open, reaching)
   - Posture changes (leaning in/back, sitting up, slouching)
   - Head movements (nodding, shaking, tilting)

2. **Facial Expressions**
   - Eye movements (widening, squinting, rolling, direct gaze)
   - Mouth positions (smiling, frowning, open, pursed)
   - Eyebrow movements (raised, furrowed, one raised)
   - Overall expression intensity

3. **Camera & Composition**
   - Shot changes (wide, medium, close-up, extreme close-up)
   - Camera movements (pan, tilt, zoom in/out, static)
   - Angle changes (front, side profile, over-shoulder)
   - Focus changes (subject in/out of focus)

4. **Scene Changes & Transitions**
   - Cuts to different locations
   - People entering/leaving frame
   - Background changes
   - B-roll insertions

5. **Visual Context**
   - What is happening during specific spoken words
   - Timing of gestures relative to speech
   - Visual reactions to statements
   - Physical demonstrations or actions

EXAMPLE - Comprehensive Visual Event:
{
  "timestamp": 308.2,
  "visual": "Person suddenly points index finger directly at camera lens",
  "bodyLanguage": "Shifts from relaxed lean-back to forward lean with pointed finger",
  "facialExpression": "Eyes narrow slightly, brow slightly furrowed, mouth forming words with emphasis",
  "cameraAngle": "Medium shot, subject centered, sitting position, waterfront background",
  "movement": "Rapid transition from open palm gesture to direct finger point lasting ~2 seconds",
  "lighting": "Bright outdoor natural lighting, well-lit subject",
  "context": "Speaking while transitioning between conversational tone to emphatic command"
}

CRITICAL RULES:
1. ${isLongVideo ? 'Be SELECTIVE - log only significant visual changes to stay within token limits' : 'Be THOROUGH - document every noticeable visual change'}
2. Be OBJECTIVE - describe what you see, not what you think it means
3. TIMESTAMP FORMAT: Use decimal seconds ONLY (e.g., 65.3 for 1 minute 5.3 seconds, NOT "1.05.3" or "1:05.3")
4. Be PRECISE with timestamps (match with transcript timing when possible)
5. Valid JSON only - no trailing commas, properly escape quotes, proper number format for timestamps
6. If unsure of exact timing, give best estimate within ~1 second accuracy
7. ${isLongVideo ? 'PRIORITY: Avoid hitting token limits - quality over quantity for long videos' : 'Comprehensive logging is preferred for short videos'}

IMPORTANT: Timestamps must be decimal numbers in seconds. Examples:
- CORRECT: 65.3, 120.5, 308.2
- INCORRECT: "1.05.3", "2.00.5", "5:08.2"

The director needs comprehensive visual data to select the best clips. ${isLongVideo ? 'For this long video, focus on QUALITY highlights over exhaustive logging to avoid truncation.' : 'Your job is to capture EVERYTHING.'}`

    logSection('SENDING TO GEMINI 2.5 FLASH-LITE')
    console.log('Model: gemini-2.5-flash-lite')
    console.log('Capabilities:')
    console.log('  ✓ Native audio transcription')
    console.log('  ✓ Visual scene analysis')
    console.log('  ✓ Emotion detection')
    console.log('  ✓ Multi-modal understanding')
    console.log('  ✓ 1M token context (8.5 hours)')
    console.log('  ✓ Faster processing & lower cost')

    if (addLog) {
      addLog('gemini', 'Processing with Gemini 2.5 Flash-Lite', {
        model: 'gemini-2.5-flash-lite',
        videoSizeMB,
        capabilities: ['transcription', 'visual', 'audio', 'emotion']
      })
    }

    const startTime = Date.now()

    // Send to Gemini for unified analysis using File API
    const result = await model.generateContent([
      prompt,
      {
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: uploadResult.file.uri
        }
      }
    ])

    const response = await result.response

    // DEBUG: Check if response has candidates and safety ratings
    console.log('\n🔍 DEBUG: Gemini Response Details')
    console.log('Has candidates:', response.candidates?.length || 0)
    if (response.promptFeedback) {
      console.log('Prompt feedback:', JSON.stringify(response.promptFeedback, null, 2))
      if (response.promptFeedback.blockReason) {
        console.error('⚠️ BLOCKED BY SAFETY FILTER:', response.promptFeedback.blockReason)
        console.error('Block reason details:', response.promptFeedback.blockReasonMessage || 'No details')
      }
    }

    // Check each candidate for safety ratings and MAX_TOKENS
    let hitMaxTokens = false
    if (response.candidates && response.candidates.length > 0) {
      response.candidates.forEach((candidate: any, idx: number) => {
        console.log(`\nCandidate ${idx}:`)
        console.log('  Finish reason:', candidate.finishReason)

        // Check if we hit MAX_TOKENS
        if (candidate.finishReason === 'MAX_TOKENS') {
          hitMaxTokens = true
          console.error('⚠️ WARNING: Response hit MAX_TOKENS limit!')
          console.error('   This means the response was cut off and may be incomplete.')
          console.error('   The JSON may be malformed due to truncation.')
        }

        if (candidate.safetyRatings) {
          console.log('  Safety ratings:', JSON.stringify(candidate.safetyRatings, null, 2))
        }
        if (candidate.content && candidate.content.parts) {
          console.log('  Has content parts:', candidate.content.parts.length)
        }
      })
    }

    const text = response.text()
    const processingTime = (Date.now() - startTime) / 1000

    // Calculate Gemini API cost using centralized pricing
    const usageMetadata = response.usageMetadata
    let geminiCost = null
    if (usageMetadata) {
      geminiCost = calculateGeminiCost(
        'gemini-2.5-flash-lite',
        {
          promptTokenCount: usageMetadata.promptTokenCount || 0,
          candidatesTokenCount: usageMetadata.candidatesTokenCount || 0,
          totalTokenCount: usageMetadata.totalTokenCount || 0
        },
        'video'
      )

      console.log('\n💰 Gemini API Cost:')
      console.log('  ', geminiCost.breakdown)
      console.log('  Input cost: $' + geminiCost.inputCost.toFixed(4))
      console.log('  Output cost: $' + geminiCost.outputCost.toFixed(4))
      console.log('  Total cost: $' + geminiCost.totalCost.toFixed(4))
    }

    console.log('\n📝 Gemini response received, length:', text.length)
    if (text.length === 0) {
      console.error('⚠️ WARNING: Gemini returned empty response!')
      console.log('This could mean:')
      console.log('1. Video file is corrupted or unsupported format')
      console.log('2. Content blocked by safety filters')
      console.log('3. Gemini API quota exceeded')
      console.log('4. Network timeout issue')
      console.log('5. Video codec not supported (requires H.264)')
      console.log('\n🔧 Check the debug output above for more details')
    } else if (text.length < 100) {
      console.log('Gemini response (short):', text)
    } else {
      console.log('Gemini response preview:', text.substring(0, 500) + '...')
    }

    if (addLog) {
      addLog(text.length > 0 ? 'success' : 'warning',
        `Gemini 2.5 Flash-Lite analysis complete in ${processingTime.toFixed(1)}s`, {
        responseLength: text.length,
        hasContent: text.length > 0
      })
    }

    console.log('Raw response length:', text.length)

    // Parse JSON response from Gemini
    let analysis = {
      visualAnalysis: {
        visualEvents: [],
        keyMoments: [],
        sceneComposition: {}
      }
    }

    try {
      // Try to extract JSON from response (may be wrapped in ```json code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/m)
      if (jsonMatch) {
        let cleanedText = jsonMatch[0]
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim()

        // Advanced JSON repair strategies
        console.log('🔧 Attempting to parse and repair JSON...')

        // Strategy 0: Fix malformed timestamps like "1.01.7" -> convert to proper decimal seconds
        if (hitMaxTokens) {
          console.log('⚠️ Response was truncated by MAX_TOKENS, applying aggressive timestamp fixes...')
        }
        cleanedText = cleanedText.replace(/"timestamp":\s*(\d+)\.(\d{2})\.(\d+)/g, (match, min, sec, ms) => {
          const totalSeconds = parseInt(min) * 60 + parseInt(sec) + parseInt(ms) / 10
          console.log(`   Fixed timestamp: ${match} -> "timestamp": ${totalSeconds}`)
          return `"timestamp": ${totalSeconds}`
        })

        // Strategy 1: Fix trailing commas
        cleanedText = cleanedText
          .replace(/,(\s*[}\]])/g, '$1')

        // Strategy 2: Fix invalid escape sequences from Gemini
        cleanedText = cleanedText
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '__BACKSLASH__')
          .replace(/\\([^"\/bfnrtu])/g, '$1')
          .replace(/__BACKSLASH__/g, '\\\\')

        // Strategy 3: Try parsing
        let parsed: any = null
        try {
          parsed = JSON.parse(cleanedText)
        } catch (firstError) {
          console.warn('⚠️ First parse attempt failed, trying repairs...')
          console.error('Parse error details:', firstError)

          // Save raw JSON to file for debugging
          try {
            const debugPath = join(process.cwd(), 'public', 'uploads', `gemini-debug-${Date.now()}.json`)
            writeFileSync(debugPath, cleanedText, 'utf8')
            console.log(`📝 Raw JSON saved for debugging: ${debugPath}`)
          } catch (e) {
            console.warn('Could not save debug file:', e)
          }

          // Strategy 3: If MAX_TOKENS was hit, truncate incomplete objects more aggressively
          if (hitMaxTokens) {
            console.log('⚠️ Applying MAX_TOKENS truncation fixes...')

            // Find the last complete object in the visualEvents array
            // Look for patterns like: }, {  or }, ]
            const lastCompleteObject = cleanedText.lastIndexOf('},')
            const arrayEnd = cleanedText.indexOf('"visualEvents"')

            if (lastCompleteObject > arrayEnd && arrayEnd > 0) {
              console.log(`   Truncating at last complete visual event (position ${lastCompleteObject})`)
              // Keep everything up to and including the last complete object
              let truncated = cleanedText.substring(0, lastCompleteObject + 1)

              // Check if we need to close the visualEvents array
              const eventsArrayStart = truncated.lastIndexOf('"visualEvents": [')
              if (eventsArrayStart > 0) {
                const arrayNotClosed = !truncated.includes(']', eventsArrayStart)
                if (arrayNotClosed) {
                  console.log('   Closing visualEvents array')
                  truncated += '\n    ]'
                }
              }

              cleanedText = truncated
            }
          }

          // Strategy 4: Find incomplete arrays and close them
          const openBrackets = (cleanedText.match(/\[/g) || []).length
          const closeBrackets = (cleanedText.match(/\]/g) || []).length
          const openBraces = (cleanedText.match(/\{/g) || []).length
          const closeBraces = (cleanedText.match(/\}/g) || []).length

          console.log(`   Brackets: ${openBrackets} open, ${closeBrackets} close`)
          console.log(`   Braces: ${openBraces} open, ${closeBraces} close`)

          if (closeBrackets < openBrackets) {
            console.log(`   Adding ${openBrackets - closeBrackets} closing brackets`)
            cleanedText += ']'.repeat(openBrackets - closeBrackets)
          }
          if (closeBraces < openBraces) {
            console.log(`   Adding ${openBraces - closeBraces} closing braces`)
            cleanedText += '}'.repeat(openBraces - closeBraces)
          }

          // Strategy 5: Remove trailing comma before EOF
          cleanedText = cleanedText.replace(/,(\s*[}\]]+\s*)$/g, '$1')

          // Try parsing again
          try {
            parsed = JSON.parse(cleanedText)
            console.log('✅ JSON repaired successfully!')
          } catch (secondError: any) {
            console.error('❌ Could not repair JSON:', secondError)

            // Strategy 6: Try to fix the specific error position
            if (secondError.message && secondError.message.includes('position')) {
              const posMatch = secondError.message.match(/position (\d+)/)
              if (posMatch) {
                const errorPos = parseInt(posMatch[1])
                console.log(`🔍 Error at position ${errorPos}, examining context...`)

                const start = Math.max(0, errorPos - 100)
                const end = Math.min(cleanedText.length, errorPos + 100)
                const context = cleanedText.substring(start, end)
                console.log('Context around error:')
                console.log(context)
                console.log(' '.repeat(Math.min(100, errorPos - start)) + '^--- ERROR HERE')

                try {
                  const fixed = cleanedText.substring(0, errorPos) + cleanedText.substring(errorPos + 1)
                  parsed = JSON.parse(fixed)
                  console.log('✅ Fixed by removing character at error position!')
                } catch (thirdError) {
                  console.error('❌ Could not fix by removing character')
                }
              }
            }

            if (!parsed) {
              console.error('Last 500 chars of cleaned text:', cleanedText.slice(-500))
              throw secondError
            }
          }
        }

        // Validate we have the expected structure
        if (parsed && parsed.visualAnalysis) {
          analysis = parsed
          console.log('✅ Successfully parsed visual analysis JSON')
          console.log(`   Visual events logged: ${analysis.visualAnalysis.visualEvents?.length || 0}`)
          console.log(`   Scene composition: ${Object.keys(analysis.visualAnalysis.sceneComposition || {}).length > 0 ? 'Available' : 'None'}`)

          // Warn if response was truncated
          if (hitMaxTokens) {
            console.warn('⚠️ WARNING: Response was truncated due to MAX_TOKENS limit')
            console.warn(`   Some visual events may be missing from the analysis`)
            console.warn(`   Consider: Shorter video clips, or accepting partial data`)
            if (addLog) {
              addLog('warning', 'Visual analysis truncated - some events may be missing', {
                eventsLogged: analysis.visualAnalysis.visualEvents?.length || 0,
                wasComplete: false
              })
            }
          }
        } else {
          console.warn('⚠️ JSON parsed but missing visualAnalysis structure')
        }
      } else {
        console.error('❌ No JSON found in Gemini response')
      }
    } catch (e) {
      console.error('❌ Failed to parse Gemini JSON response:', e)
      console.error('Response preview:', text.substring(0, 500))
      console.error('Response suffix:', text.slice(-200))
    }

    // Clean up uploaded file from Gemini servers
    try {
      await fileManager.deleteFile(uploadResult.file.name)
      console.log('🗑️ Cleaned up uploaded file from Gemini servers')
    } catch (cleanupError) {
      console.warn('⚠️ Could not delete uploaded file:', cleanupError)
    }

    // Log final analysis results
    logSection('VISUAL ANALYSIS COMPLETE')
    console.log('Visual Events Logged:', analysis.visualAnalysis?.visualEvents?.length || 0)
    console.log('Scene Composition:', Object.keys(analysis.visualAnalysis?.sceneComposition || {}).length > 0 ? 'Available' : 'None')
    console.log('\nNote: This is comprehensive visual data for director review.')
    console.log('      No viral potential judgments - GPT-5 will decide best clips.')

    return {
      success: true,
      analysis,
      metadata: {
        videoPath,
        analyzedAt: new Date().toISOString(),
        model: 'gemini-2.5-flash-lite',
        processingTimeSeconds: processingTime,
        videoSizeMB,
        costs: geminiCost ? {
          inputTokens: usageMetadata!.promptTokenCount || 0,
          outputTokens: usageMetadata!.candidatesTokenCount || 0,
          totalTokens: usageMetadata!.totalTokenCount || 0,
          inputCostUSD: parseFloat(geminiCost.inputCost.toFixed(4)),
          outputCostUSD: parseFloat(geminiCost.outputCost.toFixed(4)),
          totalCostUSD: parseFloat(geminiCost.totalCost.toFixed(4)),
          costBreakdown: geminiCost.breakdown
        } : null
      }
    }

  } catch (error: any) {
    logSection('ERROR IN GEMINI ANALYSIS')
    console.error('Error details:', error)

    // Try to clean up uploaded file even on error
    try {
      if (uploadResult?.file?.name) {
        await fileManager.deleteFile(uploadResult.file.name)
        console.log('🗑️ Cleaned up uploaded file after error')
      }
    } catch (cleanupError) {
      console.warn('⚠️ Could not delete uploaded file after error')
    }

    return {
      success: false,
      error: error.message || 'Unknown error in Gemini analysis',
      analysis: {
        visualAnalysis: {
          visualEvents: [],
          keyMoments: [],
          sceneComposition: {}
        }
      },
      metadata: {}
    }
  }
}
