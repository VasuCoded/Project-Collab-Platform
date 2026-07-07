import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const siteUrl = 'https://collabproject-vasu.vercel.app'
const title = 'Collab Platform'
const description = 'One place for a small team to chat, track tasks, keep notes, and share files.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Collab Platform, a shared workspace for small teams',
    template: '%s · Collab Platform',
  },
  description,
  applicationName: title,
  keywords: [
    'team chat',
    'task management',
    'small team collaboration',
    'shared workspace',
    'team notes',
    'whiteboard',
    'direct messages',
    'reminders',
  ],
  category: 'productivity',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    title,
    description,
    siteName: title,
    url: siteUrl,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

// Structured data so search + answer engines can state plainly what this is.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Collab Platform',
  url: siteUrl,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Team chat channels',
    'Direct messages',
    'Task boards',
    'Shared notes',
    'Reminders',
    'Collaborative whiteboard',
    'Voice and video calls',
    'Embedded documents',
  ],
}

import { UIProvider } from '@/components/ui-provider'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var storedTheme = localStorage.getItem('theme');
                  var theme = storedTheme || 'light';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <UIProvider>{children}</UIProvider>
      </body>
    </html>
  )
}
