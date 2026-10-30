/**
 * FONT CONFIGURATION SYSTEM
 *
 * Extensible font system that supports:
 * - System fonts (always available)
 * - Google Fonts (loaded on demand)
 * - Custom fonts (user-uploaded, stored in localStorage)
 *
 * Architecture:
 * - Fonts are defined as configuration objects
 * - Google Fonts are loaded via next/font or link tags
 * - Custom fonts can be added via URL or base64
 */

export interface CaptionFont {
  id: string
  name: string
  family: string           // CSS font-family value
  weights: number[]        // Available weights
  category: 'system' | 'google' | 'custom'
  googleName?: string      // Google Fonts name for loading
  previewWeight?: number   // Weight to use in font picker preview
}

// System fonts - always available, no loading needed
export const SYSTEM_FONTS: CaptionFont[] = [
  {
    id: 'arial-black',
    name: 'Arial Black',
    family: '"Arial Black", "Arial Bold", Gadget, sans-serif',
    weights: [900],
    category: 'system',
    previewWeight: 900,
  },
  {
    id: 'impact',
    name: 'Impact',
    family: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    weights: [400],
    category: 'system',
    previewWeight: 400,
  },
  {
    id: 'arial',
    name: 'Arial',
    family: 'Arial, Helvetica, sans-serif',
    weights: [400, 700],
    category: 'system',
    previewWeight: 700,
  },
  {
    id: 'georgia',
    name: 'Georgia',
    family: 'Georgia, "Times New Roman", serif',
    weights: [400, 700],
    category: 'system',
    previewWeight: 700,
  },
]

// Google Fonts - loaded on demand
export const GOOGLE_FONTS: CaptionFont[] = [
  {
    id: 'roboto',
    name: 'Roboto',
    family: '"Roboto", sans-serif',
    weights: [400, 500, 700, 900],
    category: 'google',
    googleName: 'Roboto',
    previewWeight: 700,
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    family: '"Montserrat", sans-serif',
    weights: [400, 500, 600, 700, 800, 900],
    category: 'google',
    googleName: 'Montserrat',
    previewWeight: 800,
  },
  {
    id: 'oswald',
    name: 'Oswald',
    family: '"Oswald", sans-serif',
    weights: [400, 500, 600, 700],
    category: 'google',
    googleName: 'Oswald',
    previewWeight: 700,
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    family: '"Bebas Neue", sans-serif',
    weights: [400],
    category: 'google',
    googleName: 'Bebas+Neue',
    previewWeight: 400,
  },
  {
    id: 'anton',
    name: 'Anton',
    family: '"Anton", sans-serif',
    weights: [400],
    category: 'google',
    googleName: 'Anton',
    previewWeight: 400,
  },
  {
    id: 'bangers',
    name: 'Bangers',
    family: '"Bangers", cursive',
    weights: [400],
    category: 'google',
    googleName: 'Bangers',
    previewWeight: 400,
  },
  {
    id: 'permanent-marker',
    name: 'Permanent Marker',
    family: '"Permanent Marker", cursive',
    weights: [400],
    category: 'google',
    googleName: 'Permanent+Marker',
    previewWeight: 400,
  },
  {
    id: 'black-ops-one',
    name: 'Black Ops One',
    family: '"Black Ops One", cursive',
    weights: [400],
    category: 'google',
    googleName: 'Black+Ops+One',
    previewWeight: 400,
  },
  {
    id: 'russo-one',
    name: 'Russo One',
    family: '"Russo One", sans-serif',
    weights: [400],
    category: 'google',
    googleName: 'Russo+One',
    previewWeight: 400,
  },
  {
    id: 'teko',
    name: 'Teko',
    family: '"Teko", sans-serif',
    weights: [300, 400, 500, 600, 700],
    category: 'google',
    googleName: 'Teko',
    previewWeight: 600,
  },
  {
    id: 'poppins',
    name: 'Poppins',
    family: '"Poppins", sans-serif',
    weights: [400, 500, 600, 700, 800, 900],
    category: 'google',
    googleName: 'Poppins',
    previewWeight: 700,
  },
  {
    id: 'luckiest-guy',
    name: 'Luckiest Guy',
    family: '"Luckiest Guy", cursive',
    weights: [400],
    category: 'google',
    googleName: 'Luckiest+Guy',
    previewWeight: 400,
  },
]

// Get all available fonts
export function getAllFonts(): CaptionFont[] {
  return [...SYSTEM_FONTS, ...GOOGLE_FONTS, ...getCustomFonts()]
}

// Get font by ID
export function getFontById(id: string): CaptionFont | undefined {
  return getAllFonts().find(f => f.id === id)
}

// Custom fonts - stored in localStorage
export function getCustomFonts(): CaptionFont[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('clipfluencer_custom_fonts') || '[]')
  } catch {
    return []
  }
}

export function addCustomFont(font: Omit<CaptionFont, 'category'>): void {
  const customFonts = getCustomFonts()
  const newFont: CaptionFont = { ...font, category: 'custom' }
  customFonts.push(newFont)
  localStorage.setItem('clipfluencer_custom_fonts', JSON.stringify(customFonts))
}

export function removeCustomFont(id: string): void {
  const customFonts = getCustomFonts().filter(f => f.id !== id)
  localStorage.setItem('clipfluencer_custom_fonts', JSON.stringify(customFonts))
}

// Generate Google Fonts URL for loading
export function getGoogleFontsUrl(fontIds: string[]): string {
  const googleFonts = fontIds
    .map(id => GOOGLE_FONTS.find(f => f.id === id))
    .filter((f): f is CaptionFont => f !== undefined)

  if (googleFonts.length === 0) return ''

  const families = googleFonts.map(font => {
    const weights = font.weights.join(';')
    return `family=${font.googleName}:wght@${weights}`
  })

  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

// Load Google Fonts dynamically
export function loadGoogleFonts(fontIds: string[]): void {
  if (typeof window === 'undefined') return

  const url = getGoogleFontsUrl(fontIds)
  if (!url) return

  // Check if already loaded
  const existingLink = document.querySelector(`link[href="${url}"]`)
  if (existingLink) return

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}

// Load all Google Fonts at once (for font picker)
export function loadAllGoogleFonts(): void {
  loadGoogleFonts(GOOGLE_FONTS.map(f => f.id))
}
