import { NextRequest, NextResponse } from 'next/server'

// Store clips in a global Map with persistence helper
// In production, you'd use a database like PostgreSQL or MongoDB
const clipsStore = new Map<string, any>()

// Helper to get store key for browser-side persistence
function getStoreKey() {
  return 'clipfluencer_clips_store'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  try {
    // Await params in Next.js 15+
    const { clipId } = await params

    console.log('🔍 Fetching clip:', clipId)
    console.log('   Store size:', clipsStore.size)
    console.log('   Available clips:', Array.from(clipsStore.keys()))

    // Try to get clip from store
    const clip = clipsStore.get(clipId)

    if (!clip) {
      console.error('❌ Clip not found:', clipId)
      return NextResponse.json(
        { error: 'Clip not found' },
        { status: 404 }
      )
    }

    console.log('✅ Clip found and returning data')
    return NextResponse.json(clip)
  } catch (error: any) {
    console.error('❌ Error fetching clip:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clip data' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const clip = await request.json()

    // Generate a clip ID if not provided
    const clipId = clip.clipId || `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    console.log('📦 Storing clip data:', clipId)
    console.log('   Clip type:', clip.clipType)
    console.log('   Video path:', clip.videoPath)
    console.log('   Start time:', clip.startTime)
    console.log('   End time:', clip.endTime)

    // Store clip data
    clipsStore.set(clipId, { ...clip, clipId })

    console.log('✅ Clip stored successfully')
    console.log('   Total clips in store:', clipsStore.size)

    return NextResponse.json({ clipId, success: true })
  } catch (error: any) {
    console.error('❌ Error storing clip:', error)
    return NextResponse.json(
      { error: 'Failed to store clip data' },
      { status: 500 }
    )
  }
}

// Helper function to clear old clips (call this periodically or on server restart)
export function clearClipsStore() {
  clipsStore.clear()
}
