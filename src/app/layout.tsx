import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'AIBC HQ',
  description: 'AI Business Concepts internal workspace',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full bg-navy-900 text-cream-100 antialiased">
        {children}
        <Toaster
          theme="dark"
          toastOptions={{
            style: { background: '#0e2038', border: '1px solid #285087', color: '#F5F0E0' },
          }}
        />
      </body>
    </html>
  )
}
