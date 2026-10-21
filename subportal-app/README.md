# GrayCo Subcontractor Portal — source

React + Vite. The built files go to `../subportal/`, which Netlify serves as-is (the CRM site has no build step).

```bash
npm install
npm run build   # → ../subportal/  (commit it together with the source change)
```

- `src/App.jsx` — the whole portal UI (subs and GrayCo admins, English / Spanish).
- `src/auth.js` — sign-in (the CRM's own Supabase sign-in, browser key `gc_auth_v1`).
- `src/storage.js` — records and files, all through `netlify/functions/subportal.js`.
- `docs/` — the original planning notes that came with the prototype (CRM integration, future features).

Owner's guide and setup: `../docs/SUBPORTAL-SETUP.md`.
