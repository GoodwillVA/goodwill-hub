# AIBC HQ — Agentic Setup Instructions

You are Claude Code setting up a Next.js workspace application from scratch on a new account. This file contains your complete instructions. Read it fully before starting, then execute each phase in order.

## Ground rules

- **Run all terminal commands yourself** using the Bash tool — do not ask the user to run them
- **For browser steps**, give the user clear numbered instructions, then pause and ask for exactly the output you need before continuing
- **Collect everything you need from a phase before moving to the next one**
- **Track credentials** as the user provides them — you will use them all together in Phase 6
- **Do not skip phases** — each one is a dependency for the next

---

## Phase 0 — Verify the starting state

Run the following checks yourself:

1. Run `node --version` — confirm it is v18 or higher. If lower, tell the user to upgrade Node.js at nodejs.org before continuing.
2. Run `npm --version` — confirm npm is available.
3. List the files in the current directory — confirm you see `src/`, `package.json`, `supabase-schema.sql`, and `supabase-meetings-migration.sql`. If these are missing, tell the user the source files were not copied correctly and stop.
4. Check if `node_modules/` exists. If not, run `npm install` and wait for it to complete without errors.
5. Check if `.env.local` exists. If it does, tell the user and ask if they want to overwrite it or skip credential collection.

Report what you found. Confirm you are ready to proceed to Phase 1.

---

## Phase 1 — Collect customization answers

Ask the user ALL of the following questions in a single message before touching any code. Tell them to reply with answers numbered to match. Do not proceed until you have all answers.

Present this to the user:

---
*Before I make any code changes, I need your answers to 16 questions. Reply with your answers numbered 1–16.*

