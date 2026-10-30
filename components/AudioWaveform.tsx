'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { extractWaveformData, WaveformData } from '@/lib/audioUtils'

interface Segment {
  id: string
  sourceStart: number
  sourceEnd: number
}

interface AudioWaveformProps {
  videoUrl: string
  sourceDuration: number       // Full source video duration
  segments: Segment[]          // Selected segments to highlight
  scale: number                // Timeline scale (pixels per second)
  scrollLeft: number           // Timeline scroll position
  containerWidth: number       // Visible container width
  height?: number              // Waveform height
  onSeek?: (time: number) => void
}

export default function AudioWaveform({
  videoUrl,
  sourceDuration,
  segments,
  scale,
  scrollLeft,
  containerWidth,
  height = 60,
  onSeek,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadProgress, setLoadProgress] = useState(0)

  // Load waveform data when video URL changes
  useEffect(() => {
    if (!videoUrl) return

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setLoadProgress(0)

    // Simulate progress for UX
    const progressInterval = setInterval(() => {
      setLoadProgress(prev => Math.min(prev + 10, 90))
    }, 200)

    extractWaveformData(videoUrl, 100) // 100 samples per second for smooth display
      .then(data => {
        if (!cancelled) {
          setWaveformData(data)
          setLoadProgress(100)
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to load waveform:', err)
          setError('Failed to load audio waveform')
        }
      })
      .finally(() => {
        clearInterval(progressInterval)
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
      clearInterval(progressInterval)
    }
  }, [videoUrl])

  // Check if a time falls within any segment
  const isTimeInSegment = useCallback((time: number): boolean => {
    for (const segment of segments) {
      if (time >= segment.sourceStart && time <= segment.sourceEnd) {
        return true
      }
    }
    return false
  }, [segments])

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !waveformData) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Calculate dimensions
    const totalWidth = sourceDuration * scale
    const dpr = window.devicePixelRatio || 1

    // Set canvas size with device pixel ratio for sharp rendering
    canvas.width = totalWidth * dpr
    canvas.height = height * dpr
    canvas.style.width = `${totalWidth}px`
    canvas.style.height = `${height}px`

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, totalWidth, height)

    // Calculate how many peaks to show
    const peaksToShow = waveformData.peaks.length
    const peakWidth = totalWidth / peaksToShow
    const centerY = height / 2
    const maxBarHeight = (height / 2) - 2

    // Draw waveform bars
    for (let i = 0; i < peaksToShow; i++) {
      const peak = waveformData.peaks[i]
      const x = i * peakWidth
      const barHeight = peak * maxBarHeight

      // Calculate what time this peak represents
      const peakTime = (i / peaksToShow) * waveformData.duration

      // Determine color based on whether it's in a segment
      const inSegment = isTimeInSegment(peakTime)

      if (inSegment) {
        // Gradient for in-segment areas (blue/cyan)
        const gradient = ctx.createLinearGradient(x, centerY - barHeight, x, centerY + barHeight)
        gradient.addColorStop(0, '#00d4ff')
        gradient.addColorStop(0.5, '#0099cc')
        gradient.addColorStop(1, '#00d4ff')
        ctx.fillStyle = gradient
      } else {
        // Dimmed color for out-of-segment areas
        ctx.fillStyle = '#444444'
      }

      // Draw mirrored bars (top and bottom from center)
      const barWidth = Math.max(1, peakWidth - 0.5)

      // Top bar
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight)
      // Bottom bar (mirrored)
      ctx.fillRect(x, centerY, barWidth, barHeight)
    }

    // Draw center line
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(totalWidth, centerY)
    ctx.stroke()

  }, [waveformData, sourceDuration, scale, height, segments, isTimeInSegment])

  // Handle click to seek
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left + scrollLeft
    const clickTime = clickX / scale

    // Clamp to valid range
    const seekTime = Math.max(0, Math.min(sourceDuration, clickTime))
    onSeek(seekTime)
  }

  // Calculate total width based on scale
  const totalWidth = sourceDuration * scale

  return (
    <div
      ref={containerRef}
      className="audio-waveform"
      style={{
        position: 'relative',
        height: `${height}px`,
        width: `${totalWidth}px`,
        background: 'transparent',
        cursor: onSeek ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
      onClick={handleClick}
    >
      {/* Loading state */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080808',
          zIndex: 10,
        }}>
          <div style={{
            width: '150px',
            height: '3px',
            background: '#222',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${loadProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #0099cc, #00d4ff)',
              transition: 'width 0.2s ease',
            }} />
          </div>
          <span style={{
            marginTop: '6px',
            fontSize: '10px',
            color: '#555',
          }}>
            Loading waveform...
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080808',
          color: '#555',
          fontSize: '10px',
        }}>
          {error}
        </div>
      )}

      {/* Waveform canvas */}
      {waveformData && !isLoading && (
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
          }}
        />
      )}
    </div>
  )
}
