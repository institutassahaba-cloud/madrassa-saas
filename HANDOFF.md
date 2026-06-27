# MadrassaApp — Passation / État du projet

> Document de passation pour reprendre le travail (ex. sur Codex).
> Dernière mise à jour : 27 juin 2026.

## 📍 Emplacement & accès

- **Projet** : `/Users/idriss/Desktop/madrassa-saas`
- **Dépôt GitHub** (privé) : `https://github.com/institutassahaba-cloud/madrassa-saas` (branche `main`)
- **App en ligne** (Vercel) : https://madrassa-saas-umber.vercel.app
- **Base en ligne** : Turso (libsql) — `libsql://madrassa-institutassahaba-cloud.aws-eu-west-1.turso.io`
- **Base locale (dev)** : `prisma/dev.db` (SQLite, contient toutes les données migrées)
- Vercel redéploie automatiquement à chaque `push` sur `main`.

## 🧱 Stack technique (⚠️ pièges importants)

- **Next.js 16.2.9** (App Router, Turbopack). ⚠️ `AGENTS.md` prévient : ce n'est PAS le Next.js habituel — lire `node_modules/next/dist/docs/` avant d'écrire du code Next. `cookies()` / `searchParams` sont **async**.
- **Prisma 7.8** + adaptateur **`@prisma/adapter-libsql`** sur SQLite (`provider="sqlite"`). ⚠️ Le CLI Prisma ne peut PAS pousser vers Turso (`libsql://` non supporté, erreur P1013). → modifs de schéma sur Turso via **`ALTER TABLE` avec `@libsql/client`**, pas `prisma db push`.
- **Auth.js v5** (next-auth beta), Credentials + JWT, bcryptjs. `src/lib/auth.ts` + `src/lib/auth.config.ts`. Pas de `middleware.ts` : la protection des routes passe par les **layouts serveur** + le callback `authorized`.
- **Multi-tenant** : `tenantId` partout, slug `assahaba`. 3 rôles : `DIRECTOR` / `SECRETARY` / `TEACHER`.
- Build : `package.json` → `"build": "prisma generate && next build"` + `"postinstall": "prisma generate"` (sinon Vercel casse).
- ⚠️ `prisma/dev.db` est **gitignoré** (données élèves réelles, ne jamais committer).

## 🔌 Variables d'environnement

- Local (`.env.local`, gitignoré) : `DATABASE_URL="file:/Users/idriss/Desktop/madrassa-saas/prisma/dev.db"`, `AUTH_SECRET`, `COMPTA_EMAIL_PASSWORD`.
- Vercel : `DATABASE_URL` (=URL Turso), `TURSO_AUTH_TOKEN`, `AUTH_SECRET`.
- ⚠️ **À AJOUTER sur Vercel** : `BREVO_API_KEY` (+ `BREVO_FROM_EMAIL`, défaut `contact@institut-assahaba.com`) pour activer l'envoi d'email « mot de passe oublié ». Sans elle : géré sans crash mais l'email ne part pas.

---

## ✅ CE QUI A ÉTÉ FAIT

### 1. Migration des données Google Sheets → SaaS (instantané figé, PAS de synchro live)
- Outils Python (openpyxl) + scripts `.mjs` dans `prisma/` : `migrate-google.mjs`, `migrate-payments.mjs`, `migrate-cahiers.mjs`, `migrate-edt.mjs`.
- Importé : **131 élèves** (legacyId `EL###`), **117 groupes**, **10 profs**, **483 paiements**, ~**2250 sessions** de cahier, **~11900 cours**, **140 créneaux EDT**.
- ⚠️ Qualité cahier de Samia (PR001) à auditer (onglets parasites captés). Voir `memory` du projet pour le détail des pièges de parsing.

### 2. Déploiement de test (Vercel + Turso)
- App sur Vercel, données copiées sur Turso (même techno que `dev.db`, adaptateur libsql inchangé).
- `src/lib/prisma.ts` accepte `TURSO_AUTH_TOKEN`.

### 3. Onboarding première connexion + sécurité comptes (déployé)
- **Identifiants ≠ email** : format `prenom` + 2 chiffres (ex. `directeur36`, `asma85`). Stockés dans `User.email`.
- Nouveau champ **`User.contactEmail`** = vraie adresse email (récup mot de passe).
- Nouveau champ **`User.hasOnboarded`** (Boolean).
- **Écran de bienvenue** `/bienvenue` (hors layout dashboard, plein écran) : Basmala + hadith `إنما الأعمال بالنيات`, salutation au nom, **email obligatoire**, case « modifier le mot de passe ? » → nouveau + confirmation, avec **œil 👁** (afficher/masquer).
  - Page : `src/app/bienvenue/page.tsx` + `bienvenue-client.tsx` (wrap dans `SessionProvider`, `useSession().update()` après onboard pour rafraîchir le token JWT).
  - API : `PUT /api/users/onboard`.
