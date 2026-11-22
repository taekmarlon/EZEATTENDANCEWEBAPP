# EZ Center Web Portal — Supabase Setup Guide

## 1. Create or Connect Your Supabase Project
1. Sign in at [supabase.com](https://supabase.com) and open your project.
2. Copy **Project URL** (`VITE_SUPABASE_URL`) and **Anon / Public Key** (`VITE_SUPABASE_ANON_KEY`) from **Project Settings → API**.
3. For local development, create `.env.local`:
   ```env
   VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   ```
4. For production on **Vercel**, add those exact same two variables under **Project Settings → Environment Variables**.

## 2. Apply Database Migrations
If you have not already set up your database, run the four migration files in order in the **Supabase SQL Editor**:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_seed_defaults.sql`
4. `supabase/migrations/004_profile_recovery.sql`

> Note: If you are connecting this Web App to the **same Supabase project** used by the mobile portal, your tables, RLS policies, grants, and existing users/records work out of the box with no extra migrations needed.

## 3. Configure Web Redirect URLs in Supabase Auth
After deploying to Vercel (e.g. `https://ez-center-web.vercel.app`):
1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to `https://YOUR_VERCEL_DOMAIN.vercel.app`.
3. Add `https://YOUR_VERCEL_DOMAIN.vercel.app/**` to **Redirect URLs**.
4. *(Optional)* Under **Authentication → Providers → Email**, disable **Confirm email** if Teachers created in the Admin Console should log in immediately without confirming an email link.
