// ========================================
// CENTRALIZED API PRICING SYSTEM
// Updates: Check pricing pages regularly
// ========================================

/**
 * OpenAI Pricing (as of January 2025)
 * Source: https://openai.com/api/pricing
 * Last updated: 2025-01-XX
 */
export const OPENAI_PRICING = {
  // GPT-5 Models
  'gpt-5-2025-08-07': {
    input: 10.00,   // per 1M tokens
    output: 30.00,  // per 1M tokens
    lastUpdated: '2025-01-01'
  },
  'gpt-5-mini-2025-08-07': {
    input: 5.00,
    output: 15.00,
    lastUpdated: '2025-01-01'
  },

  // GPT-4 Models
  'gpt-4o': {
    input: 5.00,
    output: 15.00,
    lastUpdated: '2024-08-01'
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60,
    lastUpdated: '2024-07-01'
  },
  'gpt-4-turbo': {
    input: 10.00,
    output: 30.00,
    lastUpdated: '2024-04-01'
  },

  // Whisper
  'whisper-1': {
    type: 'per-minute',
    cost: 0.006,  // per minute
    lastUpdated: '2023-03-01'
  }
} as const

/**
 * AssemblyAI Pricing (as of January 2025)
 * Source: https://www.assemblyai.com/pricing
 * Last updated: 2025-01-XX
 */
export const ASSEMBLYAI_PRICING = {
  'core': {
    type: 'per-hour',
    cost: 0.65,  // per hour for core transcription
    lastUpdated: '2025-01-01'
  },
  'speaker-diarization': {
    type: 'per-hour',
    cost: 0.10,  // additional per hour
    lastUpdated: '2025-01-01'
  },
  'sentiment-analysis': {
    type: 'per-hour',
    cost: 0.025,  // additional per hour
    lastUpdated: '2025-01-01'
  },
  'entity-detection': {
    type: 'per-hour',
    cost: 0.035,  // additional per hour
    lastUpdated: '2025-01-01'
  },
  'topic-detection': {
    type: 'per-hour',
    cost: 0.04,  // additional per hour
    lastUpdated: '2025-01-01'
  },
  'auto-highlights': {
    type: 'per-hour',
    cost: 0.04,  // additional per hour
    lastUpdated: '2025-01-01'
  },
  'summarization': {
    type: 'per-hour',
    cost: 0.04,  // additional per hour
    lastUpdated: '2025-01-01'
  }
} as const

/**
 * Google Gemini Pricing (as of January 2025)
 * Source: https://ai.google.dev/pricing
 * Last updated: 2025-01-XX
 */
export const GEMINI_PRICING = {
  'gemini-2.5-pro-preview-03-25': {
    // Gemini 2.5 Pro Preview - same pricing as standard Pro
    textInput: 1.25,   // per 1M tokens
    textOutput: 5.00,  // per 1M tokens
    videoInput: 1.25,
    imageInput: 1.25,
    lastUpdated: '2025-01-01'
  },
  'gemini-2.0-pro-exp': {
    // Experimental model - currently free during preview
    textInput: 0.00,
    textOutput: 0.00,
    videoInput: 0.00,
    imageInput: 0.00,
    lastUpdated: '2025-01-01'
  },
  'gemini-2.5-pro': {
    // Same pricing as 1.5 Pro for now (subject to change)
    textInput: 1.25,
    textOutput: 5.00,
    videoInput: 1.25,
    imageInput: 1.25,
    lastUpdated: '2025-01-01'
  },
  'gemini-2.5-flash': {
    // Text tokens
    textInput: 0.075,   // per 1M tokens (up to 128K context)
    textOutput: 0.30,   // per 1M tokens
    // Video/Image tokens
    videoInput: 0.075,  // per 1M tokens
    imageInput: 0.075,  // per 1M tokens
    // Context caching
    cachedInput: 0.01875, // per 1M tokens (75% discount)
    lastUpdated: '2025-01-01'
  },
  'gemini-2.5-flash-lite': {
    // Gemini 2.5 Flash-Lite - faster, more efficient
    // Same pricing as regular 2.5 Flash
    textInput: 0.075,   // per 1M tokens (up to 128K context)
    textOutput: 0.30,   // per 1M tokens
    videoInput: 0.075,  // per 1M tokens
    imageInput: 0.075,  // per 1M tokens
    cachedInput: 0.01875, // per 1M tokens (75% discount)
    lastUpdated: '2025-01-01'
  },
  'gemini-1.5-flash': {
    textInput: 0.075,
    textOutput: 0.30,
    videoInput: 0.075,
    imageInput: 0.075,
    lastUpdated: '2024-09-01'
  },
  'gemini-1.5-pro': {
    textInput: 1.25,
    textOutput: 5.00,
    videoInput: 1.25,
    imageInput: 1.25,
    lastUpdated: '2024-09-01'
  }
} as const

