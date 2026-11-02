# PUNA.md — revolution-kontabilisti-server

## 2026-11-02 — Super Admin: set-password / owner-email

Rrugë admin për email/fjalëkalim (model HOTEL). bcrypt 12. `users.passwordi` + `users.email`. Licenca (`id` = klienti) merr `owner_email` nëse kolona ekziston.

| Skedar | Ndryshimi |
|--------|-----------|
| `routes/admin.js` | POST set-password / password, PATCH owner-email |
| `services/owner-credentials.js` | bcrypt 12 + Supabase `users` |
| `services/supabase.js` | PATCH `owner_email`; eksport `getClient` |
| `package.json` | `bcryptjs` |
| `sql/users.sql` | tabelë `users` + RLS (nuk u ekzekutua) |

Provë: `node --check`. Commit/push/deploy te ky hap. Duhet ekzekutuar `sql/users.sql` në Supabase Kontabilisti para se rrugët të shkruajnë `users`.

**Nuk preka:** desktop Kontabilisti, URL, secrets.
