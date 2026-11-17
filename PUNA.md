# PUNA.md — revolution-kontabilisti-server

## 2026-11-17 — Çelësi nga Hardware ID

Faqja Licencat ka «Gjenero Çelësin». Ruajtja e ruan atë çelës bashkë me ID. Programi e merr te `/api/license/by-hardware`. Pa build. Pa git. Live jo.

| Skedar | Ndryshimi |
|--------|-----------|
| `hardwareLicense.js` | Çelësi SHA256 nga ID, kripë e Kontabilistit |
| `routes/admin.js` | POST /api/admin/generate-license-key |
| `routes/license.js` | POST /api/license/by-hardware |
| `services/supabase.js` | Ruajtja e çelësit dhe kërkimi me ID |
| `public/admin/admin.js` | Butoni dhe fusha e çelësit |
| `supabase-schema.sql` | Kolona license_key |

Duhet ekzekutuar te Supabase i Kontabilistit, vetëm nëse kolona mungon:

`ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS license_key text;`

## 2026-11-02 — ENABLE_RLS.sql (vetëm skedar, pa ekzekutim)

| Skedar | Ndryshimi |
|--------|-----------|
| `supabase/ENABLE_RLS.sql` | ENABLE RLS + REVOKE anon/authenticated për 3 tabela live (`smjqzefnktatzwydhunr`) |

**Nuk u ekzekutua** SQL. Nuk u bë build/git.

## 2026-11-02 — Super Admin: set-password / owner-email

Rrugë admin për email/fjalëkalim (model HOTEL). bcrypt 12. `users.passwordi` + `users.email`. Licenca (`id` = klienti) merr `owner_email` nëse kolona ekziston.

| Skedar | Ndryshimi |
|--------|-----------|
| `routes/admin.js` | POST set-password / password, PATCH owner-email |
| `services/owner-credentials.js` | bcrypt 12 + Supabase `users` |
| `services/supabase.js` | PATCH `owner_email`; eksport `getClient` |
| `package.json` | `bcryptjs` |
| `sql/users.sql` | tabelë `users` + RLS (nuk u ekzekutua) |

Provë: `node --check`. Commit/push. Railway i parë dështoi: `package-lock.json` pa `bcryptjs` (npm ci). U shtua në lockfile dhe u push përsëri.

Duhet ekzekutuar `sql/users.sql` në Supabase Kontabilisti para se rrugët të shkruajnë `users`.

**Nuk preka:** desktop Kontabilisti, URL, secrets.
