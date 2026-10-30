'use client'

import { useState, useEffect } from 'react'
import { CaptionStyle, DEFAULT_CAPTION_STYLE, CAPTION_PRESETS } from '@/types/captions'
import { getAllFonts, getFontById, CaptionFont } from '@/lib/fonts'

interface CaptionStylePanelProps {
  style: CaptionStyle
  onChange: (style: CaptionStyle) => void
  onClose?: () => void
}

export default function CaptionStylePanel({ style, onChange, onClose }: CaptionStylePanelProps) {
  const [fonts, setFonts] = useState<CaptionFont[]>([])
  const [activeTab, setActiveTab] = useState<'presets' | 'font' | 'effects'>('font')
  const [showFontDropdown, setShowFontDropdown] = useState(false)

  // Load fonts on mount
  useEffect(() => {
    setFonts(getAllFonts())
  }, [])

  const currentFont = getFontById(style.fontId) || fonts[0]

  const updateStyle = (updates: Partial<CaptionStyle>) => {
    onChange({ ...style, ...updates })
  }

  // Color input component
  const ColorPicker = ({
    label,
    value,
    onChange: onColorChange
  }: {
    label: string
    value: string
    onChange: (color: string) => void
  }) => (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-400 w-20">{label}</label>
      <div className="relative">
        <input
          type="color"
          value={value.startsWith('#') ? value : '#FFFFFF'}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-600 bg-transparent"
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onColorChange(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono"
      />
    </div>
  )

  // Slider component
  const Slider = ({
    label,
    value,
    min,
    max,
    step = 1,
    unit = '',
    onChange: onSliderChange,
  }: {
    label: string
    value: number
    min: number
    max: number
    step?: number
    unit?: string
    onChange: (value: number) => void
  }) => (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs text-white font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onSliderChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  )

  // Toggle component
  const Toggle = ({
    label,
    checked,
    onChange: onToggleChange,
  }: {
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
  }) => (
    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-400">{label}</label>
      <button
        onClick={() => onToggleChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-700'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )

  return (
    <div className="bg-gray-900 border-l border-gray-800 h-full flex flex-col" style={{ width: '300px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-black">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <span className="text-sm font-medium text-white">Caption Style</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {(['presets', 'font', 'effects'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Presets Tab */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Quick styles to get started</p>
            <div className="grid grid-cols-2 gap-2">
              {CAPTION_PRESETS.map((preset) => {
                const presetFont = getFontById(preset.style.fontId)
                return (
                  <button
                    key={preset.id}
                    onClick={() => onChange(preset.style)}
                    className={`p-3 rounded-lg border transition text-left ${
                      style.fontId === preset.style.fontId &&
                      style.primaryColor === preset.style.primaryColor
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                    }`}
                  >
                    <div
                      className="text-sm font-bold truncate"
                      style={{
                        fontFamily: presetFont?.family,
                        color: preset.style.primaryColor,
                        textShadow: `1px 1px 0 ${preset.style.strokeColor}`,
                      }}
                    >
                      Aa
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate">
                      {preset.name}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Font Tab */}
        {activeTab === 'font' && (
          <div className="space-y-4">
            {/* Font Family */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400">Font Family</label>
              <div className="relative">
                <button
                  onClick={() => setShowFontDropdown(!showFontDropdown)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-left flex items-center justify-between hover:border-gray-600 transition"
                >
                  <span
                    className="text-sm text-white truncate"
                    style={{ fontFamily: currentFont?.family }}
                  >
                    {currentFont?.name || 'Select Font'}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition ${showFontDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showFontDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {fonts.map((font) => (
                      <button
                        key={font.id}
                        onClick={() => {
                          updateStyle({
                            fontId: font.id,
                            fontWeight: font.weights.includes(style.fontWeight)
                              ? style.fontWeight
                              : font.previewWeight || font.weights[0]
                          })
                          setShowFontDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition flex items-center justify-between ${
                          style.fontId === font.id ? 'bg-blue-600/20' : ''
                        }`}
                      >
                        <span
                          className="text-sm text-white"
                          style={{
                            fontFamily: font.family,
                            fontWeight: font.previewWeight || font.weights[0],
                          }}
                        >
                          {font.name}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase">
                          {font.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Font Size */}
            <Slider
              label="Font Size"
              value={style.fontSize}
              min={16}
              max={64}
              unit="px"
              onChange={(v) => updateStyle({ fontSize: v })}
            />

            {/* Font Weight */}
            {currentFont && currentFont.weights.length > 1 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Font Weight</label>
                <div className="flex flex-wrap gap-1">
                  {currentFont.weights.map((weight) => (
                    <button
                      key={weight}
                      onClick={() => updateStyle({ fontWeight: weight })}
                      className={`px-2 py-1 text-xs rounded transition ${
                        style.fontWeight === weight
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {weight}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Letter Spacing */}
            <Slider
              label="Letter Spacing"
              value={style.letterSpacing}
              min={-2}
              max={10}
              step={0.5}
              unit="px"
              onChange={(v) => updateStyle({ letterSpacing: v })}
            />

            {/* Uppercase */}
            <Toggle
              label="Uppercase"
              checked={style.uppercase}
              onChange={(v) => updateStyle({ uppercase: v })}
            />

            {/* Colors */}
            <div className="space-y-3 pt-2 border-t border-gray-800">
              <h4 className="text-xs font-medium text-white">Colors</h4>
              <ColorPicker
                label="Active"
                value={style.primaryColor}
                onChange={(v) => updateStyle({ primaryColor: v })}
              />
              <ColorPicker
                label="Inactive"
                value={style.secondaryColor}
                onChange={(v) => updateStyle({ secondaryColor: v })}
              />
            </div>
          </div>
        )}

        {/* Effects Tab */}
        {activeTab === 'effects' && (
          <div className="space-y-4">
            {/* Stroke */}
            <div className="space-y-3">
              <Toggle
                label="Text Stroke"
                checked={style.strokeEnabled}
                onChange={(v) => updateStyle({ strokeEnabled: v })}
              />
              {style.strokeEnabled && (
                <>
                  <ColorPicker
                    label="Color"
                    value={style.strokeColor}
                    onChange={(v) => updateStyle({ strokeColor: v })}
                  />
                  <Slider
                    label="Width"
                    value={style.strokeWidth}
                    min={0}
                    max={8}
                    step={0.5}
                    unit="px"
                    onChange={(v) => updateStyle({ strokeWidth: v })}
                  />
                </>
              )}
            </div>

            {/* Shadow */}
            <div className="space-y-3 pt-2 border-t border-gray-800">
              <Toggle
                label="Drop Shadow"
                checked={style.shadowEnabled}
                onChange={(v) => updateStyle({ shadowEnabled: v })}
              />
              {style.shadowEnabled && (
                <>
                  <ColorPicker
                    label="Color"
                    value={style.shadowColor.startsWith('rgba') ? '#000000' : style.shadowColor}
                    onChange={(v) => updateStyle({ shadowColor: v })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Slider
                      label="X Offset"
                      value={style.shadowX}
                      min={-10}
                      max={10}
                      unit="px"
                      onChange={(v) => updateStyle({ shadowX: v })}
                    />
                    <Slider
                      label="Y Offset"
                      value={style.shadowY}
                      min={-10}
                      max={10}
                      unit="px"
                      onChange={(v) => updateStyle({ shadowY: v })}
                    />
                  </div>
                  <Slider
                    label="Blur"
                    value={style.shadowBlur}
                    min={0}
                    max={20}
                    unit="px"
                    onChange={(v) => updateStyle({ shadowBlur: v })}
                  />
                </>
              )}
            </div>

            {/* Reset Button */}
            <div className="pt-4 border-t border-gray-800">
              <button
                onClick={() => onChange(DEFAULT_CAPTION_STYLE)}
                className="w-full py-2 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="p-4 border-t border-gray-800 bg-black">
        <div className="text-xs text-gray-500 mb-2">Preview</div>
        <div
          className="bg-gray-800 rounded-lg p-4 flex items-center justify-center min-h-[60px]"
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
        >
          <div
            style={{
              fontFamily: currentFont?.family,
              fontSize: `${Math.min(style.fontSize, 32)}px`,
              fontWeight: style.fontWeight,
              letterSpacing: `${style.letterSpacing}px`,
              textTransform: style.uppercase ? 'uppercase' : 'none',
              color: style.secondaryColor,
              WebkitTextStroke: style.strokeEnabled
                ? `${style.strokeWidth}px ${style.strokeColor}`
                : undefined,
              textShadow: style.shadowEnabled
                ? `${style.shadowX}px ${style.shadowY}px ${style.shadowBlur}px ${style.shadowColor}`
                : undefined,
            }}
          >
            <span style={{ color: style.primaryColor }}>Sample</span>{' '}
            <span>Text</span>
          </div>
        </div>
      </div>
    </div>
  )
}