/**
 * Calculate OpenAI API cost
 */
export function calculateOpenAICost(
  modelName: string,
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
): {
  inputCost: number
  outputCost: number
  totalCost: number
  model: string
  breakdown: string
} {
  const inputTokens = usage.prompt_tokens || 0
  const outputTokens = usage.completion_tokens || 0

  // Get pricing for this model
  const pricing = OPENAI_PRICING[modelName as keyof typeof OPENAI_PRICING]

  if (!pricing) {
    console.warn(`⚠️ Unknown OpenAI model: ${modelName}. Using GPT-4o pricing as fallback.`)
    const fallback = OPENAI_PRICING['gpt-4o']
    const inputCost = (inputTokens / 1_000_000) * fallback.input
    const outputCost = (outputTokens / 1_000_000) * fallback.output
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      model: modelName,
      breakdown: `${inputTokens.toLocaleString()} input + ${outputTokens.toLocaleString()} output tokens (fallback pricing)`
    }
  }

  // Check if this is a token-based pricing model (not Whisper)
  if ('input' in pricing && 'output' in pricing) {
    const inputCost = (inputTokens / 1_000_000) * pricing.input
    const outputCost = (outputTokens / 1_000_000) * pricing.output
    const totalCost = inputCost + outputCost

    return {
      inputCost,
      outputCost,
      totalCost,
      model: modelName,
      breakdown: `${inputTokens.toLocaleString()} input × $${pricing.input}/1M + ${outputTokens.toLocaleString()} output × $${pricing.output}/1M`
    }
  }

  // Fallback for non-token based models
  console.warn(`⚠️ Model ${modelName} is not token-based. Using GPT-4o pricing as fallback.`)
  const fallback = OPENAI_PRICING['gpt-4o']
  const inputCost = (inputTokens / 1_000_000) * fallback.input
  const outputCost = (outputTokens / 1_000_000) * fallback.output
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    model: modelName,
    breakdown: `${inputTokens.toLocaleString()} input + ${outputTokens.toLocaleString()} output tokens (fallback pricing)`
  }
}

/**
 * Calculate Whisper API cost
 */
export function calculateWhisperCost(
  durationSeconds: number
): {
  cost: number
  model: string
  breakdown: string
} {
  const pricing = OPENAI_PRICING['whisper-1']
  const minutes = durationSeconds / 60
  const cost = minutes * pricing.cost

  return {
    cost,
    model: 'whisper-1',
    breakdown: `${minutes.toFixed(2)} minutes × $${pricing.cost}/min`
  }
}

/**
 * Calculate AssemblyAI API cost with all features enabled
 */
