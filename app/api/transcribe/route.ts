import { NextRequest, NextResponse } from 'next/server'
import { join } from 'path'
import { AssemblyAI } from 'assemblyai'
import ffmpeg from 'fluent-ffmpeg'
import { existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { calculateAssemblyAICost } from '../utils/pricing'

// Set ffmpeg path - only for local Mac development
// On Railway/Linux, fluent-ffmpeg will auto-detect the system ffmpeg
if (process.platform === 'darwin' && existsSync('/opt/homebrew/bin/ffmpeg')) {
  ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg')
}

const client = new AssemblyAI({
  apiKey: '2bc79e97b0144215a207d57e8288134a',
})

export async function POST(request: NextRequest) {
  try {
    const { videoPath } = await request.json()

    if (!videoPath) {
      return NextResponse.json(
        { error: 'No video path provided' },
        { status: 400 }
      )
    }

    // Check if videoPath is an R2 URL or local path
    const isR2Url = videoPath.startsWith('https://pub-') || videoPath.startsWith('http')
    let audioSource: string

    if (isR2Url) {
      // Use R2 URL directly - AssemblyAI can transcribe from URLs
      console.log('\n========================================')
      console.log('🎤 TRANSCRIBING WITH ASSEMBLYAI (from R2 URL)')
      console.log('========================================')
      console.log('Video URL:', videoPath)
      console.log('Features enabled:')
      console.log('  ✓ High Accuracy Transcription')
      console.log('  ✓ Speaker Diarization')
      console.log('  ✓ Word-Level Timestamps (for karaoke-style captions)')
      console.log('  ✓ Sentiment Analysis')
      console.log('  ✓ Entity Detection')
      console.log('  ✓ Topic Detection (IAB Categories)')
      console.log('  ✓ Key Phrase Detection (Auto Highlights)')
      console.log('  ✓ Summarization')
      console.log('  ✓ Automatic Language Detection')
      console.log('========================================\n')

      // Use video URL directly - AssemblyAI will extract audio
      audioSource = videoPath
    } else {
      // Local file path (legacy support)
      const videoFilename = videoPath.split('/').pop()
      const videoFullPath = join(process.cwd(), 'public', 'uploads', videoFilename)

      if (!existsSync(videoFullPath)) {
        return NextResponse.json({ error: 'Video file not found' }, { status: 404 })
      }

      // Extract audio from video
      const audioPath = videoFullPath.replace(/\.[^/.]+$/, '.mp3')

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoFullPath)
          .noVideo()
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .output(audioPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      console.log('\n========================================')
      console.log('🎤 TRANSCRIBING WITH ASSEMBLYAI (from local file)')
      console.log('========================================')
      console.log('Audio file:', audioPath)
      console.log('Features enabled:')
      console.log('  ✓ High Accuracy Transcription')
      console.log('  ✓ Speaker Diarization')
      console.log('  ✓ Word-Level Timestamps (for karaoke-style captions)')
      console.log('  ✓ Sentiment Analysis')
      console.log('  ✓ Entity Detection')
      console.log('  ✓ Topic Detection (IAB Categories)')
      console.log('  ✓ Key Phrase Detection (Auto Highlights)')
      console.log('  ✓ Summarization')
      console.log('  ✓ Automatic Language Detection')
      console.log('========================================\n')

      audioSource = audioPath
    }

    const transcribeStartTime = Date.now()

    // Upload and transcribe with all features enabled
    const transcript = await client.transcripts.transcribe({
      audio: audioSource,
      // Speech-to-Text features
      speaker_labels: true,              // Speaker diarization
      language_detection: true,          // Auto language detection

      // Audio Intelligence features
      sentiment_analysis: true,          // Sentiment analysis
      entity_detection: true,            // Entity detection
      iab_categories: true,              // Topic detection
      auto_highlights: true,             // Key phrase detection
      summarization: true,               // Summarization
      summary_model: 'informative',      // Summary type
      summary_type: 'bullets',           // Bullet point summary
    })

    const transcribeTime = ((Date.now() - transcribeStartTime) / 1000).toFixed(2)

    // Clean up audio file (only for local files, not R2 URLs)
    if (!isR2Url) {
      try {
        const { existsSync } = await import('fs')
        const audioPath = audioSource as string
        if (existsSync(audioPath)) {
          await unlink(audioPath)
          console.log('✅ Cleaned up audio file:', audioPath)
        }
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up audio file:', audioSource, cleanupError)
        // Don't fail the whole request if cleanup fails
      }
    }

    // Check if transcription was successful
    if (transcript.status === 'error') {
      throw new Error(transcript.error || 'Transcription failed')
    }

    // Extract words with speaker labels for karaoke-style captions
    const words = transcript.words || []

    // Create segments from utterances (which include speaker info)
    const segments = transcript.utterances?.map(utterance => ({
      start: utterance.start / 1000, // Convert ms to seconds
      end: utterance.end / 1000,
      text: utterance.text,
      speaker: utterance.speaker,
      confidence: utterance.confidence,
    })) || []

    console.log('\n========================================')
    console.log('✅ TRANSCRIPTION COMPLETE')
    console.log('========================================')
    console.log('Processing time:', transcribeTime + 's')
    console.log('Text length:', transcript.text?.length || 0, 'characters')
    console.log('Total words:', words.length)
    console.log('Total segments:', segments.length)
    console.log('Language detected:', transcript.language_code)
    console.log('Confidence:', transcript.confidence?.toFixed(2) || 'N/A')

    // Calculate AssemblyAI cost
    const audioDurationSeconds = transcript.audio_duration || 0
    const assemblyAICost = calculateAssemblyAICost(audioDurationSeconds)

    console.log('\n💰 AssemblyAI API Cost:')
    console.log('  ', assemblyAICost.breakdown)
    console.log('  Estimated cost: $' + assemblyAICost.cost.toFixed(4))

    console.log('\n--- FULL TRANSCRIPT START ---')
    console.log(transcript.text)
    console.log('--- FULL TRANSCRIPT END ---')

    // Display Speaker Diarization
    if (segments.length > 0) {
      console.log('\n👥 Speaker Diarization (First 5 segments):')
      segments.slice(0, 5).forEach((seg: any, i: number) => {
        console.log(`  ${i + 1}. [${seg.speaker}] [${seg.start?.toFixed(2)}s - ${seg.end?.toFixed(2)}s]: ${seg.text.substring(0, 100)}${seg.text.length > 100 ? '...' : ''}`)
      })
    }

    if (words.length > 0) {
      console.log('\n📝 Word-Level Timestamps (First 5 words):')
      words.slice(0, 5).forEach((w: any, i: number) => {
        console.log(`  ${i + 1}. "${w.text}" [${w.speaker || 'N/A'}] at ${(w.start / 1000).toFixed(2)}s - ${(w.end / 1000).toFixed(2)}s (confidence: ${w.confidence?.toFixed(2)})`)
      })
    }

    // Display Sentiment Analysis
    if (transcript.sentiment_analysis_results && transcript.sentiment_analysis_results.length > 0) {
      console.log('\n😊 Sentiment Analysis (First 5 sentences):')
      transcript.sentiment_analysis_results.slice(0, 5).forEach((sentiment: any, i: number) => {
        console.log(`  ${i + 1}. [${sentiment.sentiment.toUpperCase()}] ${sentiment.text.substring(0, 80)}${sentiment.text.length > 80 ? '...' : ''}`)
      })
    }

    // Display Entity Detection
    if (transcript.entities && transcript.entities.length > 0) {
      console.log('\n🏷️  Entity Detection (First 10 entities):')
      transcript.entities.slice(0, 10).forEach((entity: any, i: number) => {
        console.log(`  ${i + 1}. ${entity.text} (${entity.entity_type})`)
      })
    }

    // Display Topics
    if (transcript.iab_categories_result?.summary && Object.keys(transcript.iab_categories_result.summary).length > 0) {
      console.log('\n📚 Topics Detected (Top 5):')
      const topics = Object.entries(transcript.iab_categories_result.summary)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
      topics.forEach(([topic, relevance]: [string, any], i: number) => {
        console.log(`  ${i + 1}. ${topic} (relevance: ${(relevance * 100).toFixed(1)}%)`)
      })
    }

    // Display Key Phrases
    if (transcript.auto_highlights_result?.results && transcript.auto_highlights_result.results.length > 0) {
      console.log('\n⭐ Key Phrases (Top 10):')
      transcript.auto_highlights_result.results.slice(0, 10).forEach((highlight: any, i: number) => {
        console.log(`  ${i + 1}. "${highlight.text}" (count: ${highlight.count}, rank: ${highlight.rank?.toFixed(2) || 'N/A'})`)
      })
    }

    // Display Summary
    if (transcript.summary) {
      console.log('\n📋 Summary:')
      console.log(transcript.summary)
    }

    console.log('========================================\n')

    return NextResponse.json({
      text: transcript.text,
      segments: segments,
      words: words.map(w => ({
        word: w.text,
        start: w.start / 1000, // Convert ms to seconds
        end: w.end / 1000,
        confidence: w.confidence,
        speaker: w.speaker,
      })),
      // Audio Intelligence results
      sentiment_analysis: transcript.sentiment_analysis_results,
      entities: transcript.entities,
      topics: transcript.iab_categories_result,
      key_phrases: transcript.auto_highlights_result,
      summary: transcript.summary,
      language: {
        code: transcript.language_code,
        confidence: transcript.language_confidence,
      },
      metadata: {
        model: 'AssemblyAI',
        processingTimeSeconds: parseFloat(transcribeTime),
        audioDurationSeconds: audioDurationSeconds,
        audioDurationMinutes: parseFloat((audioDurationSeconds / 60).toFixed(2)),
        estimatedCostUSD: parseFloat(assemblyAICost.cost.toFixed(4)),
        costBreakdown: assemblyAICost.breakdown,
        confidence: transcript.confidence,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: 'Failed to transcribe video', details: error.message },
      { status: 500 }
    )
  }
}

export const maxDuration = 300 // 5 minutes timeout (Vercel hobby plan limit)
