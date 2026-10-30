export async function extractVideoFrames(
  video: HTMLVideoElement,
  startTime: number,
  endTime: number,
  frameCount: number = 8
): Promise<string[]> {
  const frames: string[] = []
  const duration = endTime - startTime
  const interval = duration / frameCount

  // Create a canvas for frame extraction
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  // Set canvas size (thumbnail size)
  canvas.width = 160
  canvas.height = 90

  // Create a clone of the video for frame extraction to not interfere with playback
  const tempVideo = document.createElement('video')
  tempVideo.src = video.src
  tempVideo.muted = true
  tempVideo.crossOrigin = 'anonymous'

  // Wait for video to be ready
  await new Promise<void>((resolve) => {
    tempVideo.addEventListener('loadedmetadata', () => resolve())
    tempVideo.load()
  })

  for (let i = 0; i < frameCount; i++) {
    const time = startTime + (i * interval)

    // Seek to the target time and extract frame
    await new Promise<string>((resolve) => {
      const captureFrame = () => {
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        frames.push(dataUrl)
        tempVideo.removeEventListener('seeked', captureFrame)
        resolve(dataUrl)
      }

      tempVideo.addEventListener('seeked', captureFrame)
      tempVideo.currentTime = time
    })
  }

  // Clean up
  tempVideo.remove()

  return frames
}

export async function extractSingleFrame(
  video: HTMLVideoElement,
  time: number
): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  canvas.width = 160
  canvas.height = 90

  // Create a temporary video element
  const tempVideo = document.createElement('video')
  tempVideo.src = video.src
  tempVideo.muted = true
  tempVideo.crossOrigin = 'anonymous'

  // Wait for video to be ready
  await new Promise<void>((resolve) => {
    tempVideo.addEventListener('loadedmetadata', () => resolve())
    tempVideo.load()
  })

  // Seek and capture
  return new Promise<string>((resolve) => {
    const captureFrame = () => {
      ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      tempVideo.removeEventListener('seeked', captureFrame)
      tempVideo.remove()
      resolve(dataUrl)
    }

    tempVideo.addEventListener('seeked', captureFrame)
    tempVideo.currentTime = time
  })
}