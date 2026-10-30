'use client'

import { useState, useEffect } from 'react'

interface Clip {
  clipId: number
  startTime: number
  endTime: number
  duration: number
  originalVideoPath?: string
}

interface SimpleTimelineProps {
  clip: Clip
  onChange: (updates: Partial<Clip>) => void
  onSeek: (time: number) => void
}

export default function SimpleTimeline({ clip, onChange, onSeek }: SimpleTimelineProps) {
  const [localStartTime, setLocalStartTime] = useState(clip.startTime)
  const [localEndTime, setLocalEndTime] = useState(clip.endTime)
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null)

  // Maximum extendable duration (assume 30 seconds before and after as buffer)
  const maxExtendBefore = Math.max(0, clip.startTime - 30)
  const maxExtendAfter = clip.endTime + 30 // You might want to get actual video duration

  useEffect(() => {
    setLocalStartTime(clip.startTime)
    setLocalEndTime(clip.endTime)
  }, [clip.startTime, clip.endTime])

  const handleStartTimeChange = (newStart: number) => {
    const validStart = Math.max(maxExtendBefore, Math.min(newStart, localEndTime - 5))
    setLocalStartTime(validStart)
  }

  const handleEndTimeChange = (newEnd: number) => {
    const validEnd = Math.max(localStartTime + 5, Math.min(newEnd, maxExtendAfter))
    setLocalEndTime(validEnd)
  }

  const handleCommit = () => {
    onChange({
      startTime: localStartTime,
      endTime: localEndTime,
      duration: localEndTime - localStartTime
    })
  }

  const handleReset = () => {
    setLocalStartTime(clip.startTime)
    setLocalEndTime(clip.endTime)
    onChange({
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: clip.duration
    })
  }

  const currentDuration = localEndTime - localStartTime
  const hasChanges = localStartTime !== clip.startTime || localEndTime !== clip.endTime

  return (
    <div className="space-y-6">
      {/* Info Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Single Scene Clip</h3>
        <p className="text-xs text-gray-400">
          Drag handles to extend or trim the clip duration
        </p>
      </div>

      {/* Duration Display */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Original</div>
          <div className="text-lg font-bold">{clip.duration.toFixed(1)}s</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Current</div>
          <div className="text-lg font-bold text-blue-400">{currentDuration.toFixed(1)}s</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Change</div>
          <div className={`text-lg font-bold ${
            currentDuration > clip.duration ? 'text-green-400' :
            currentDuration < clip.duration ? 'text-red-400' :
            'text-gray-400'
          }`}>
            {currentDuration > clip.duration ? '+' : ''}
            {(currentDuration - clip.duration).toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Timeline Visualization */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">Timeline</label>
        <div className="bg-gray-800 rounded-lg p-4">
          {/* Timeline Bar */}
          <div className="relative h-12 bg-gray-700 rounded">
            {/* Extended before area */}
            {localStartTime < clip.startTime && (
              <div
                className="absolute h-full bg-green-500 bg-opacity-30 border-l-2 border-green-500"
                style={{
                  left: `${((localStartTime - maxExtendBefore) / (maxExtendAfter - maxExtendBefore)) * 100}%`,
                  width: `${((clip.startTime - localStartTime) / (maxExtendAfter - maxExtendBefore)) * 100}%`
                }}
              >
                <div className="absolute -top-6 left-0 text-xs text-green-400">
                  +{(clip.startTime - localStartTime).toFixed(1)}s
                </div>
              </div>
            )}

            {/* Original clip area */}
            <div
              className="absolute h-full bg-blue-500 bg-opacity-50"
              style={{
                left: `${((clip.startTime - maxExtendBefore) / (maxExtendAfter - maxExtendBefore)) * 100}%`,
                width: `${(clip.duration / (maxExtendAfter - maxExtendBefore)) * 100}%`
              }}
            />

            {/* Current selection */}
            <div
              className="absolute h-full bg-blue-600 border-2 border-blue-400"
              style={{
                left: `${((localStartTime - maxExtendBefore) / (maxExtendAfter - maxExtendBefore)) * 100}%`,
                width: `${((localEndTime - localStartTime) / (maxExtendAfter - maxExtendBefore)) * 100}%`
              }}
            >
              {/* Start Handle */}
              <div
                className="absolute -left-2 top-0 w-4 h-full bg-blue-400 cursor-ew-resize hover:bg-blue-300 transition"
                onMouseDown={() => setIsDragging('start')}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs">
                  ⋮
                </div>
              </div>

              {/* End Handle */}
              <div
                className="absolute -right-2 top-0 w-4 h-full bg-blue-400 cursor-ew-resize hover:bg-blue-300 transition"
                onMouseDown={() => setIsDragging('end')}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs">
                  ⋮
                </div>
              </div>
            </div>

            {/* Extended after area */}
            {localEndTime > clip.endTime && (
              <div
                className="absolute h-full bg-green-500 bg-opacity-30 border-r-2 border-green-500"
                style={{
                  left: `${((clip.endTime - maxExtendBefore) / (maxExtendAfter - maxExtendBefore)) * 100}%`,
                  width: `${((localEndTime - clip.endTime) / (maxExtendAfter - maxExtendBefore)) * 100}%`
                }}
              >
                <div className="absolute -top-6 right-0 text-xs text-green-400">
                  +{(localEndTime - clip.endTime).toFixed(1)}s
                </div>
              </div>
            )}
          </div>

          {/* Time labels */}
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{formatTime(maxExtendBefore)}</span>
            <span>{formatTime(maxExtendAfter)}</span>
          </div>
        </div>
      </div>

      {/* Precise Controls */}
      <div className="space-y-4">
        {/* Start Time */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-2 block">
            Start Time: {formatTime(localStartTime)}
          </label>
          <div className="flex gap-2">
            <input
              type="range"
              min={maxExtendBefore}
              max={localEndTime - 5}
              step={0.1}
              value={localStartTime}
              onChange={(e) => handleStartTimeChange(parseFloat(e.target.value))}
              className="flex-1"
            />
            <button
              onClick={() => onSeek(localStartTime)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
            >
              Jump
            </button>
          </div>
        </div>

        {/* End Time */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-2 block">
            End Time: {formatTime(localEndTime)}
          </label>
          <div className="flex gap-2">
            <input
              type="range"
              min={localStartTime + 5}
              max={maxExtendAfter}
              step={0.1}
              value={localEndTime}
              onChange={(e) => handleEndTimeChange(parseFloat(e.target.value))}
              className="flex-1"
            />
            <button
              onClick={() => onSeek(localEndTime)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
            >
              Jump
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {hasChanges && (
        <div className="flex gap-2 pt-4 border-t border-gray-800">
          <button
            onClick={handleReset}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            Reset
          </button>
          <button
            onClick={handleCommit}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium"
          >
            Apply Changes
          </button>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-3">
        <p className="text-xs text-blue-300">
          💡 <strong>Tip:</strong> You can extend up to 30 seconds before and after the original clip
        </p>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100) // Centiseconds (2 digits)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
