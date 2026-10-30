/**
 * CAPTION STYLE CONFIGURATION
 *
 * Comprehensive styling options for video captions.
 * Designed to be serializable (for saving) and extensible (for future features).
 */

export interface CaptionStyle {
  // Font settings
  fontId: string              // References font from lib/fonts.ts
  fontSize: number            // Base size in pixels (will be responsive)
  fontWeight: number          // 400, 500, 600, 700, 800, 900
  letterSpacing: number       // In pixels
  uppercase: boolean

  // Colors
  primaryColor: string        // Current/active word color (hex)
  secondaryColor: string      // Upcoming/inactive word color (hex)

  // Stroke/outline
  strokeEnabled: boolean
  strokeColor: string         // Hex color
  strokeWidth: number         // In pixels

  // Shadow
  shadowEnabled: boolean
  shadowColor: string         // Hex color with alpha
  shadowX: number             // X offset in pixels
  shadowY: number             // Y offset in pixels
  shadowBlur: number          // Blur radius in pixels
}

// Default caption styles (presets)
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontId: 'arial-black',
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: 0.5,
  uppercase: true,

  primaryColor: '#FFFF00',     // Yellow for current word
  secondaryColor: '#FFFFFF',   // White for upcoming

  strokeEnabled: true,
  strokeColor: '#000000',
  strokeWidth: 2,

  shadowEnabled: true,
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowX: 2,
  shadowY: 2,
  shadowBlur: 4,
}

// Preset styles that users can choose from
export interface CaptionPreset {
  id: string
  name: string
  style: CaptionStyle
  preview?: string  // Preview text or image
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'bold-yellow',
    name: 'Bold Yellow',
    style: {
      fontId: 'arial-black',
      fontSize: 28,
      fontWeight: 900,
      letterSpacing: 0.5,
      uppercase: true,
      primaryColor: '#FFFF00',
      secondaryColor: '#FFFFFF',
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 2,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowX: 2,
      shadowY: 2,
      shadowBlur: 4,
    },
  },
  {
    id: 'highlight-impact',
    name: 'Highlight Impact',
    style: {
      fontId: 'impact',
      fontSize: 32,
      fontWeight: 400,
      letterSpacing: 1,
      uppercase: true,
      primaryColor: '#FFFFFF',
      secondaryColor: '#FFFF00',
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 3,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.6)',
      shadowX: 3,
      shadowY: 3,
      shadowBlur: 0,
    },
  },
  {
    id: 'minimal-white',
    name: 'Minimal White',
    style: {
      fontId: 'arial',
      fontSize: 24,
      fontWeight: 400,
      letterSpacing: 0,
      uppercase: false,
      primaryColor: '#FFFFFF',
      secondaryColor: '#CCCCCC',
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 1,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.4)',
      shadowX: 1,
      shadowY: 1,
      shadowBlur: 3,
    },
  },
  {
    id: 'neon-green',
    name: 'Neon Green',
    style: {
      fontId: 'bangers',
      fontSize: 30,
      fontWeight: 400,
      letterSpacing: 2,
      uppercase: true,
      primaryColor: '#00FF00',
      secondaryColor: '#FFFFFF',
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 3,
      shadowEnabled: true,
      shadowColor: 'rgba(0,255,0,0.5)',
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 10,
    },
  },
  {
    id: 'comic-style',
    name: 'Comic Style',
    style: {
      fontId: 'bangers',
      fontSize: 32,
      fontWeight: 400,
      letterSpacing: 1,
      uppercase: true,
      primaryColor: '#FF6B6B',
      secondaryColor: '#FFFFFF',
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 3,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.8)',
      shadowX: 4,
      shadowY: 4,
      shadowBlur: 0,
    },
  },
  {
    id: 'military',
    name: 'Military',
    style: {
      fontId: 'black-ops-one',
      fontSize: 26,
      fontWeight: 400,
      letterSpacing: 2,
      uppercase: true,
      primaryColor: '#FFD700',
      secondaryColor: '#FFFFFF',
      strokeEnabled: true,
      strokeColor: '#1a1a1a',
      strokeWidth: 2,
      shadowEnabled: true,
      shadowColor: 'rgba(0,0,0,0.7)',
      shadowX: 2,
      shadowY: 2,
      shadowBlur: 4,
    },
  },
]

// Helper to generate CSS styles from CaptionStyle
export function captionStyleToCSS(style: CaptionStyle, fontFamily: string): React.CSSProperties {
  const shadows: string[] = []

  // Add stroke as text-shadow (multiple shadows for stroke effect)
  if (style.strokeEnabled && style.strokeWidth > 0) {
    const sw = style.strokeWidth
    const sc = style.strokeColor
    // Create stroke using multiple shadows
    shadows.push(
      `${sw}px ${sw}px 0 ${sc}`,
      `-${sw}px -${sw}px 0 ${sc}`,
      `${sw}px -${sw}px 0 ${sc}`,
      `-${sw}px ${sw}px 0 ${sc}`,
    )
  }

  // Add drop shadow
  if (style.shadowEnabled) {
    shadows.push(`${style.shadowX}px ${style.shadowY}px ${style.shadowBlur}px ${style.shadowColor}`)
  }

  return {
    fontFamily,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    letterSpacing: `${style.letterSpacing}px`,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    color: style.secondaryColor,
    WebkitTextStroke: style.strokeEnabled ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
    textShadow: shadows.length > 0 ? shadows.join(', ') : undefined,
  }
}

// Helper to generate CSS for the active/current word
export function activeWordCSS(style: CaptionStyle): React.CSSProperties {
  return {
    color: style.primaryColor,
  }
}