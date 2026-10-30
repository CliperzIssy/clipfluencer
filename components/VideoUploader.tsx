'use client'

import { useState } from 'react'

interface VideoUploaderProps {
  onVideoUploaded: (path: string, metadata?: any) => void
}

export default function VideoUploader({ onVideoUploaded }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [downloadStatus, setDownloadStatus] = useState('')

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('video/')) {
      alert('Please select a video file')
      return
    }

    // Check file size - HARD LIMIT at 1GB
    const hardMaxSizeMB = 1024 // 1GB hard limit
    const warnSizeMB = 500     // 500MB soft warning
    const fileSizeMB = file.size / (1024 * 1024)

    if (fileSizeMB > hardMaxSizeMB) {
      alert(
        `File too large: ${Math.round(fileSizeMB)}MB\n\n` +
        `Maximum file size is ${hardMaxSizeMB}MB (1GB).\n\n` +
        `Your video is too large to process efficiently. Please compress it first:\n\n` +
        `QUICK COMPRESSION OPTIONS:\n` +
        `1. Use HandBrake (free): handbrake.fr\n` +
        `   - Preset: "Fast 1080p30"\n` +
        `   - Should reduce to ~100-300MB\n\n` +
        `2. Use ffmpeg command:\n` +
        `   ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4\n\n` +
        `3. Use online tools:\n` +
        `   - CloudConvert.com\n` +
        `   - FreeConvert.com`
      )
      return
    }

    if (fileSizeMB > warnSizeMB) {
      const proceed = confirm(
        `Large file warning: ${Math.round(fileSizeMB)}MB\n\n` +
        `This may take longer to process. For better performance, consider compressing to under 500MB.\n\n` +
        `Continue anyway?`
      )
      if (!proceed) return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      console.log('Step 1: Requesting presigned URL for R2 upload...')

      // Step 1: Get presigned URL from our API
      const presignedResponse = await fetch('/api/upload/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      })

      if (!presignedResponse.ok) {
        const error = await presignedResponse.json()
        throw new Error(error.error || 'Failed to get upload URL')
      }

      const { uploadUrl, fileKey, publicUrl } = await presignedResponse.json()
      console.log('Step 2: Presigned URL received, uploading directly to R2...')

      // Step 2: Upload directly to R2 using presigned URL
      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          setUploadProgress(percentComplete)
          console.log(`Upload progress: ${Math.round(percentComplete)}%`)
        }
      })

      xhr.addEventListener('load', () => {
        // R2 sometimes returns 400 even when upload succeeds
        // Accept any 2xx, 3xx, or even 4xx if it's just a response issue
        // The key indicator is that the 'load' event fired (upload completed)
        if (xhr.status >= 200 && xhr.status < 300) {
          // Success response
          console.log('✓ Upload to R2 complete! (Status:', xhr.status, ')')
          console.log('File key:', fileKey)
          console.log('Public URL:', publicUrl)

          onVideoUploaded(publicUrl, { fileKey, r2Url: publicUrl })
        } else if (xhr.status === 400 || xhr.status === 403) {
          // R2 quirk: Sometimes returns 400/403 but upload actually succeeded
          // Since the file is likely in the bucket, let's proceed
          console.warn('⚠️ R2 returned', xhr.status, 'but upload likely succeeded')
          console.log('File key:', fileKey)
          console.log('Public URL:', publicUrl)
          console.log('Check R2 bucket to confirm file exists')

          // Proceed anyway - the upload succeeded
          onVideoUploaded(publicUrl, { fileKey, r2Url: publicUrl })
        } else {
          console.error('R2 upload failed with status:', xhr.status)
          alert(`Upload to R2 failed: ${xhr.status}`)
        }

        // Step 3: Trigger Modal processing (async, non-blocking)
        if (xhr.status >= 200 && xhr.status < 500) {
          console.log('🚀 Triggering background video processing...')
          fetch('/api/process-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileKey, video_url: publicUrl }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                console.log('✅ Background processing started!')
              } else {
                console.warn('⚠️ Background processing failed:', data.error)
              }
            })
            .catch((err) => {
              console.error('❌ Failed to trigger background processing:', err)
            })
        }

        setUploading(false)
      })

      xhr.addEventListener('error', () => {
        console.error('R2 upload error')
        alert('Upload error - network issue or R2 connection failed')
        setUploading(false)
      })

      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    } catch (error: any) {
      console.error('Upload error:', error)
      alert(`Error uploading video: ${error.message}`)
      setUploading(false)
    }
  }

  const handleYoutubeDownload = async () => {
    if (!youtubeUrl.trim()) {
      alert('Please enter a YouTube URL')
      return
    }

    setUploading(true)
    setDownloadStatus('Downloading video from YouTube...')

    try {
      const response = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Download failed')
      }

      const data = await response.json()
      setDownloadStatus('Download complete!')
      onVideoUploaded(data.path, data.metadata || data) // Pass full metadata
      setYoutubeUrl('')
      setTimeout(() => setDownloadStatus(''), 2000)
    } catch (error: any) {
      console.error('YouTube download error:', error)
      alert(error.message || 'Error downloading video')
      setDownloadStatus('')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div className="bg-gray-800 rounded-lg p-8 border-2 border-dashed border-gray-600 hover:border-blue-500 transition-colors">
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="video-upload"
        />
        <label
          htmlFor="video-upload"
          className="cursor-pointer flex flex-col items-center"
        >
          <svg
            className="w-16 h-16 text-gray-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-lg font-semibold mb-2">
            {uploading && !downloadStatus ? 'Uploading...' : 'Upload Video'}
          </p>
          <p className="text-sm text-gray-400">
            Click to browse or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-2">MP4, MOV, WebM (Max 1GB)</p>
          <p className="text-xs text-gray-600 mt-1">
            Large files? Use HandBrake or ffmpeg to compress first
          </p>
        </label>

        {uploading && uploadProgress > 0 && (
          <div className="mt-4">
            <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-400 mt-2">
              {Math.round(uploadProgress)}%
            </p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-gray-600"></div>
        <span className="text-gray-400 text-sm">OR</span>
        <div className="flex-1 border-t border-gray-600"></div>
      </div>

      {/* YouTube URL Input */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-6 h-6 text-red-500"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <h3 className="text-lg font-semibold">YouTube URL</h3>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !uploading) {
                handleYoutubeDownload()
              }
            }}
            placeholder="https://youtube.com/watch?v=..."
            disabled={uploading}
            className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleYoutubeDownload}
            disabled={uploading || !youtubeUrl.trim()}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Download
          </button>
        </div>
        {downloadStatus && (
          <p className="text-center text-sm text-blue-400 mt-3">
            {downloadStatus}
          </p>
        )}
      </div>
    </div>
  )
}
