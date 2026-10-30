import { NextRequest, NextResponse } from 'next/server'
import { join } from 'path'
import ffmpeg from 'fluent-ffmpeg'
import { existsSync, writeFileSync, unlinkSync } from 'fs'

// Set ffmpeg path - only for local Mac development
// On Railway/Linux, fluent-ffmpeg will auto-detect the system ffmpeg
if (process.platform === 'darwin' && existsSync('/opt/homebrew/bin/ffmpeg')) {
  ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg')
}

const TARGET_WIDTH = 1080
const TARGET_HEIGHT = 1920

interface Caption {
  text: string
  startTime: number
  endTime: number
  style?: {
    fontSize?: number
    color?: string
    backgroundColor?: string
    position?: { x: number; y: number }
    fontWeight?: string
  }
}

interface Scene {
  startTime: number
  endTime: number
  duration: number
  role: string
  description: string
}

interface EditedClip {
  startTime: number
  endTime: number
  duration: number
  clipType: 'single-scene' | 'multi-scene'
  scenes?: Scene[]
  captions?: Caption[]
  videoPath: string
  title: string
}

/**
 * Create ASS subtitle file from captions
 */
function createASSSubtitles(captions: Caption[], outputDir: string): string {
  const assPath = join(outputDir, `captions-${Date.now()}.ass`)

  const assHeader = `[Script Info]
Title: Custom Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,3,2,50,50,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  let assContent = assHeader

  captions.forEach((caption) => {
    const start = formatASSTime(caption.startTime)
    const end = formatASSTime(caption.endTime)
    const text = caption.text.replace(/\n/g, '\\N')

    // Calculate vertical margin based on position
    const verticalPos = caption.style?.position?.y || 85
    const marginV = Math.floor(1920 * (1 - verticalPos / 100))

    // Get color in ASS format
    const color = hexToASSColor(caption.style?.color || '#FFFFFF')
    const bgColor = bgColorToASS(caption.style?.backgroundColor || 'rgba(0,0,0,0.7)')

    assContent += `Dialogue: 0,${start},${end},Default,,0,0,${marginV},,{\\c${color}\\3c${bgColor}}${text}\n`
  })

  writeFileSync(assPath, assContent, 'utf8')
  console.log('✅ Created ASS subtitles:', assPath)

  return assPath
}

/**
 * Format time for ASS subtitles (H:MM:SS.CC)
 */
function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const centisecs = Math.floor((seconds % 1) * 100)

  return `${hours}:${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`
}

/**
 * Convert hex color to ASS format (&HBBGGRR)
 */
function hexToASSColor(hex: string): string {
  const r = hex.substring(1, 3)
  const g = hex.substring(3, 5)
  const b = hex.substring(5, 7)
  return `&H${b}${g}${r}&`
}

/**
 * Convert background color string to ASS format
 */
function bgColorToASS(bg: string): string {
  if (bg === 'rgba(0,0,0,0)' || bg === 'transparent') {
    return '&H00000000&'
  }
  return '&H80000000&' // Semi-transparent black
}

export async function POST(request: NextRequest) {
  const publicDir = join(process.cwd(), 'public', 'uploads')
  let tempSubtitlePath: string | null = null

  try {
    const { originalClip, editedClip } = await request.json()

    console.log('\n🎬 Starting clip render...')
    console.log('Clip type:', editedClip.clipType)
    console.log('Has captions:', editedClip.captions && editedClip.captions.length > 0)

    // Get video path
    const videoFilename = editedClip.videoPath.split('/').pop()
    const videoPath = join(publicDir, videoFilename)

    if (!existsSync(videoPath)) {
      throw new Error('Video file not found')
    }

    // Generate output filename
    const timestamp = Date.now()
    const outputFilename = `edited-clip-${timestamp}.mp4`
    const outputPath = join(publicDir, outputFilename)

    // Create FFmpeg command
    let command = ffmpeg(videoPath)

    // Handle different clip types
    if (editedClip.clipType === 'multi-scene' && editedClip.scenes) {
      console.log('🎞️ Multi-scene clip detected')

      // Create filter complex for multi-scene
      let filterComplex = ''
      const sceneFilters: string[] = []

      editedClip.scenes.forEach((scene: Scene, index: number) => {
        const sceneDuration = scene.endTime - scene.startTime
        sceneFilters.push(
          `[0:v]trim=start=${scene.startTime}:end=${scene.endTime},setpts=PTS-STARTPTS[v${index}];` +
          `[0:a]atrim=start=${scene.startTime}:end=${scene.endTime},asetpts=PTS-STARTPTS[a${index}]`
        )
      })

      const sceneCount = editedClip.scenes.length
      const videoLabels = editedClip.scenes.map((_scene: Scene, i: number) => `[v${i}]`).join('')
      const audioLabels = editedClip.scenes.map((_scene: Scene, i: number) => `[a${i}]`).join('')

      filterComplex = sceneFilters.join(';') + ';' +
        `${videoLabels}concat=n=${sceneCount}:v=1:a=0[vtrim];` +
        `${audioLabels}concat=n=${sceneCount}:v=0:a=1[atrim];` +
        `[vtrim]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT}[vout]`

      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[vout]',
          '-map', '[atrim]'
        ])

    } else {
      console.log('📹 Single-scene clip detected')

      // Simple trim for single-scene
      command
        .setStartTime(editedClip.startTime)
        .setDuration(editedClip.duration)
        .videoFilters([
          `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
          `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`
        ])
    }

    // Add captions if present
    if (editedClip.captions && editedClip.captions.length > 0) {
      console.log(`💬 Adding ${editedClip.captions.length} captions`)
      tempSubtitlePath = createASSSubtitles(editedClip.captions, publicDir)

      // Add subtitle filter
      command.videoFilters([
        `subtitles=${tempSubtitlePath}:force_style='FontName=Arial Black,FontSize=24'`
      ])
    }

    // Set output options
    command
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
      ])
      .output(outputPath)

    // Execute FFmpeg
    await new Promise((resolve, reject) => {
      command
        .on('start', (cmd) => {
          console.log('🎬 FFmpeg started:', cmd)
        })
        .on('progress', (progress) => {
          console.log(`⏳ Progress: ${progress.percent?.toFixed(1)}%`)
        })
        .on('end', () => {
          console.log('✅ Render complete!')
          resolve(true)
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg error:', err)
          reject(err)
        })
        .run()
    })

    // Clean up temporary subtitle file
    if (tempSubtitlePath && existsSync(tempSubtitlePath)) {
      unlinkSync(tempSubtitlePath)
      console.log('🗑️ Cleaned up temp subtitle file')
    }

    return NextResponse.json({
      success: true,
      videoPath: `/uploads/${outputFilename}`,
      filename: outputFilename
    })

  } catch (error: any) {
    console.error('❌ Render error:', error)

    // Clean up temp files
    if (tempSubtitlePath && existsSync(tempSubtitlePath)) {
      try {
        unlinkSync(tempSubtitlePath)
      } catch (e) {
        console.error('Failed to clean up temp file:', e)
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to render edited clip',
        details: error.message
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes max for rendering
