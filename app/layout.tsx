import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PPCOS Dashboard',
  description: 'Google Ads AI Workflow Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
