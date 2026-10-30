import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Initialize R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

/**
 * Generate a presigned URL for direct upload to R2
 * This allows the browser to upload files directly without going through our server
 */
export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string }> {
  // Generate a unique file key with timestamp to avoid collisions
  const timestamp = Date.now()
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const fileKey = `uploads/${timestamp}-${sanitizedFileName}`

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: fileKey,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn })
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`

  return {
    uploadUrl,
    fileKey,
    publicUrl,
  }
}

/**
 * Generate a presigned URL for downloading/viewing a file from R2
 */
export async function generatePresignedDownloadUrl(
  fileKey: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: fileKey,
  })

  return await getSignedUrl(r2Client, command, { expiresIn })
}

/**
 * Get the public URL for a file (if bucket is public)
 */
export function getPublicUrl(fileKey: string): string {
  return `${process.env.R2_PUBLIC_URL}/${fileKey}`
}

export { r2Client }
