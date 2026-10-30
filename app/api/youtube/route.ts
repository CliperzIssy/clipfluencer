import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, createReadStream, unlinkSync } from 'fs'
import { mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const execAsync = promisify(exec)

// Initialize R2 client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function POST(request: NextRequest) {
  let localFilePath: string | null = null

  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 })
    }

    // Basic YouTube URL validation
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/
    if (!youtubeRegex.test(url)) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400 }
      )
    }

    // Create temp directory if it doesn't exist
    const tempDir = join(process.cwd(), 'tmp')
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `youtube-${timestamp}.mp4`
    localFilePath = join(tempDir, filename)

    // First, extract video metadata before downloading
    console.log('📹 Extracting YouTube video metadata...')
    const metadataCommand = `yt-dlp --print '%(title)s|||%(description)s|||%(duration)s|||%(uploader)s|||%(upload_date)s|||%(view_count)s' --no-download "${url}"`

    let videoTitle = `Video ${timestamp}`
    let videoDescription = ''
    let videoDuration = 0
    let videoUploader = ''
    let uploadDate = ''
    let viewCount = 0

    try {
      const { stdout: metadataOutput } = await execAsync(metadataCommand, {
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer for metadata
      })

      const [title, description, duration, uploader, date, views] = metadataOutput.trim().split('|||')
      videoTitle = title || `Video ${timestamp}`
      videoDescription = description || ''
      videoDuration = parseInt(duration) || 0
      videoUploader = uploader || ''
      uploadDate = date || ''
      viewCount = parseInt(views) || 0

      console.log('========================================')
      console.log('📹 VIDEO METADATA EXTRACTED')
      console.log('========================================')
      console.log('Title:', videoTitle)
      console.log('Uploader:', videoUploader)
      console.log('Duration:', videoDuration, 'seconds')
      console.log('Views:', viewCount.toLocaleString())
      console.log('========================================\n')
    } catch (metadataError) {
      console.error('Failed to extract metadata, continuing with download:', metadataError)
    }

    // Use yt-dlp to download the video
    const command = `yt-dlp --format-sort "res:720,ext:mp4:m4a" --recode-video mp4 -o "${localFilePath}" "${url}"`

    console.log('⬇️ Downloading YouTube video...')
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    })

    if (stderr && stderr.includes('ERROR')) {
      throw new Error(stderr)
    }

    console.log('✓ YouTube download complete')

    // Get file size for upload
    const fileStats = await stat(localFilePath)
    console.log(`📦 File size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`)

    // Upload to R2
    console.log('☁️ Uploading to R2...')
    const fileKey = `uploads/${timestamp}-youtube-${videoTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}.mp4`

    // Read file and upload to R2
    const fileBuffer = await import('fs/promises').then(fs => fs.readFile(localFilePath!))

    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: 'video/mp4',
    }))

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`
    console.log('✓ Uploaded to R2:', publicUrl)

    // Clean up local file
    try {
      unlinkSync(localFilePath)
      console.log('✓ Cleaned up local file')
    } catch (cleanupError) {
      console.warn('Failed to clean up local file:', cleanupError)
    }

    // Trigger Modal processing for thumbnails
    console.log('🚀 Triggering Modal processing for thumbnails...')
    try {
      const modalUrl = `${process.env.MODAL_WEBHOOK_URL}/process`
      const modalResponse = await fetch(modalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: publicUrl,
          video_key: fileKey,
        }),
      })

      if (modalResponse.ok) {
        const modalResult = await modalResponse.json()
        console.log('✓ Modal processing started:', modalResult)
      } else {
        console.warn('⚠️ Modal processing failed:', await modalResponse.text())
      }
    } catch (modalError) {
      console.error('Failed to trigger Modal processing:', modalError)
      // Continue anyway - video is uploaded, thumbnails will be missing
    }

    console.log('========================================')
    console.log('✅ YOUTUBE VIDEO READY')
    console.log('   R2 URL:', publicUrl)
    console.log('   File Key:', fileKey)
    console.log('========================================\n')

    return NextResponse.json({
      path: publicUrl,           // R2 URL (same as local upload)
      filename,
      fileKey,
      title: videoTitle,
      description: videoDescription,
      duration: videoDuration,
      uploader: videoUploader,
      uploadDate,
      viewCount,
      metadata: {
        title: videoTitle,
        description: videoDescription,
        duration: videoDuration,
        uploader: videoUploader,
        uploadDate,
        viewCount,
        fileKey,                  // Include fileKey for thumbnail base URL
        r2Url: publicUrl,
      }
    })
  } catch (error: any) {
    console.error('YouTube download error:', error)

    // Clean up local file on error
    if (localFilePath && existsSync(localFilePath)) {
      try {
        unlinkSync(localFilePath)
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return NextResponse.json(
      { error: 'Failed to download video', details: error.message },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout for long downloads
