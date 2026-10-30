import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface SearchResult {
  title: string
  link: string
  snippet: string
}

// Extract key topics/entities from transcript for trend search
async function extractTopics(transcript: string): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini-2025-08-07',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at identifying key topics, people, companies, and events from video transcripts. Extract the MAIN topics being discussed - not generic terms.'
        },
        {
          role: 'user',
          content: `Extract 2-4 SPECIFIC topics, names, brands, or events from this transcript that would be good for finding related recent news. Focus on:
- Person names (e.g., "Elon Musk", "Sneako", "MoistCritikal")
- Company/brand names (e.g., "YouTube", "Google", "Ozempic")
- Specific events (e.g., "YouTube unbanning", "creator reinstatement")
- Current controversies or news topics

Look for names that are mentioned multiple times or are central to the story.
If someone says "I was banned from YouTube" - extract both their name (if mentioned) and "YouTube ban".
DO NOT include generic terms like "technology", "business", "politics".

Return as JSON: {"topics": ["specific topic 1", "specific topic 2"]}

Transcript excerpt: ${transcript.substring(0, 2000)}`
        }
      ],
      response_format: { type: 'json_object' }
    })

    const result = JSON.parse(response.choices[0].message.content || '{"topics":[]}')
    return result.topics || []
  } catch (error) {
    console.error('Topic extraction error:', error)
    return []
  }
}

