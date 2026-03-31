# ReviseFlow v4

GitHub Pages-ready structure with split files for easier updates.

## Files
- index.html — app shell
- styles.css — design
- app.js — app logic
- schedule.json — daily tasks
- settings.json — app settings and exam dates
- resources.json — helpful links
- manifest.json — installable app settings
- sw.js — offline caching
- .nojekyll — tells GitHub Pages not to use Jekyll
- CNAME.example — rename to `CNAME` when you buy your custom domain

## Quick update guide
- Change timetable/tasks: edit `schedule.json`
- Change links: edit `resources.json`
- Change app name, date range, or domain placeholder: edit `settings.json`
- Change layout/design: edit `styles.css`
- Change behavior/features: edit `app.js`

## Custom domain on GitHub Pages
1. Buy your domain from a registrar.
2. In this folder, rename `CNAME.example` to `CNAME`.
3. Replace its contents with your real domain, for example:
   reviseflow.app
4. Upload all files to your GitHub repository root.
5. In GitHub: Settings > Pages > Custom domain, enter the same domain.
6. At your registrar, point the DNS to GitHub Pages.


## Supabase setup for login and sync
1. In Supabase, go to SQL Editor.
2. Run the file `supabase_progress_setup.sql`
3. In Authentication -> Providers, enable Email.
4. In Authentication -> URL Configuration, set your site URL to your GitHub Pages URL.
5. Upload these files to GitHub Pages.

This version uses:
- Email/password sign up and login
- Cloud sync for completed tasks
- Local fallback when signed out
