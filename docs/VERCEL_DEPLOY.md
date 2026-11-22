# Push to a New GitHub Repository & Deploy on Vercel

This folder (`eze-attendanceWEBAPP`) is a standalone **Web + PWA** build stripped of native Android/Capacitor binaries so it stays lightweight, fast on Vercel, and independent from the mobile APK repository.

## 1. Push to Any New GitHub Repository
Create a new empty repository on GitHub (do **not** initialize it with a README or `.gitignore`), then run inside this folder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_WEB_REPO.git
git branch -M main
git push -u origin main
```

> `.env.local` is ignored by `.gitignore`, so your Supabase keys will never be pushed to GitHub. Configure them directly in Vercel instead.

## 2. Deploy on Vercel
1. Go to [vercel.com/new](https://vercel.com/new) and import your new GitHub repository (`YOUR_WEB_REPO`).
2. Vercel auto-detects **Vite** using `vercel.json`:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add **Environment Variables** in Vercel:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase Anon Public Key
4. Click **Deploy**.
5. Copy your live `https://*.vercel.app` URL and add it in **Supabase → Authentication → URL Configuration → Site URL & Redirect URLs**.