// Search Google for recent news about topics
async function searchRecentNews(topics: string[]): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

  if (!apiKey || !searchEngineId || searchEngineId === 'YOUR_SEARCH_ENGINE_ID_HERE') {
    console.log('⚠️ Google Search not configured - skipping trend detection')
    return []
  }

  // Skip if no topics found
  if (!topics || topics.length === 0) {
    console.log('⚠️ No specific topics found to search')
    return []
  }

  try {
    const query = topics.join(' OR ')
    const url = `https://customsearch.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&dateRestrict=d7&num=10`

    console.log('🔍 Searching Google for recent news about:', topics.join(', '))

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`)
    }

    const data = await response.json()
    const results: SearchResult[] = (data.items || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }))

    console.log(`✅ Found ${results.length} recent articles`)
    return results
  } catch (error) {
    console.error('Google Search error:', error)
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json()

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      )
    }

    console.log('\n========================================')
    console.log('📝 TRANSCRIPT RECEIVED')
    console.log('========================================')
    console.log('Length:', transcript.length, 'characters')
    console.log('Preview:', transcript.substring(0, 200) + '...')
    console.log('========================================\n')

    // Step 1: Extract SPECIFIC topics for trend search
    console.log('🔎 Extracting specific topics for trend detection...')
    const topics = await extractTopics(transcript)
    console.log('Topics found:', topics)

    // Step 2: Search for recent news about these SPECIFIC topics (last 7 days)
    const newsResults = await searchRecentNews(topics)

    // Step 3: Create enhanced prompt with OpusClip-style scoring
    const newsContext = newsResults.length > 0
      ? `\n\nRECENT NEWS ARTICLES (for trend scoring):\n${newsResults.map((article, i) =>
          `[${i + 1}] ${article.title}\n   ${article.snippet}\n   Source: ${article.link}`
        ).join('\n\n')}`
      : ''

    const prompt = `You are an expert video editor specializing in viral social media content. Your task is to analyze a video transcript and identify the 3-5 most viral-worthy moments.

CRITICAL REQUIREMENTS:
1. ONLY select clips with SUBSTANTIVE SPOKEN CONTENT
2. AVOID sections that are just music, b-roll footage, or silence
3. Each clip MUST contain meaningful dialogue, statements, or narration
4. Focus on sections with HIGH WORD DENSITY (lots of actual speech)
5. Prioritize moments where the speaker makes important points

For each clip, provide:
1. Start time (in seconds)
2. End time (in seconds) - clips should be 15-60 seconds long
3. Four-category scoring (Hook, Flow, Value, Trend) with letter grades
4. Detailed feedback for each category
5. Citations to news articles if relevant [1], [2], etc.

CLIP SELECTION CRITERIA:
✅ MUST HAVE: Clear speech/dialogue throughout the clip
✅ MUST HAVE: Complete thoughts or statements
✅ MUST HAVE: Substantive content (not just filler words)
❌ AVOID: Music-only sections
❌ AVOID: B-roll with no narration
❌ AVOID: Silence or minimal speech
❌ AVOID: Intro/outro music sequences

SCORING CATEGORIES:

**Hook** (Grade + Feedback):
- Does the SPOKEN CONTENT grab attention in first 3 seconds?
- Is there a strong opening statement or question?
- Suggestion for improvement

**Flow** (Grade + Feedback):
- Does the speech flow naturally?
- Is there a clear point being made?
- Suggestion for enhancement

**Value** (Grade + Feedback):
- Does the CONTENT provide insights/entertainment?
- Will viewers learn something or be entertained?
- Suggestion for more value

**Trend** (Grade + Feedback):
- Does it relate to current trending topics?
- Is it timely and relevant to recent news?
- Citations: Reference articles [1], [2] if applicable${newsContext}

IMPORTANT: Analyze the WORD DENSITY - if a section has very few words or long pauses, it's likely b-roll or music. Skip those sections!

Return as JSON:
{
  "clips": [
    {
      "startTime": 0,
      "endTime": 30,
      "description": "Speaker discusses [specific topic with actual quotes]",
      "wordCount": 150,  // Approximate words in this clip
      "contentType": "dialogue",  // dialogue, narration, interview, monologue
      "scoring": {
        "hook": {
          "grade": "A-",
          "feedback": "Strong opening with '[actual quote]'... Suggestion: ..."
        },
        "flow": {
          "grade": "A",
          "feedback": "Clear narrative about [topic]... Suggestion: ..."
        },
        "value": {
          "grade": "B+",
          "feedback": "Provides insights on [specific topic]... Suggestion: ..."
        },
        "trend": {
          "grade": "A",
          "feedback": "Directly relates to [trending topic] [1, 2]... Suggestion: ..."
        }
      },
      "overallScore": 8.5
    }
  ]
}

Here is the FULL transcript to analyze:

${transcript}

REMEMBER: Only select clips with ACTUAL SPOKEN CONTENT. Skip any music/b-roll sections. Include approximate word count and content type for each clip.`

    console.log('\n========================================')
    console.log('🤖 SENDING TO GPT-5-mini')
    console.log('========================================')
    console.log('Model: gpt-5-mini-2025-08-07')
    console.log('Topics for trend search:', topics.join(', '))
    console.log('News articles found:', newsResults.length)
    console.log('Prompt emphasizes: SPEECH CONTENT ONLY (no music/b-roll)')
    console.log('Full Prompt Length:', prompt.length, 'characters')
    console.log('========================================\n')

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini-2025-08-07',
      messages: [
        {
          role: 'system',
          content:
            'You are a video editing expert who ONLY selects clips with substantial spoken content. Never select music-only or b-roll sections. Focus on moments with actual dialogue or narration.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const responseText = completion.choices[0].message.content
    if (!responseText) {
      throw new Error('No response from OpenAI')
    }

    console.log('\n========================================')
    console.log('✅ GPT-5-mini RESPONSE RECEIVED')
    console.log('========================================')
    console.log('Tokens used:', completion.usage?.total_tokens || 'unknown')
    console.log('\n--- RESPONSE START ---')
    console.log(responseText)
    console.log('--- RESPONSE END ---\n')
    console.log('========================================\n')

    const analysis = JSON.parse(responseText)

    // Add news sources to response for frontend display
    if (newsResults.length > 0) {
      analysis.newsSources = newsResults
    }

    // Filter out any clips that might still be music/b-roll based on word count
    if (analysis.clips) {
      analysis.clips = analysis.clips.filter((clip: any) => {
        // If word count is provided and too low, skip
        if (clip.wordCount && clip.wordCount < 30) {
          console.log(`⚠️ Filtering out Clip at ${clip.startTime}s - too few words (${clip.wordCount})`)
          return false
        }
        // If content type indicates non-speech, skip
        if (clip.contentType === 'music' || clip.contentType === 'b-roll') {
          console.log(`⚠️ Filtering out Clip at ${clip.startTime}s - ${clip.contentType} content`)
          return false
        }
        return true
      })
    }

    console.log('\n========================================')
    console.log('🎬 CLIPS FOUND (SPEECH CONTENT ONLY)')
    console.log('========================================')
    console.log('Number of clips:', analysis.clips?.length || 0)
    analysis.clips?.forEach((clip: any, index: number) => {
      console.log(`\nClip ${index + 1}:`)
      console.log('  Time:', clip.startTime + 's -', clip.endTime + 's')
      console.log('  Duration:', (clip.endTime - clip.startTime) + 's')
      console.log('  Word Count:', clip.wordCount || 'N/A')
      console.log('  Content Type:', clip.contentType || 'dialogue')
      console.log('  Overall Score:', clip.overallScore + '/10')
      console.log('  Description:', clip.description)
      if (clip.scoring) {
        console.log('  Scoring:')
        console.log('    Hook:', clip.scoring.hook?.grade)
        console.log('    Flow:', clip.scoring.flow?.grade)
        console.log('    Value:', clip.scoring.value?.grade)
        console.log('    Trend:', clip.scoring.trend?.grade)
      }
    })
    console.log('========================================\n')

    return NextResponse.json(analysis)
  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze transcript', details: error.message },
      { status: 500 }
    )
  }
}

export const maxDuration = 60 // 1 minute timeout