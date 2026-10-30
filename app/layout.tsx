import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clipfluencer - AI Video Clipper',
  description: 'Turn long videos into viral clips with AI',
}

// Google Fonts for caption styles
const googleFontsUrl = 'https://fonts.googleapis.com/css2?' + [
  'family=Roboto:wght@400;500;700;900',
  'family=Montserrat:wght@400;500;600;700;800;900',
  'family=Oswald:wght@400;500;600;700',
  'family=Bebas+Neue',
  'family=Anton',
  'family=Bangers',
  'family=Permanent+Marker',
  'family=Black+Ops+One',
  'family=Russo+One',
  'family=Teko:wght@300;400;500;600;700',
  'family=Poppins:wght@400;500;600;700;800;900',
  'family=Luckiest+Guy',
].join('&') + '&display=swap'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={googleFontsUrl} rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
