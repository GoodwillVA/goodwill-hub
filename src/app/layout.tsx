import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Goodwill Hub',
  description: 'Goodwill of Central and Coastal Virginia internal workspace',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full bg-navy-900 text-cream-100 antialiased">
        {children}
        <Toaster
          theme="dark"
          toastOptions={{
            style: { background: '#002266', border: '1px solid #1a53cc', color: '#ffffff' },
          }}
        />
      </body>
    </html>
  )
}
