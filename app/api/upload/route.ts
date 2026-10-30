import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('video') as File

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Server-side file size validation (1GB hard limit)
    const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB in bytes
    const fileSizeMB = file.size / (1024 * 1024)

    if (file.size > MAX_FILE_SIZE) {
      console.error(`File too large: ${fileSizeMB.toFixed(2)}MB (max: 1GB)`)
      return NextResponse.json(
        {
          error: 'File too large',
          details: `File size: ${Math.round(fileSizeMB)}MB. Maximum allowed: 1GB (1024MB). Please compress your video before uploading.`,
          sizeMB: Math.round(fileSizeMB),
          maxSizeMB: 1024
        },
        { status: 413 } // 413 Payload Too Large
      )
    }

    console.log(`Uploading file: ${file.name} (${fileSizeMB.toFixed(2)}MB)`)

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads')
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `video-${timestamp}.${file.name.split('.').pop()}`
    const filepath = join(uploadsDir, filename)

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)

    // Return path that can be used in the video player
    const publicPath = `/uploads/${filename}`

    return NextResponse.json({ path: publicPath, filename })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