1. **App name** — What should the app be called? (replaces "AIBC HQ" in the sidebar and browser tab — e.g., "Studio HQ", "Apex Hub", "Law Office HQ")
2. **Sidebar acronym** — Short text for the sidebar logo icon? (currently "AIBC HQ" — can be initials or a short word, e.g., "SH", "AH", "LEX")
3. **Your first name** — Your name as it appears in AI-generated content and meeting follow-up emails (currently "Jon")
4. **Business name** — Your business's full name (replaces "AI Business Concepts" throughout)
5. **Business description** — 2–3 sentences: what you do, who you serve, and your approach. This is used verbatim inside the Idea Lab AI prompt.
6. **Target clients** — Who specifically are your clients? (e.g., "small law firms", "e-commerce brands under $5M revenue", "independent real estate investors")
7. **Services** — List 2–4 main services you offer
8. **Key differentiator** — What makes you different from competitors? (e.g., "former CFO background", "niche industry focus", "done-for-you not just advice")
9. **Writing voice** — Describe your content tone (e.g., "professional but approachable", "blunt and data-driven", "warm and story-led")
10. **Content audience** — Who reads your content? (e.g., "HR managers at mid-size companies", "solo founders", "property investors")
11. **Platforms** — Which do you post on most? (LinkedIn / blog / email / other)
12. **Content rules** — Any specific rules for your content? Phrases to avoid, length preferences, format preferences. Write "none" if not.
13. **Brand colors** — Keep the current navy (#0B1829) and gold (#C9A84C)? Or provide new hex codes for: primary background color, accent/highlight color. Write "keep" to leave unchanged.
14. **Modules** — For each module below, write: keep / rename to [new name] / remove
    - Idea Lab
    - CRM
    - Projects
    - Meetings
    - Content Planner
15. **Deployment subdomain** — What URL will the app live at? (e.g., `app2.yourdomain.com` or just "use Vercel URL" if no custom domain)
16. **Login email** — What email address will you use to log into the app?
---

Wait for all 16 answers before continuing.

---

## Phase 2 — Apply code customizations

Using the answers from Phase 1, update each of the following files. Read each file first, then apply the changes. After all updates, report a summary of every change made.

### File 1: `src/app/api/ideas/brainstorm/route.ts`
Update the `SYSTEM_PROMPT` constant:
- Replace "AI Business Concepts" with answer 4
- Replace the business description lines (About the business section) with a rewritten version using answers 4, 5, 6, 7, 8
- Replace the tagline with something appropriate to the new business, or remove it if answer 12 says none
- Keep the response format instructions (Concept, Target Buyer, Revenue Potential, etc.) — these are structural, not business-specific

### File 2: `src/app/api/meetings/analyze/route.ts`
Update the `SYSTEM_PROMPT` constant:
- Replace "Jon" with answer 3
- Replace "AI Business Concepts" with answer 4
- Replace "CPA-led AI consulting firm for small businesses" with a short description from answer 5
- Keep all JSON format instructions exactly as they are

### File 3: `src/app/(dashboard)/content/page.tsx`
Update the `DEFAULT_STYLE` constant:
- Replace "Jon" with answer 3
- Replace "AI Business Concepts" with answer 4
- Replace the voice and brand description using answers 8, 9, 10
- Replace "CPA-led AI consulting firm for small businesses" with answer 5 (abbreviated)
- Update the LinkedIn post rules using answer 12 (length, rules, etc.)
- Update the audience reference using answer 10
- Keep the structural format instructions (For LinkedIn posts: / For blog posts: / For emails:)

### File 4: `src/components/sidebar.tsx`
- Replace the brand text `AIBC HQ` (the `<span>` text in the Brand section) with answer 1
- The acronym in the logo area should reflect answer 2

### File 5: `src/app/layout.tsx`
- Read this file and update the page `<title>` and any metadata title/description to use answer 1 (app name) and answer 4 (business name)

### File 6: `src/app/globals.css`
- Only edit this file if answer 13 provided new hex codes
- If "keep", leave this file completely unchanged
- If new colors provided, update the hex values in the `@theme inline {}` block for the relevant color variables

### Module removals/renames (answer 14):
- If any module should be **removed**: delete its entry from the `NAV` array in `src/components/sidebar.tsx`
- If any module should be **renamed**: update its `label` in the `NAV` array
- Do not delete page files — only remove/rename the nav entry

After completing all file changes, read each changed file and confirm the edits look correct. Show the user a brief summary of what changed in each file.

---

## Phase 3 — GitHub repository

Tell the user:

---
*Now we need a GitHub repository. Please do the following — it takes about 2 minutes:*

1. Go to **github.com** and sign in
2. Click **+** (top right) → **New repository**
3. Repository name: use a short lowercase name with hyphens (e.g., `my-workspace` or your app name)
4. Set visibility to **Private**
5. **Do NOT** check any of the initialize options (no README, no .gitignore, no license)
6. Click **Create repository**
7. On the next page, copy the repository URL — it looks like: `https://github.com/YOUR-USERNAME/repo-name.git`

*Paste the repository URL here and I'll push the code.*

---

Once the user provides the URL, run these commands in order:
```
git init
git add -A
git commit -m "Initial commit"
git branch -M master
git remote add origin [URL they provided]
git push -u origin master
```

Confirm the push succeeded. If it fails, report the error.

---

## Phase 4 — Supabase

### Step 4a — Create project and get credentials

Tell the user:

---
*Now set up Supabase (the database). This takes about 3 minutes:*

1. Go to **supabase.com** and sign in
2. Click **New project**
3. Fill in: project name (anything you like), choose a **region closest to you**, set a **database password** (save it somewhere safe)
4. Click **Create new project** — wait about 30 seconds for it to finish
5. Once ready, click the **gear icon** (Project Settings) → **API**
6. You'll see two things to copy:
   - **Project URL** — looks like `https://xxxxxxxxxx.supabase.co`
   - **anon / public key** — labeled "anon" under Project API Keys — a long string starting with `eyJ`

*Paste both values here (label them "URL:" and "Key:").*

---

Wait for both values before continuing.

### Step 4b — Run the SQL schema

Once you have the Supabase credentials, tell the user:

---
*Now we need to create the database tables. You'll run 3 quick SQL scripts:*

**Script 1:**
1. In Supabase, click **SQL Editor** in the left sidebar
2. Click **+ New query**
3. Copy everything below and paste it into the query box, then click **Run**

---

Read `supabase-schema.sql` and display its full contents for the user to copy.

Then continue:

---
*Confirm it ran successfully (you'll see a green success message).*

**Script 2:**
1. Click **+ New query** to open a fresh query box
2. Copy everything below and paste it in, then click **Run**

---

Read `supabase-meetings-migration.sql` and display its full contents.

Then:

---
*Confirm it ran successfully.*

**Script 3:**
1. Click **+ New query** one more time
2. Copy and run this single line:

```sql
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS ai_style text;
```

*Confirm all three scripts ran successfully. Then let me know.*

---

### Step 4c — Create user account

Tell the user:

---
*Last Supabase step — create your login account:*

1. In Supabase, go to **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter your email: **[answer 16]** and set a password you'll remember
4. Click **Create user**
5. Now go to **Authentication** → **Configuration** → **Email**
6. Enable **"Disable sign-ups"** (prevents anyone else from registering)
7. Click **Save**

*Let me know when that's done.*

---

---

## Phase 5 — Anthropic API key

Tell the user:

---
*Now get your Anthropic API key for the AI features:*

1. Go to **console.anthropic.com** and sign in
2. Make sure you have a **payment method** added under Billing (required for API access — personal use is typically under $5/month)
3. Click **API Keys** in the left sidebar
4. Click **+ Create Key**, name it anything (e.g., "My Workspace"), click **Create Key**
5. ⚠️ **Copy the key immediately** — it starts with `sk-ant-api03-` — you **cannot view it again** after closing this dialog

*Paste the API key here.*

---

Wait for the key before continuing.

---

## Phase 6 — Create .env.local

Using the credentials collected in Phases 4 and 5, create a file called `.env.local` in the project root with this exact content (substituting the real values):

```
NEXT_PUBLIC_SUPABASE_URL=[Supabase URL from Phase 4a]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[Supabase anon key from Phase 4a]
ANTHROPIC_API_KEY=[Anthropic key from Phase 5]
```

After creating the file, run `git status` to confirm `.env.local` does **not** appear in the list of tracked files (it should be ignored by .gitignore). Tell the user the result.

---

## Phase 7 — Deploy to Vercel

Tell the user:

---
*Now deploy the app. This is the last big step:*

1. Go to **vercel.com** and sign in
2. Click **Add New...** → **Project**
3. Connect your GitHub account if prompted, then find your repository and click **Import**
4. Leave all build settings as default (Vercel auto-detects Next.js)
5. Scroll down to **Environment Variables** and add these three — one at a time:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | [their Supabase URL] |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [their Supabase anon key] |
| `ANTHROPIC_API_KEY` | [their Anthropic key] |

6. Click **Deploy** and wait about 2 minutes
7. Once deployed, copy the URL — it looks like `https://your-app-xxx.vercel.app`

*Paste the Vercel URL here.*

---

Wait for the Vercel URL.

---

## Phase 8 — Supabase redirect URLs (critical)

Once you have the Vercel URL, tell the user:

---
*One critical step — without this, logging in will fail with a redirect error:*

1. In Supabase, go to **Authentication** → **URL Configuration**
2. Under **"Redirect URLs"**, click **Add URL** and add each of these on separate lines:
   - `http://localhost:3000/**`
   - `[Vercel URL]/**`
3. Under **"Site URL"**, enter `[Vercel URL]`
4. Click **Save**

*Confirm when saved.*

---

---

## Phase 9 — Custom domain (optional)

Ask the user: "Do you want to set up a custom subdomain (answer 15 was: [their answer])? Type **yes** to set it up or **skip** to use the Vercel URL."

If **yes**:

Tell the user:

---
*To connect your custom domain:*

**In Vercel:**
1. Go to your project → **Settings** → **Domains**
2. Type `[answer 15]` and click **Add**
3. Vercel shows a CNAME record — copy the **Target** value (looks like `xxxxxxxx.vercel-dns-xxx.com`)

*Paste that Target value here.*

---

Once you have the CNAME target:

---
*Now in your DNS provider (Hostinger example):*

1. Log in → find your domain → **DNS Records**
2. Click **Add Record**:
   - Type: **CNAME**
   - Name/Host: **[just the subdomain prefix, e.g. "app2"]**
   - Points to: **[the CNAME target from Vercel]**
   - TTL: 3600
3. Save the record
4. Wait 5–15 minutes, then go back to **Vercel → Domains** — you're done when it shows a green **"Valid Configuration"**
5. Also go to **Supabase → Authentication → URL Configuration → Redirect URLs** and add: `https://[answer 15]/**`

*Let me know when Vercel shows Valid Configuration.*

---

---

## Phase 10 — Final verification

Tell the user:

---
*Setup is complete! Let's make sure everything works:*

1. Open **[app URL — custom domain if set up, otherwise Vercel URL]** in your browser
2. You should see a **login page**
3. Log in with `[answer 16]` and the password you set in Supabase
4. You should land on the **Dashboard**
5. Go to **Idea Lab**, add a test idea, and click the AI brainstorm button — confirm Claude responds

**If something is wrong:**
- Login redirects to an error → Supabase redirect URLs not saved (redo Phase 8)
- AI not responding → Check ANTHROPIC_API_KEY in Vercel project settings
- Blank page / build error → Check Vercel build logs under the Deployments tab

*Let me know if everything works or if you hit any issues.*

---

Display a final summary listing:
- App URL
- Modules active (based on answer 14)
- Customizations applied (brief list)
- Reminder that future deploys are automatic: `git add -A` → `git commit -m "message"` → `git push origin master`
