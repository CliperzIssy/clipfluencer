/**
 * AUDIO WAVEFORM UTILITIES
 *
 * Extracts audio data from video and generates waveform peaks
 * for visualization in the timeline.
 */

export interface WaveformData {
  peaks: number[]       // Normalized peaks (0-1)
  duration: number      // Audio duration in seconds
  sampleRate: number    // Original sample rate
  channels: number      // Number of audio channels
}

// Cache for waveform data to avoid re-processing
const waveformCache = new Map<string, WaveformData>()

/**
 * Extract audio peaks from a video URL
 * @param videoUrl - URL of the video file
 * @param samplesPerSecond - How many peak samples per second (default: 50)
 */
export async function extractWaveformData(
  videoUrl: string,
  samplesPerSecond: number = 50
): Promise<WaveformData> {
  // Check cache first
  const cacheKey = `${videoUrl}_${samplesPerSecond}`
  if (waveformCache.has(cacheKey)) {
    console.log('🎵 Using cached waveform data')
    return waveformCache.get(cacheKey)!
  }

  console.log('🎵 Extracting audio waveform from:', videoUrl)

  try {
    // Fetch the video file
    const response = await fetch(videoUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    console.log('🎵 Video loaded:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB')

    // Create audio context and decode
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    console.log('🎵 Audio decoded:', {
      duration: audioBuffer.duration.toFixed(2) + 's',
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    })

    // Get audio data (mix down to mono if stereo)
    const channelData = audioBuffer.getChannelData(0)
    const secondChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null

    // Calculate how many samples we need
    const totalPeaks = Math.ceil(audioBuffer.duration * samplesPerSecond)
    const samplesPerPeak = Math.floor(channelData.length / totalPeaks)

    console.log('🎵 Calculating', totalPeaks, 'peaks from', channelData.length, 'samples')

    const peaks: number[] = []

    for (let i = 0; i < totalPeaks; i++) {
      const startSample = i * samplesPerPeak
      const endSample = Math.min(startSample + samplesPerPeak, channelData.length)

      let maxPeak = 0

      for (let j = startSample; j < endSample; j++) {
        // Get absolute value, mix channels if stereo
        let sample = Math.abs(channelData[j])
        if (secondChannel) {
          sample = (sample + Math.abs(secondChannel[j])) / 2
        }
        if (sample > maxPeak) {
          maxPeak = sample
        }
      }

      peaks.push(maxPeak)
    }

    // Normalize peaks to 0-1 range based on max peak
    const maxValue = Math.max(...peaks, 0.001)
    const normalizedPeaks = peaks.map(p => p / maxValue)

    const waveformData: WaveformData = {
      peaks: normalizedPeaks,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    }

    // Cache the result
    waveformCache.set(cacheKey, waveformData)

    // Close audio context to free resources
    await audioContext.close()

    console.log('🎵 Waveform extraction complete:', totalPeaks, 'peaks')
    return waveformData

  } catch (error) {
    console.error('🎵 Error extracting waveform:', error)
    throw error
  }
}

/**
 * Get peaks for a specific time range
 */
export function getPeaksForTimeRange(
  waveformData: WaveformData,
  startTime: number,
  endTime: number,
  targetPeakCount: number
): number[] {
  const { peaks, duration } = waveformData

  const startIndex = Math.floor((startTime / duration) * peaks.length)
  const endIndex = Math.ceil((endTime / duration) * peaks.length)

  const rangePeaks = peaks.slice(startIndex, endIndex)

  // Resample to target count if needed
  if (rangePeaks.length <= targetPeakCount) {
    return rangePeaks
  }

  const result: number[] = []
  const samplesPerTarget = rangePeaks.length / targetPeakCount

  for (let i = 0; i < targetPeakCount; i++) {
    const startIdx = Math.floor(i * samplesPerTarget)
    const endIdx = Math.floor((i + 1) * samplesPerTarget)
    let maxPeak = 0

    for (let j = startIdx; j < endIdx; j++) {
      if (rangePeaks[j] > maxPeak) {
        maxPeak = rangePeaks[j]
      }
    }

    result.push(maxPeak)
  }

  return result
}

/**
 * Clear the waveform cache
 */
export function clearWaveformCache(): void {
  waveformCache.clear()
}
