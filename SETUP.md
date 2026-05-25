# AIBC HQ — Setup Guide

## Step 1: Supabase

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor**
2. Paste the entire contents of `supabase-schema.sql` and click **Run**
3. Go to **Authentication → Users → Add user** and create:
   - Email: `jon@aibusinessconcepts.com`
   - Password: (set a strong password)
   - Check "Auto Confirm User"
4. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Step 2: Fill in .env.local

Open `.env.local` and replace the placeholders:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
```

Your Anthropic API key is at [console.anthropic.com](https://console.anthropic.com) → API Keys.

## Step 3: Deploy to Vercel

1. Push this project to a GitHub repo:
   ```
   git init (if not already)
   git add .
   git commit -m "Initial AIBC HQ workspace"
   git remote add origin https://github.com/YOUR_USER/aibc-hq.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import from GitHub
3. In **Environment Variables**, add all 3 keys from `.env.local`
4. Click **Deploy**

## Step 4: Custom Domain (app.aibusinessconcepts.com)

**In Vercel:**
1. Open your deployed project → **Settings → Domains**
2. Add `app.aibusinessconcepts.com`
3. Vercel will show you a CNAME value (like `cname.vercel-dns.com`)

**In Hostinger:**
1. Log in → **Domains → aibusinessconcepts.com → DNS / Nameservers**
2. Add a new DNS record:
   - Type: `CNAME`
   - Name/Host: `app`
   - Points to: `cname.vercel-dns.com` (use the exact value Vercel gives you)
   - TTL: 3600 (or default)
3. Save and wait 5-30 minutes for propagation

Once propagated, `https://app.aibusinessconcepts.com` will serve the workspace.

## Done ✓

The workspace is at `app.aibusinessconcepts.com`. Sign in with `jon@aibusinessconcepts.com`.
