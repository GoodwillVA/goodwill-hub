'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BrainCircuit } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-navy-700 border border-gold-500/30 mb-4">
            <BrainCircuit className="w-7 h-7 text-gold-500" />
          </div>
          <h1 className="text-2xl font-bold text-cream-100 tracking-tight">AIBC HQ</h1>
          <p className="text-sm text-cream-200/60 mt-1">AI Business Concepts</p>
        </div>

        {/* Card */}
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-cream-100 mb-6">Sign in to your workspace</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-cream-200/80 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-navy-700 border border-navy-600 rounded-lg px-4 py-2.5 text-cream-100 placeholder-cream-200/30 text-sm focus:border-gold-500 focus:outline-none transition-colors"
                placeholder="jon@aibusinessconcepts.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-cream-200/80 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-navy-700 border border-navy-600 rounded-lg px-4 py-2.5 text-cream-100 placeholder-cream-200/30 text-sm focus:border-gold-500 focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold-500 hover:bg-gold-400 disabled:opacity-50 disabled:cursor-not-allowed text-navy-900 font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
