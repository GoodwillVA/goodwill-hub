'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FolderKanban, CalendarDays, ClipboardList, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/monthly-tasks', label: 'Monthly Tasks', icon: ClipboardList },
  { href: '/meetings', label: 'Meetings', icon: CalendarDays },
]

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-navy-800 border-r border-navy-600 h-screen sticky top-0">
      {/* Brand */}
      <div className="flex flex-col px-4 py-4 border-b border-navy-600 gap-2">
        <img
          src="/goodwill-logo.png"
          alt="Goodwill of Central and Coastal Virginia"
          className="w-40 rounded"
        />
        <span className="font-bold text-cream-100 text-sm tracking-wide pl-1">Goodwill Hub</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-gold-500/15 text-gold-400 border border-gold-500/25'
                  : 'text-cream-200/60 hover:text-cream-100 hover:bg-navy-700'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-gold-500' : ''}`} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-navy-600 px-4 py-4">
        <p className="text-xs text-cream-200/40 truncate mb-2">{userEmail}</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-cream-200/50 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
