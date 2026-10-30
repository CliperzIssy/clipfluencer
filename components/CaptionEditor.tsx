'use client'

import { useState } from 'react'

interface Caption {
  text: string
  startTime: number
  endTime: number
  style?: {
    fontSize?: number
    color?: string
    backgroundColor?: string
    position?: { x: number; y: number }
    fontWeight?: string
  }
}

interface CaptionEditorProps {
  captions: Caption[]
  onChange: (captions: Caption[]) => void
  currentTime: number
  onSeek: (time: number) => void
  selectedCaption: number | null
  onSelectCaption: (index: number | null) => void
}

export default function CaptionEditor({
  captions,
  onChange,
  currentTime,
  onSeek,
  selectedCaption,
  onSelectCaption
}: CaptionEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false)

  const handleUpdateCaption = (index: number, updates: Partial<Caption>) => {
    const newCaptions = [...captions]
    newCaptions[index] = { ...newCaptions[index], ...updates }

    // Merge styles if updating style
    if (updates.style) {
      newCaptions[index].style = {
        ...newCaptions[index].style,
        ...updates.style
      }
    }

    onChange(newCaptions)
  }

  const handleDeleteCaption = (index: number) => {
    const confirmed = confirm('Delete this caption?')
    if (!confirmed) return

    const newCaptions = captions.filter((_, i) => i !== index)
    onChange(newCaptions)
    if (selectedCaption === index) {
      onSelectCaption(null)
    }
  }

  const handleAddCaption = () => {
    const newCaption: Caption = {
      text: 'New Caption',
      startTime: currentTime,
      endTime: currentTime + 3,
      style: {
        fontSize: 24,
        color: '#FFFFFF',
        backgroundColor: 'rgba(0,0,0,0.7)',
        position: { x: 50, y: 85 },
        fontWeight: 'bold'
      }
    }

    onChange([...captions, newCaption])
    onSelectCaption(captions.length)
    setShowAddForm(false)
  }

  // Find active caption at current time
  const activeCaptionIndex = captions.findIndex(
    cap => currentTime >= cap.startTime && currentTime <= cap.endTime
  )

  return (
    <div className="space-y-6">
      {/* Info Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Caption Editor</h3>
        <p className="text-xs text-gray-400">
          {captions.length} caption{captions.length !== 1 ? 's' : ''} • Current: {formatTime(currentTime)}
        </p>
      </div>

      {/* Add Caption Button */}
      <button
        onClick={handleAddCaption}
        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium text-sm"
      >
        + Add Caption at {formatTime(currentTime)}
      </button>

      {/* Captions List */}
      <div className="space-y-3">
        {captions.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No captions yet. Click "Add Caption" to start.
          </div>
        ) : (
          captions.map((caption, index) => {
            const isSelected = selectedCaption === index
            const isActive = activeCaptionIndex === index

            return (
              <div
                key={index}
                className={`bg-gray-800 rounded-lg border-2 transition cursor-pointer ${
                  isSelected
                    ? 'border-blue-500'
                    : isActive
                    ? 'border-green-500'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
                onClick={() => onSelectCaption(isSelected ? null : index)}
              >
                {/* Caption Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-blue-400">
                          CAPTION {index + 1}
                        </span>
                        {isActive && (
                          <span className="text-xs px-2 py-0.5 bg-green-700 text-green-200 rounded">
                            Playing
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 line-clamp-2">
                        {caption.text}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSeek(caption.startTime)
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 ml-2"
                    >
                      Jump →
                    </button>
                  </div>

                  {/* Timeline */}
                  <div className="text-xs text-gray-400 flex justify-between">
                    <span>{formatTime(caption.startTime)}</span>
                    <span>{(caption.endTime - caption.startTime).toFixed(1)}s</span>
                    <span>{formatTime(caption.endTime)}</span>
                  </div>
                </div>

                {/* Expanded Editor */}
                {isSelected && (
                  <div className="border-t border-gray-700 p-4 space-y-4">
                    {/* Text Editor */}
                    <div>
                      <label className="text-sm font-medium text-gray-300 mb-2 block">
                        Caption Text
                      </label>
                      <textarea
                        value={caption.text}
                        onChange={(e) => handleUpdateCaption(index, { text: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                      />
                    </div>

                    {/* Timing */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">
                          Start: {formatTime(caption.startTime)}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={caption.endTime - 0.5}
                          step={0.1}
                          value={caption.startTime}
                          onChange={(e) =>
                            handleUpdateCaption(index, {
                              startTime: parseFloat(e.target.value)
                            })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">
                          End: {formatTime(caption.endTime)}
                        </label>
                        <input
                          type="range"
                          min={caption.startTime + 0.5}
                          max={caption.startTime + 30}
                          step={0.1}
                          value={caption.endTime}
                          onChange={(e) =>
                            handleUpdateCaption(index, {
                              endTime: parseFloat(e.target.value)
                            })
                          }
                          className="w-full"
                        />
                      </div>
                    </div>

                    {/* Style Controls */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-300">Style</h4>

                      {/* Font Size */}
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">
                          Font Size: {caption.style?.fontSize || 24}px
                        </label>
                        <input
                          type="range"
                          min={12}
                          max={48}
                          value={caption.style?.fontSize || 24}
                          onChange={(e) =>
                            handleUpdateCaption(index, {
                              style: { fontSize: parseInt(e.target.value) }
                            })
                          }
                          className="w-full"
                        />
                      </div>

                      {/* Colors */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">
                            Text Color
                          </label>
                          <input
                            type="color"
                            value={caption.style?.color || '#FFFFFF'}
                            onChange={(e) =>
                              handleUpdateCaption(index, {
                                style: { color: e.target.value }
                              })
                            }
                            className="w-full h-10 bg-gray-700 border border-gray-600 rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">
                            Background
                          </label>
                          <select
                            value={caption.style?.backgroundColor || 'rgba(0,0,0,0.7)'}
                            onChange={(e) =>
                              handleUpdateCaption(index, {
                                style: { backgroundColor: e.target.value }
                              })
                            }
                            className="w-full h-10 px-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          >
                            <option value="rgba(0,0,0,0.7)">Black</option>
                            <option value="rgba(0,0,0,0)">None</option>
                            <option value="rgba(255,255,255,0.2)">White</option>
                            <option value="rgba(59,130,246,0.7)">Blue</option>
                          </select>
                        </div>
                      </div>

                      {/* Position */}
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">
                          Vertical Position: {caption.style?.position?.y || 85}%
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={90}
                          value={caption.style?.position?.y || 85}
                          onChange={(e) =>
                            handleUpdateCaption(index, {
                              style: {
                                position: {
                                  x: caption.style?.position?.x || 50,
                                  y: parseInt(e.target.value)
                                }
                              }
                            })
                          }
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>Top</span>
                          <span>Bottom</span>
                        </div>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteCaption(index)}
                      className="w-full px-4 py-2 bg-red-900 bg-opacity-30 hover:bg-opacity-50 text-red-400 rounded-lg transition text-sm font-medium"
                    >
                      🗑️ Delete Caption
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Tips */}
      <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-3">
        <p className="text-xs text-blue-300">
          💡 <strong>Tip:</strong> Click a caption to edit text, timing, and styling
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
