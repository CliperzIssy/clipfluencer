'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import ClipEditor from '@/components/ClipEditor'

export default function EditorPage() {
  const params = useParams()
  const clipId = params.clipId as string

  const [clipData, setClipData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function loadClipData() {
      try {
        console.log('📖 Loading clip from localStorage:', clipId)

        // Get clip from localStorage
        const clipJson = localStorage.getItem(`clip_${clipId}`)

        if (!clipJson) {
          throw new Error('Clip not found in storage')
        }

        const data = JSON.parse(clipJson)
        console.log('✅ Clip loaded successfully:', data)

        setClipData(data)
      } catch (err: any) {
        console.error('❌ Error loading clip:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (clipId) {
      loadClipData()
    }
  }, [clipId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading clip editor...</p>
        </div>
      </div>
    )
  }

  if (error || !clipData) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <p className="text-gray-400">{error || 'Clip not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <ClipEditor clip={clipData} />
    </div>
  )
}