- **Composant œil réutilisable** : `src/components/ui/password-input.tsx` (utilisé sur login, bienvenue, mon-compte).
- **Mot de passe oublié** : lien sur `/login` → `POST /api/auth/forgot` (réponse générique anti-énumération ; génère un mdp, `mustChangePassword=true`, envoie via Brevo).
- **Email Brevo** : `src/lib/email.ts` (API `api.brevo.com/v3/smtp/email`).
- **Changement d'email** dans Mon compte : `PUT /api/users/email`.
- Garde onboarding : `dashboard/layout.tsx` redirige vers `/bienvenue` si `!hasOnboarded`.
- Mots de passe profs régénérés (uniques). Directeur/secrétaire encore `admin1234` côté local (⚠️ en ligne, Idriss a changé le sien).

### 4. « Voir comme un professeur » (directeur, lecture seule) — déployé
- Helper `src/lib/view-as.ts` → `getEffectiveUser()` : lit le cookie httpOnly `viewAsTeacher` ; si le directeur l'a activé, renvoie le prof (rôle effectif `TEACHER`) avec `impersonating` + `realRole`.
- API `/api/view-as` : `POST {teacherId}` active, `DELETE` quitte.
- Bouton **« Voir comme ce professeur »** sur la fiche prof dépliée (`teachers-client.tsx`).
- Bandeau orange + bouton « Quitter la vue » : `src/components/layout/impersonation-banner.tsx`, monté dans `dashboard/layout.tsx`.
- ⚠️ **Toutes les pages dashboard** utilisent désormais `getEffectiveUser()` au lieu de `session.user` pour le filtrage (accueil, cahier, attendance, schedule, groups, mes-documents + pages réservées qui redirigent en mode prof).

---

## ⏳ CE QU'IL RESTE À FAIRE

### Court terme / sécurité
1. **`BREVO_API_KEY` sur Vercel** (+ test d'un vrai envoi « mot de passe oublié »).
2. **Changer les mots de passe directeur + secrétaire** (encore `admin1234` ; le directeur a changé le sien en ligne).
3. **Révoquer le token GitHub** `ghp_...` utilisé pour les push (Vercel a sa propre connexion).

### Fonctionnel (backlog priorisé)
4. **Lot D — moteur de vérification des paiements** (le gros morceau). Décision : **parsing email Gmail** pour PayPal + Wise (comptes perso), avec **matching à garde-fous stricts** (auto-valide seulement si 100 % univoque : payeur + montant + une seule demande en attente ; sinon file manuelle). Modèles déjà prévus : `PaymentMatch` (verrou `gmailMessageId` unique), `PaymentAllocation` (paiements groupés N-N).
5. **Bouton « dernier cours fait »** côté prof (server action : marque le dernier cours PRESENT + logique fin de session).
6. **Export SaaS → Google Sheets** (miroir lecture seule / bouton ou synchro nocturne ; `googleapis` déjà installé). PAS de synchro bidirectionnelle.
7. Pages au menu encore absentes : `/stats`, `/notifications` ; à créer aussi : Livres.
8. Commission secrétaire 10 % (modèle `SecretaryCommission` existe, logique à brancher).

### Qualité de données
9. **Auditer/corriger le cahier de Samia (PR001)** (onglets parasites).
10. Quelques élèves sans cahier / doublons de fiches à fusionner à la main (voir détail dans la mémoire projet).

---

## 🛠️ Commandes utiles

```bash
# Dev local (port 3002)
cd /Users/idriss/Desktop/madrassa-saas
PORT=3002 npm run dev      # ou: node node_modules/.bin/next dev --port 3002

# Build de prod (vérif avant déploiement)
npm run build

# Régénérer le client Prisma après modif schema
npx prisma generate

# Modifier la base Turso : via @libsql/client (PAS prisma db push)
#   createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

# Déploiement : git push main → Vercel auto-déploie
```

## 🔑 Identifiants actuels (local + en ligne)

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Directeur | `directeur36` | `admin1234` (local) / changé en ligne par Idriss |
| Secrétaire | `secretaire69` | `admin1234` |
| Samia umm Haroun | `samia.umm.haroun69` | `zjg37533` |
| Sarah Lamari | `sarah.lamari48` | `gvj57227` |
| Maria | `maria89` | `kzw37693` |
| Samia Umm Abderrahmen | `samia.umm.abderrahmen24` | `udw85394` |
| Fatima Oum abdirrahmane | `fatima.oum.abdirrahmane92` | `cne96677` |
| Sirine | `sirine19` | `jxr24846` |
| Asma | `asma85` | `miw74388` |
| Lilia | `lilia11` | `pbc24799` |
| Rahma Housni | `rahma.housni10` | `dgx49664` |
| Djouher | `djouher52` | `ehf85383` |

> ⚠️ Tous les comptes ont `hasOnboarded=0` → 1ʳᵉ connexion = écran de bienvenue (saisie email obligatoire).
