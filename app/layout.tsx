import type { Metadata } from 'next'
import { Orbitron, Space_Grotesk } from 'next/font/google'

import './globals.css'

const displayFont = Orbitron({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '700']
})

const bodyFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '700']
})

export const metadata: Metadata = {
  title: 'Pam AI Voice Console',
  description: 'Secure voice clarification flow for Pega duplicate-expense review cases, with structured callback delivery.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  )
}
