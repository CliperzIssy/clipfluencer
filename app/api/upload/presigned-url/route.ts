import { NextRequest, NextResponse } from 'next/server'
import { generatePresignedUploadUrl } from '@/lib/r2'

/**
 * API endpoint to generate presigned URLs for direct R2 uploads
 * This allows the browser to upload files directly to R2 without going through our server
 */
export async function POST(request: NextRequest) {
  try {
    const { fileName, contentType } = await request.json()

    if (!fileName) {
      return NextResponse.json(
        { error: 'fileName is required' },
        { status: 400 }
      )
    }

    if (!contentType) {
      return NextResponse.json(
        { error: 'contentType is required' },
        { status: 400 }
      )
    }

    // Validate that it's a video file
    if (!contentType.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Only video files are allowed' },
        { status: 400 }
      )
    }

    console.log(`Generating presigned URL for: ${fileName} (${contentType})`)

    // Generate presigned URL (valid for 1 hour)
    const { uploadUrl, fileKey, publicUrl } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      3600 // 1 hour
    )

    console.log(`✓ Presigned URL generated for key: ${fileKey}`)

    return NextResponse.json({
      uploadUrl,
      fileKey,
      publicUrl,
    })
  } catch (error: any) {
    console.error('Presigned URL generation error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate presigned URL',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