export function calculateAssemblyAICost(
  durationSeconds: number
): {
  cost: number
  model: string
  breakdown: string
  features: { [key: string]: number }
} {
  const hours = durationSeconds / 3600

  // Calculate cost for each feature
  const coreCost = hours * ASSEMBLYAI_PRICING['core'].cost
  const speakerDiarizationCost = hours * ASSEMBLYAI_PRICING['speaker-diarization'].cost
  const sentimentAnalysisCost = hours * ASSEMBLYAI_PRICING['sentiment-analysis'].cost
  const entityDetectionCost = hours * ASSEMBLYAI_PRICING['entity-detection'].cost
  const topicDetectionCost = hours * ASSEMBLYAI_PRICING['topic-detection'].cost
  const autoHighlightsCost = hours * ASSEMBLYAI_PRICING['auto-highlights'].cost
  const summarizationCost = hours * ASSEMBLYAI_PRICING['summarization'].cost

  const totalCost = coreCost + speakerDiarizationCost + sentimentAnalysisCost +
                    entityDetectionCost + topicDetectionCost + autoHighlightsCost +
                    summarizationCost

  const features = {
    'Core Transcription': coreCost,
    'Speaker Diarization': speakerDiarizationCost,
    'Sentiment Analysis': sentimentAnalysisCost,
    'Entity Detection': entityDetectionCost,
    'Topic Detection': topicDetectionCost,
    'Key Phrases': autoHighlightsCost,
    'Summarization': summarizationCost,
  }

  const breakdown = `${hours.toFixed(4)} hours × ($${ASSEMBLYAI_PRICING['core'].cost} core + $${
    ASSEMBLYAI_PRICING['speaker-diarization'].cost +
    ASSEMBLYAI_PRICING['sentiment-analysis'].cost +
    ASSEMBLYAI_PRICING['entity-detection'].cost +
    ASSEMBLYAI_PRICING['topic-detection'].cost +
    ASSEMBLYAI_PRICING['auto-highlights'].cost +
    ASSEMBLYAI_PRICING['summarization'].cost
  } features)/hour`

  return {
    cost: totalCost,
    model: 'AssemblyAI with Audio Intelligence',
    breakdown,
    features
  }
}

/**
 * Calculate Gemini API cost
 */
export function calculateGeminiCost(
  modelName: string,
  usage: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  },
  inputType: 'text' | 'video' | 'image' = 'text'
): {
  inputCost: number
  outputCost: number
  totalCost: number
  model: string
  breakdown: string
} {
  const inputTokens = usage.promptTokenCount || 0
  const outputTokens = usage.candidatesTokenCount || 0

  // Get pricing for this model
  const pricing = GEMINI_PRICING[modelName as keyof typeof GEMINI_PRICING]

  if (!pricing) {
    console.warn(`⚠️ Unknown Gemini model: ${modelName}. Using gemini-1.5-flash pricing as fallback.`)
    const fallback = GEMINI_PRICING['gemini-1.5-flash']
    const inputCost = (inputTokens / 1_000_000) * fallback.textInput
    const outputCost = (outputTokens / 1_000_000) * fallback.textOutput
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      model: modelName,
      breakdown: `${inputTokens.toLocaleString()} input + ${outputTokens.toLocaleString()} output tokens (fallback pricing)`
    }
  }

  // Select appropriate input pricing based on type
  let inputPricing = pricing.textInput
  if (inputType === 'video') inputPricing = pricing.videoInput
  if (inputType === 'image') inputPricing = pricing.imageInput

  const inputCost = (inputTokens / 1_000_000) * inputPricing
  const outputCost = (outputTokens / 1_000_000) * pricing.textOutput
  const totalCost = inputCost + outputCost

  return {
    inputCost,
    outputCost,
    totalCost,
    model: modelName,
    breakdown: `${inputTokens.toLocaleString()} ${inputType} input × $${inputPricing}/1M + ${outputTokens.toLocaleString()} output × $${pricing.textOutput}/1M`
  }
}

/**
 * Cost Tracker - Accumulates costs across multiple API calls
 */
export class CostTracker {
  private costs: Array<{
    service: 'openai' | 'gemini' | 'whisper' | 'assemblyai'
    model: string
    inputCost: number
    outputCost: number
    totalCost: number
    breakdown: string
  }> = []

