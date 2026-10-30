'use client'

import { useState, useRef, useEffect } from 'react'

interface Scene {
  id: string
  startTime: number
  endTime: number
  duration: number
  role?: string
  description?: string
}

interface TimelineSection {
  id: string
  startTime: number
  endTime: number
  duration: number
  color: string
  label: string
  order: number // Playback order (user-defined)
}

interface ProfessionalTimelineProps {
  clip: any
  onChange: (updates: any) => void
  onSeek: (time: number) => void
  currentTime: number
}

export default function ProfessionalTimeline({
  clip,
  onChange,
  onSeek,
  currentTime
}: ProfessionalTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [sections, setSections] = useState<TimelineSection[]>([])
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState<{ sectionId: string; handle: 'start' | 'end' } | null>(null)
  const [showSplitMenu, setShowSplitMenu] = useState(false)
  const [draggedSection, setDraggedSection] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Initialize sections from clip data
  useEffect(() => {
    if (clip.clipType === 'multi-scene' && clip.scenes) {
      const sceneSections: TimelineSection[] = clip.scenes.map((scene: Scene, index: number) => ({
        id: scene.id || `scene-${index}`,
        startTime: scene.startTime,
        endTime: scene.endTime,
        duration: scene.endTime - scene.startTime,
        color: getSceneColor(index),
        label: scene.role || `Scene ${index + 1}`,
        order: index // Initially in chronological order
      }))
      setSections(sceneSections)
    } else {
      // Single scene - create one section
      setSections([{
        id: 'main',
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.endTime - clip.startTime,
        color: '#3b82f6',
        label: 'Main Clip',
        order: 0
      }])
    }
  }, [clip])

  const getSceneColor = (index: number) => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']
    return colors[index % colors.length]
  }

  const handleSectionClick = (sectionId: string) => {
    setSelectedSection(sectionId)
    setShowSplitMenu(true)

    // Seek to section start
    const section = sections.find(s => s.id === sectionId)
    if (section) {
      onSeek(section.startTime)
    }
  }

  const handleSplit = () => {
    if (!selectedSection) return

    const section = sections.find(s => s.id === selectedSection)
    if (!section) return

    // Split at current time within the section
    const splitTime = currentTime

    // Ensure split is within section bounds
    if (splitTime <= section.startTime || splitTime >= section.endTime) {
      alert('Move the playhead to where you want to split')
      return
    }

    // Create two new sections
    const newSections = sections.flatMap(s => {
      if (s.id === selectedSection) {
        return [
          {
            id: `${s.id}-a`,
            startTime: s.startTime,
            endTime: splitTime,
            duration: splitTime - s.startTime,
            color: s.color,
            label: `${s.label} (A)`,
            order: s.order // Keep same order position
          },
          {
            id: `${s.id}-b`,
            startTime: splitTime,
            endTime: s.endTime,
            duration: s.endTime - splitTime,
            color: s.color,
            label: `${s.label} (B)`,
            order: s.order + 0.5 // Slightly after
          }
        ]
      }
      return s
    })

    // Renumber orders
    newSections.sort((a, b) => a.order - b.order)
    newSections.forEach((s, i) => s.order = i)

    setSections(newSections)
    setShowSplitMenu(false)
    setSelectedSection(null)

    // Update clip data
    updateClipFromSections(newSections)
  }

  const handleDeleteSection = () => {
    if (!selectedSection || sections.length <= 1) {
      alert('Cannot delete the last section')
      return
    }

    const newSections = sections.filter(s => s.id !== selectedSection)
    // Reorder remaining sections
    newSections.forEach((s, i) => s.order = i)
    setSections(newSections)
    setShowSplitMenu(false)
    setSelectedSection(null)

    updateClipFromSections(newSections)
  }

  // Reordering functions
  const handleDragSectionStart = (e: React.DragEvent, sectionId: string) => {
    e.stopPropagation()
    setDraggedSection(sectionId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragSectionOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverIndex(index)
  }

  const handleDragSectionDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggedSection) return

    const draggedIndex = sections.findIndex(s => s.id === draggedSection)
    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      setDraggedSection(null)
      setDragOverIndex(null)
      return
    }

    // Reorder sections
    const newSections = [...sections]
    const [removed] = newSections.splice(draggedIndex, 1)
    newSections.splice(targetIndex, 0, removed)

    // Update order values
    newSections.forEach((s, i) => s.order = i)

    setSections(newSections)
    setDraggedSection(null)
    setDragOverIndex(null)

    console.log('🔄 Reordered sections:', newSections.map((s, i) => `${i + 1}. ${s.label}`))

    updateClipFromSections(newSections)
  }

  const handleDragSectionEnd = () => {
    setDraggedSection(null)
    setDragOverIndex(null)
  }

  const resetToChronologicalOrder = () => {
    const sorted = [...sections].sort((a, b) => a.startTime - b.startTime)
    sorted.forEach((s, i) => s.order = i)
    setSections(sorted)
    updateClipFromSections(sorted)
  }

  const handleDragStart = (sectionId: string, handle: 'start' | 'end') => {
    setIsDragging({ sectionId, handle })
  }

  const handleDragMove = (e: React.MouseEvent) => {
    if (!isDragging || !timelineRef.current) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))

    // Calculate time in the ORIGINAL video (not relative to clip)
    const totalDuration = clip.endTime - clip.startTime
    const newTime = clip.startTime + (percentage * totalDuration)

    const sectionIndex = sections.findIndex(s => s.id === isDragging.sectionId)
    if (sectionIndex === -1) return

    const newSections = [...sections]
    const section = newSections[sectionIndex]

    if (isDragging.handle === 'start') {
      // Allow extending into original video (30s buffer before current start)
      const minTime = sectionIndex > 0
        ? newSections[sectionIndex - 1].endTime
        : Math.max(0, section.startTime - 30) // Can extend 30s earlier

      const maxTime = section.endTime - 1 // Keep at least 1 second

      section.startTime = Math.max(minTime, Math.min(newTime, maxTime))
      section.duration = section.endTime - section.startTime

    } else {
      // Allow extending into original video (30s buffer after current end)
      const maxTime = sectionIndex < sections.length - 1
        ? newSections[sectionIndex + 1].startTime
        : section.endTime + 30 // Can extend 30s later

      const minTime = section.startTime + 1 // Keep at least 1 second

      section.endTime = Math.max(minTime, Math.min(newTime, maxTime))
      section.duration = section.endTime - section.startTime
    }

    setSections(newSections)

    // Update in real-time during drag
    updateClipFromSections(newSections)
  }

  const handleDragEnd = () => {
    if (isDragging) {
      updateClipFromSections(sections)
    }
    setIsDragging(null)
  }

  const updateClipFromSections = (newSections: TimelineSection[]) => {
    const totalDur = newSections.reduce((sum, s) => sum + s.duration, 0)
    const firstStart = newSections[0]?.startTime || clip.startTime
    const lastEnd = newSections[newSections.length - 1]?.endTime || clip.endTime

    console.log('🎬 Updating clip from sections:', {
      sectionsCount: newSections.length,
      totalDuration: totalDur.toFixed(1),
      startTime: firstStart.toFixed(1),
      endTime: lastEnd.toFixed(1),
      change: (totalDur - clip.duration).toFixed(1) + 's'
    })

    if (clip.clipType === 'multi-scene') {
      const updatedScenes = newSections.map((s, i) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: s.duration,
        role: s.label,
        description: ''
      }))

      onChange({
        scenes: updatedScenes,
        startTime: firstStart,
        endTime: lastEnd,
        duration: totalDur
      })
    } else {
      const section = newSections[0]
      if (section) {
        onChange({
          startTime: section.startTime,
          endTime: section.endTime,
          duration: section.duration
        })
      }
    }
  }

  // Calculate actual timeline bounds from sections
  const timelineStart = sections.length > 0 ? Math.min(...sections.map(s => s.startTime)) : clip.startTime
  const timelineEnd = sections.length > 0 ? Math.max(...sections.map(s => s.endTime)) : clip.endTime
  const totalDuration = timelineEnd - timelineStart

  // Show extendable area (30s before/after)
  const extendableStart = Math.max(0, timelineStart - 30)
  const extendableEnd = timelineEnd + 30

  const getPositionPercentage = (time: number) => {
    return ((time - timelineStart) / totalDuration) * 100
  }

  const playheadPosition = getPositionPercentage(currentTime)

  return (
    <div className="space-y-4">
      {/* Timeline Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">Timeline Editor</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">{sections.length} section{sections.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">Duration:</span>
              <span className="text-white font-mono font-bold">{totalDuration.toFixed(1)}s</span>
              {clip.duration && Math.abs(totalDuration - clip.duration) > 0.1 && (
                <span className={`font-mono ${totalDuration > clip.duration ? 'text-green-400' : 'text-yellow-400'}`}>
                  ({totalDuration > clip.duration ? '+' : ''}{(totalDuration - clip.duration).toFixed(1)}s)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded p-2 text-xs text-blue-300">
            <strong>Timeline:</strong> Drag edges to extend • Click to select • Split at playhead
          </div>
          <div className="bg-purple-900 bg-opacity-20 border border-purple-700 rounded p-2 text-xs text-purple-300">
            <strong>Reorder:</strong> Drag sections in list below to change playback order
          </div>
        </div>
      </div>

      {/* Visual Timeline */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div
          ref={timelineRef}
          className="relative h-24 bg-gray-900 rounded-lg overflow-hidden cursor-pointer"
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onClick={(e) => {
            if (!isDragging) {
              const rect = timelineRef.current!.getBoundingClientRect()
              const x = e.clientX - rect.left
              const percentage = x / rect.width
              const clickTime = clip.startTime + (percentage * totalDuration)
              onSeek(clickTime)
            }
          }}
        >
          {/* Timeline Grid */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-gray-700 last:border-r-0" />
            ))}
          </div>

          {/* Time Markers */}
          <div className="absolute top-0 left-0 right-0 flex justify-between px-2 text-xs text-gray-500 pointer-events-none">
            {Array.from({ length: 11 }).map((_, i) => {
              const time = timelineStart + ((totalDuration / 10) * i)
              return <span key={i}>{formatTimeSimple(time)}</span>
            })}
          </div>

          {/* Extendable Area Indicators */}
          <div className="absolute inset-0 top-6 pointer-events-none">
            {/* Before area */}
            {timelineStart > 0 && (
              <div
                className="absolute h-full bg-gray-700 bg-opacity-30 border-l-2 border-dashed border-gray-600"
                style={{
                  left: '0%',
                  width: `${Math.min(10, ((timelineStart - extendableStart) / totalDuration) * 100)}%`
                }}
              >
                <span className="text-xs text-gray-500 p-1">← Extend</span>
              </div>
            )}
            {/* After area */}
            <div
              className="absolute h-full bg-gray-700 bg-opacity-30 border-r-2 border-dashed border-gray-600"
              style={{
                right: '0%',
                width: `${Math.min(10, ((extendableEnd - timelineEnd) / totalDuration) * 100)}%`
              }}
            >
              <span className="text-xs text-gray-500 p-1 float-right">Extend →</span>
            </div>
          </div>

          {/* Sections */}
          <div className="absolute inset-0 top-6 flex items-stretch">
            {sections.map((section, index) => {
              const left = getPositionPercentage(section.startTime)
              const width = (section.duration / totalDuration) * 100
              const isSelected = selectedSection === section.id

              return (
                <div
                  key={section.id}
                  className={`absolute h-full transition-all ${
                    isSelected ? 'z-10' : 'z-0'
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`
                  }}
                >
                  {/* Section Block */}
                  <div
                    className={`h-full rounded border-2 transition-all ${
                      isSelected
                        ? 'border-yellow-400 shadow-lg'
                        : 'border-transparent hover:border-gray-600'
                    }`}
                    style={{ backgroundColor: section.color }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSectionClick(section.id)
                    }}
                  >
                    {/* Section Label */}
                    <div className="p-2 h-full flex flex-col justify-between relative">
                      {/* Playback Order Badge */}
                      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-white text-gray-900 flex items-center justify-center text-xs font-bold shadow-lg z-10">
                        {index + 1}
                      </div>
                      <div className="text-xs font-semibold text-white truncate">
                        {section.label}
                      </div>
                      <div className="text-xs text-white opacity-75">
                        {section.duration.toFixed(1)}s
                      </div>
                    </div>

                    {/* Start Handle */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 bg-white opacity-0 hover:opacity-100 cursor-ew-resize transition-opacity"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        handleDragStart(section.id, 'start')
                      }}
                    >
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded" />
                    </div>

                    {/* End Handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 bg-white opacity-0 hover:opacity-100 cursor-ew-resize transition-opacity"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        handleDragStart(section.id, 'end')
                      }}
                    >
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded" />
                    </div>
                  </div>

                  {/* Gap Indicator */}
                  {index < sections.length - 1 && sections[index + 1].startTime > section.endTime && (
                    <div
                      className="absolute top-0 bottom-0 bg-red-500 opacity-50"
                      style={{
                        left: '100%',
                        width: `${((sections[index + 1].startTime - section.endTime) / totalDuration) * 100}%`
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: `${playheadPosition}%` }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
          </div>
        </div>

        {/* Split Menu */}
        {showSplitMenu && selectedSection && (
          <div className="mt-3 bg-gray-900 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">
                Selected: {sections.find(s => s.id === selectedSection)?.label}
              </span>
              <button
                onClick={() => {
                  setShowSplitMenu(false)
                  setSelectedSection(null)
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSplit}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Split at Playhead
              </button>
              {sections.length > 1 && (
                <button
                  onClick={handleDeleteSection}
                  className="px-3 py-2 bg-red-900 bg-opacity-30 hover:bg-opacity-50 text-red-400 text-sm rounded transition"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sections List */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-300">Playback Order</h4>
          {sections.length > 1 && (
            <button
              onClick={resetToChronologicalOrder}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Reset Order
            </button>
          )}
        </div>
        <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded p-2 mb-3 text-xs text-blue-300">
          💡 <strong>Drag</strong> sections to reorder • Video plays in this order
        </div>
        <div className="space-y-2">
          {sections.map((section, index) => (
            <div
              key={section.id}
              draggable={sections.length > 1}
              onDragStart={(e) => handleDragSectionStart(e, section.id)}
              onDragOver={(e) => handleDragSectionOver(e, index)}
              onDrop={(e) => handleDragSectionDrop(e, index)}
              onDragEnd={handleDragSectionEnd}
              className={`flex items-center gap-3 p-3 rounded transition ${
                draggedSection === section.id
                  ? 'opacity-50 cursor-grabbing'
                  : sections.length > 1
                  ? 'cursor-grab'
                  : 'cursor-pointer'
              } ${
                selectedSection === section.id
                  ? 'bg-gray-700 border-2 border-yellow-400'
                  : dragOverIndex === index && draggedSection !== section.id
                  ? 'bg-gray-700 border-2 border-blue-500 border-dashed'
                  : 'bg-gray-900 hover:bg-gray-700 border-2 border-transparent'
              }`}
              onClick={() => !draggedSection && handleSectionClick(section.id)}
            >
              {/* Drag Handle */}
              {sections.length > 1 && (
                <div className="flex flex-col gap-0.5 text-gray-500">
                  <div className="w-3 h-0.5 bg-current rounded" />
                  <div className="w-3 h-0.5 bg-current rounded" />
                  <div className="w-3 h-0.5 bg-current rounded" />
                </div>
              )}

              {/* Order Number */}
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-white text-xs font-bold">
                {index + 1}
              </div>

              {/* Color Indicator */}
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: section.color }}
              />

              {/* Section Info */}
              <div className="flex-1">
                <div className="text-sm font-medium text-white">{section.label}</div>
                <div className="text-xs text-gray-400">
                  {formatTime(section.startTime)} - {formatTime(section.endTime)} ({section.duration.toFixed(1)}s)
                </div>
              </div>

              {/* Jump Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSeek(section.startTime)
                }}
                className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-gray-800 transition"
              >
                Jump →
              </button>
            </div>
          ))}
        </div>
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

function formatTimeSimple(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  return `${secs}s`
}
