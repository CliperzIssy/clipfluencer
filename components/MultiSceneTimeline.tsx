'use client'

import { useState, useEffect } from 'react'

interface Scene {
  startTime: number
  endTime: number
  duration: number
  role: string
  description: string
}

interface Clip {
  clipId: number
  startTime: number
  endTime: number
  duration: number
  clipType: 'multi-scene'
  scenes: Scene[]
}

interface MultiSceneTimelineProps {
  clip: Clip
  onChange: (updates: Partial<Clip>) => void
  onSeek: (time: number) => void
}

export default function MultiSceneTimeline({ clip, onChange, onSeek }: MultiSceneTimelineProps) {
  const [localScenes, setLocalScenes] = useState<Scene[]>(clip.scenes || [])
  const [expandedScene, setExpandedScene] = useState<number | null>(null)

  useEffect(() => {
    setLocalScenes(clip.scenes || [])
  }, [clip.scenes])

  const handleSceneUpdate = (index: number, updates: Partial<Scene>) => {
    const newScenes = [...localScenes]
    newScenes[index] = { ...newScenes[index], ...updates }

    // Recalculate duration
    if (updates.startTime !== undefined || updates.endTime !== undefined) {
      newScenes[index].duration = newScenes[index].endTime - newScenes[index].startTime
    }

    setLocalScenes(newScenes)

    // Calculate overall clip times
    const totalDuration = newScenes.reduce((sum, scene) => sum + scene.duration, 0)
    const firstStart = newScenes[0]?.startTime || clip.startTime
    const lastEnd = newScenes[newScenes.length - 1]?.endTime || clip.endTime

    onChange({
      scenes: newScenes,
      startTime: firstStart,
      endTime: lastEnd,
      duration: totalDuration
    })
  }

  const handleRemoveScene = (index: number) => {
    if (localScenes.length <= 1) {
      alert('Cannot remove the last scene')
      return
    }

    const confirmed = confirm(`Remove "${localScenes[index].role}" scene?`)
    if (!confirmed) return

    const newScenes = localScenes.filter((_, i) => i !== index)
    setLocalScenes(newScenes)

    const totalDuration = newScenes.reduce((sum, scene) => sum + scene.duration, 0)
    const firstStart = newScenes[0]?.startTime || clip.startTime
    const lastEnd = newScenes[newScenes.length - 1]?.endTime || clip.endTime

    onChange({
      scenes: newScenes,
      startTime: firstStart,
      endTime: lastEnd,
      duration: totalDuration
    })
  }

  const totalDuration = localScenes.reduce((sum, scene) => sum + scene.duration, 0)
  const originalDuration = clip.duration

  return (
    <div className="space-y-6">
      {/* Info Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">
          🤖 AI Combined {localScenes.length} Scenes
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Each scene can be edited or removed individually
        </p>

        {/* Overall Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-gray-400">Original</div>
            <div className="text-sm font-bold">{originalDuration.toFixed(1)}s</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Current</div>
            <div className="text-sm font-bold text-blue-400">{totalDuration.toFixed(1)}s</div>
          </div>
        </div>
      </div>

      {/* Scenes List */}
      <div className="space-y-3">
        {localScenes.map((scene, index) => (
          <div
            key={index}
            className="bg-gray-800 rounded-lg border-2 border-gray-700 hover:border-gray-600 transition"
          >
            {/* Scene Header */}
            <div
              className="p-4 cursor-pointer"
              onClick={() => setExpandedScene(expandedScene === index ? null : index)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-blue-400">
                      SCENE {index + 1}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">
                      {scene.role}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{scene.description}</p>
                </div>

                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-white">
                    {scene.duration.toFixed(1)}s
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSeek(scene.startTime)
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Jump →
                  </button>
                </div>
              </div>

              {/* Timeline Bar */}
              <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-blue-500"
                  style={{
                    width: `${(scene.duration / totalDuration) * 100}%`
                  }}
                />
              </div>

              <div className="flex justify-between mt-1 text-xs text-gray-400">
                <span>{formatTime(scene.startTime)}</span>
                <span>{formatTime(scene.endTime)}</span>
              </div>

              {/* Expand Indicator */}
              <div className="text-center mt-2 text-gray-500 text-xs">
                {expandedScene === index ? '▲ Collapse' : '▼ Expand to edit'}
              </div>
            </div>

            {/* Expanded Controls */}
            {expandedScene === index && (
              <div className="border-t border-gray-700 p-4 space-y-4">
                {/* Start Time Control */}
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Start: {formatTime(scene.startTime)}
                  </label>
                  <input
                    type="range"
                    min={index === 0 ? Math.max(0, scene.startTime - 30) : localScenes[index - 1].endTime}
                    max={scene.endTime - 3}
                    step={0.1}
                    value={scene.startTime}
                    onChange={(e) => handleSceneUpdate(index, {
                      startTime: parseFloat(e.target.value)
                    })}
                    className="w-full"
                  />
                </div>

                {/* End Time Control */}
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    End: {formatTime(scene.endTime)}
                  </label>
                  <input
                    type="range"
                    min={scene.startTime + 3}
                    max={index === localScenes.length - 1 ? scene.endTime + 30 : localScenes[index + 1].startTime}
                    step={0.1}
                    value={scene.endTime}
                    onChange={(e) => handleSceneUpdate(index, {
                      endTime: parseFloat(e.target.value)
                    })}
                    className="w-full"
                  />
                </div>

                {/* Remove Scene Button */}
                {localScenes.length > 1 && (
                  <button
                    onClick={() => handleRemoveScene(index)}
                    className="w-full px-4 py-2 bg-red-900 bg-opacity-30 hover:bg-opacity-50 text-red-400 rounded-lg transition text-sm font-medium"
                  >
                    🗑️ Remove This Scene
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Cut Indicators */}
      {localScenes.length > 1 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            ✂️ AI Cuts ({localScenes.length - 1})
          </h4>
          <div className="space-y-1 text-xs text-gray-400">
            {localScenes.slice(0, -1).map((scene, index) => (
              <div key={index} className="flex justify-between">
                <span>Cut {index + 1}:</span>
                <span className="font-mono">
                  {formatTime(scene.endTime)} → {formatTime(localScenes[index + 1].startTime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-3">
        <p className="text-xs text-blue-300">
          💡 <strong>Tip:</strong> Expand each scene to fine-tune timing or remove unwanted sections
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
