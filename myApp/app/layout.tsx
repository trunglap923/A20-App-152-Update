import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Inter, Roboto, Playfair_Display, Montserrat, Lora, Poppins, Dancing_Script } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { ToastProvider } from '@/components/toast-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { SessionTimeoutManager } from '@/components/session-timeout-manager'
import { DocumentProcessingProvider } from '@/contexts/document-processing-context'
import { CustomApiKeysProvider } from '@/contexts/custom-api-keys-context'
import { UploadStatusPill } from '@/components/upload-status-pill'
import { FeedbackButton } from '@/components/feedback-button'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const _slideInter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-slide-inter' })
const _slideRoboto = Roboto({ subsets: ['latin', 'vietnamese'], variable: '--font-slide-roboto', weight: ['400', '500', '700'] })
const _slidePlayfair = Playfair_Display({ subsets: ['latin', 'vietnamese'], variable: '--font-slide-playfair', weight: ['400', '600', '700'] })
const _slideMontserrat = Montserrat({ subsets: ['latin', 'vietnamese'], variable: '--font-slide-montserrat', weight: ['400', '500', '700'] })
const _slideLora = Lora({ subsets: ['latin', 'vietnamese'], variable: '--font-slide-lora', weight: ['400', '500', '700'] })
const _slidePoppins = Poppins({ subsets: ['latin', 'vietnamese'], variable: '--font-slide-poppins', weight: ['400', '500', '700'] })
const _slideDancing = Dancing_Script({ subsets: ['latin', 'vietnamese'], variable: '--font-slide-dancing', weight: ['400', '700'] })

export const metadata: Metadata = {
  title: 'Nexus - Transform Knowledge Into Understanding',
  description: 'AI-powered app that transforms documents, videos, and voice recordings into structured knowledge with summaries, lessons, quizzes, and mindmaps.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`font-sans antialiased ${_slideInter.variable} ${_slideRoboto.variable} ${_slidePlayfair.variable} ${_slideMontserrat.variable} ${_slideLora.variable} ${_slidePoppins.variable} ${_slideDancing.variable}`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SessionTimeoutManager />
          <DocumentProcessingProvider>
            <CustomApiKeysProvider>
              {children}
              <UploadStatusPill />
              <FeedbackButton />
            </CustomApiKeysProvider>
          </DocumentProcessingProvider>
          <ToastProvider />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