  addOpenAICost(modelName: string, usage: any) {
    const cost = calculateOpenAICost(modelName, usage)
    this.costs.push({
      service: 'openai',
      model: cost.model,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
      breakdown: cost.breakdown
    })
  }

  addWhisperCost(durationSeconds: number) {
    const cost = calculateWhisperCost(durationSeconds)
    this.costs.push({
      service: 'whisper',
      model: cost.model,
      inputCost: cost.cost,
      outputCost: 0,
      totalCost: cost.cost,
      breakdown: cost.breakdown
    })
  }

  addAssemblyAICost(durationSeconds: number) {
    const cost = calculateAssemblyAICost(durationSeconds)
    this.costs.push({
      service: 'assemblyai',
      model: cost.model,
      inputCost: cost.cost,
      outputCost: 0,
      totalCost: cost.cost,
      breakdown: cost.breakdown
    })
  }

  addGeminiCost(modelName: string, usage: any, inputType: 'text' | 'video' | 'image' = 'text') {
    const cost = calculateGeminiCost(modelName, usage, inputType)
    this.costs.push({
      service: 'gemini',
      model: cost.model,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
      breakdown: cost.breakdown
    })
  }

  getTotalCost(): number {
    return this.costs.reduce((sum, cost) => sum + cost.totalCost, 0)
  }

  getSummary() {
    const totalInputCost = this.costs.reduce((sum, cost) => sum + cost.inputCost, 0)
    const totalOutputCost = this.costs.reduce((sum, cost) => sum + cost.outputCost, 0)
    const totalCost = this.getTotalCost()

    return {
      totalInputCost,
      totalOutputCost,
      totalCost,
      breakdown: this.costs,
      formatted: {
        totalInputCost: `$${totalInputCost.toFixed(4)}`,
        totalOutputCost: `$${totalOutputCost.toFixed(4)}`,
        totalCost: `$${totalCost.toFixed(4)}`
      }
    }
  }

  printSummary() {
    console.log('\n========================================')
    console.log('💰 TOTAL API COSTS')
    console.log('========================================')

    this.costs.forEach((cost, i) => {
      console.log(`\n${i + 1}. ${cost.service.toUpperCase()} - ${cost.model}`)
      console.log(`   ${cost.breakdown}`)
      console.log(`   Cost: $${cost.totalCost.toFixed(4)}`)
    })

    const summary = this.getSummary()
    console.log('\n========================================')
    console.log(`Total Input Cost:  ${summary.formatted.totalInputCost}`)
    console.log(`Total Output Cost: ${summary.formatted.totalOutputCost}`)
    console.log(`TOTAL COST:        ${summary.formatted.totalCost}`)
    console.log('========================================\n')
  }
}

/**
 * Check if pricing data is outdated (older than 90 days)
 */
export function checkPricingFreshness() {
  const warningThresholdDays = 90
  const now = new Date()

  const warnings: string[] = []

  // Check OpenAI pricing
  Object.entries(OPENAI_PRICING).forEach(([model, pricing]) => {
    const lastUpdated = new Date(pricing.lastUpdated)
    const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSinceUpdate > warningThresholdDays) {
      warnings.push(`⚠️ OpenAI ${model} pricing is ${Math.floor(daysSinceUpdate)} days old`)
    }
  })

  // Check Gemini pricing
  Object.entries(GEMINI_PRICING).forEach(([model, pricing]) => {
    const lastUpdated = new Date(pricing.lastUpdated)
    const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSinceUpdate > warningThresholdDays) {
      warnings.push(`⚠️ Gemini ${model} pricing is ${Math.floor(daysSinceUpdate)} days old`)
    }
  })

  if (warnings.length > 0) {
    console.warn('\n⚠️ PRICING DATA MAY BE OUTDATED:')
    warnings.forEach(warning => console.warn(warning))
    console.warn('Please check:')
    console.warn('  - https://openai.com/api/pricing')
    console.warn('  - https://ai.google.dev/pricing\n')
  }

  return warnings
}
