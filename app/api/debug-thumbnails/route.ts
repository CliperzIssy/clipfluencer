import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

export async function GET() {
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })

    // List both thumbnails and uploads
    const thumbnailsCommand = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: 'thumbnails/',
      MaxKeys: 1000,
    })

    const uploadsCommand = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: 'uploads/',
      MaxKeys: 100,
    })

    const [thumbnailsResponse, uploadsResponse] = await Promise.all([
      client.send(thumbnailsCommand),
      client.send(uploadsCommand)
    ])

    // Group thumbnails by folder
    const folders: Record<string, string[]> = {}
    thumbnailsResponse.Contents?.forEach(item => {
      const path = item.Key || ''
      const match = path.match(/thumbnails\/([^/]+)\//)
      if (match) {
        const folder = match[1]
        if (!folders[folder]) folders[folder] = []
        folders[folder].push(path)
      }
    })

    const thumbnailSummary = Object.entries(folders).map(([folder, files]) => {
      // Get frame numbers
      const frameNumbers = files
        .map(f => {
          const match = f.match(/thumb_(\d+)\.jpg/)
          return match ? parseInt(match[1]) : 0
        })
        .filter(n => n > 0)
        .sort((a, b) => a - b)

      return {
        folder,
        totalThumbnails: files.length,
        frameRange: frameNumbers.length > 0
          ? {
              first: frameNumbers[0],
              last: frameNumbers[frameNumbers.length - 1],
              duration: frameNumbers[frameNumbers.length - 1]
            }
          : null,
        files: files.slice(0, 5) // First 5 files as sample
      }
    })

    // List uploaded videos
    const uploadedVideos = uploadsResponse.Contents?.map(item => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified
    })) || []

    return NextResponse.json({
      totalThumbnails: thumbnailsResponse.Contents?.length || 0,
      folders: thumbnailSummary,
      uploadedVideos,
      totalUploads: uploadsResponse.Contents?.length || 0
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
