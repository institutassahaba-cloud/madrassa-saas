# Plan d'architecture — MadrassaApp (migration du système Google Sheets)

> Objectif : remplacer **totalement** le système Google Sheets (formulaire + TDB + fiches profs + RECAP + fiches de paie + Apps Script) par le SaaS MadrassaApp.
> Décisions validées : (1) remplacement total des Sheets, (2) vérification paiements par **parsing email** PayPal/Wise, (3) ce plan d'abord, (4) la **secrétaire voit tout** (y compris salaires profs) sauf ses propres règles de commission.

---

## 1. Rôles et permissions (cible)

| Écran | Directeur | Secrétaire | Professeur |
|---|---|---|---|
| Tableau de bord | ✅ global | ✅ global | ✅ perso |
| Élèves | ✅ | ✅ | 👁️ ses élèves |
| Professeurs | ✅ +ajout profs & secrétaires | ✅ +ajout profs | ❌ |
| Groupes | ✅ | ✅ | 👁️ ses groupes |
| Cahier de cours | ✅ | ✅ | ✅ ses cahiers |
| Présences | ✅ | ✅ | ✅ ses élèves |
| Contrôles | ✅ | ✅ | ✅ ses élèves |
| Paiements (encaissement) | ✅ | ✅ **rôle principal** | ❌ (voit juste payé/non payé de ses élèves) |
| Vérification paiements (PayPal/Wise) | ✅ | ✅ **rôle principal** | ❌ |
| Salaires profs | ✅ | ✅ (voit montants) | 👁️ sa fiche |
| Commission secrétaire | ✅ | ❌ (ne voit pas ses propres règles) | ❌ |
| Planning / Emplois du temps | ✅ | ✅ | ✅ le sien |
| Livres de l'institut | ✅ +ajout | ✅ consultation | ❌ |
| Statistiques | ✅ | ➖ (à décider) | ❌ |
| Notifications | ✅ | ✅ | ➖ |
| Paramètres (tokens, SMTP…) | ✅ | ❌ | ❌ |

**Ajustements menu immédiats** (`src/components/layout/sidebar.tsx`) : ajouter SECRETARY à `Cahier` et `Planning` ; ajouter SECRETARY à `Salaires` (lecture) ; ajouter les nouvelles entrées `Vérification paiements`, `Livres`.

---

## 2. Modèle de données — évolutions Prisma

### 2.1 `Student`
- `gender` → rendre **optionnel** (données Google sans genre) — bloquant pour l'import sinon.
- Conserver `firstName`/`lastName` MAIS prévoir un import depuis un **nom unique** (les Sheets ont un seul champ « Nom de l'élève ») : règle de découpe + champ `displayName` optionnel pour garder le nom brut.
- Ajouter `legacyId String?` (= `EL###` d'origine) pour la traçabilité de migration.
- `subject` → utiliser l'enum des 6 matières (voir 2.6).

### 2.2 Facturation par élève (nouveau)
Les Sheets portent, par ligne élève : nom du payeur + type (`P :` PayPal / `V :` Wise), tarif horaire, nb cours/sem, durée, montant mensuel.
- Ajouter sur `Student` (ou table `StudentBilling`) : `payerName String?`, `paymentType String?` ("PAYPAL"|"WISE"), `hourlyRate Float?`, `lessonsPerWeek Int?`, `duration String?`. (`monthlyFee` existe déjà.)

### 2.3 Pipeline de paiement (machine à états)
Reproduire la colonne « Demande de paiement » + le moteur de matching.
- Sur `LessonSession` : `endedAt DateTime?` (case « Fin de session » cochée), `paymentRequestedAt`, `reminderAt`.
- Sur `Payment` : enrichir le cycle de vie. Statuts cibles : `EXPECTED` (session finie, attendu) → `EMAIL_SENT` → `REMINDED` → `MATCHED` (email détecté) → `CONFIRMED` (validé manuellement) → `REJECTED`. Champs : `expectedAmount`, `receivedAmount`, `expectedPayerName`, `detectedPayerName`, `emailSentAt`, `confirmedAt`, `gmailMessageId`, `sessionNumber`.

### 2.4 File de vérification + paiements groupés (nouveau)
- `PaymentMatch` : un email de paiement détecté (source, montant reçu, nom payeur détecté, gmailMessageId, date, statut `TO_VERIFY|CONFIRMED|REJECTED`, score, remarque).
- `PaymentAllocation` : lien N-N entre un `PaymentMatch` (1 virement) et plusieurs `Payment`/sessions (fratrie, 2 sessions payées d'un coup). **Indispensable** pour les paiements groupés signalés par Idriss.

### 2.5 Salaires & commission
- `TeacherSalary` existe (`hourlyRate`, `hoursWorked`, `totalAmount`). Logique : **nb de cours réellement donnés sur la période × tarif** (= comptage des `Lesson` avec date entre 2 bornes mensuelles). Ajouter `lessonsCount Int?`, `periodStart`, `periodEnd`.
- Nouveau `SecretaryCommission` : `secretaryId`, `month`, `year`, `collectedTotal`, `rate` (0.10), `amount`. Visible directeur uniquement.

### 2.6 Enum matières
`SUBJECTS = ["Coran", "Arabe", "Tajwid", "Nouraniyah", "Moutoun", "Anglais"]` (constante partagée `src/lib/subjects.ts`, mappée depuis les variantes Google).

### 2.7 Livres (nouveau)
- `Book` : `title`, `description`, `fileUrl`/`driveUrl`, `level`, `subject`, `coverUrl`, `isPublic`. Page d'admin (directeur ajoute, secrétaire consulte).

---

## 3. Fonctionnalités à construire (par priorité)

### Lot A — Fondations & permissions (rapide)
1. Schéma Prisma : champs ci-dessus + `prisma db push`.
2. Constante matières + helper WhatsApp (`https://wa.me/<phone>`), normalisation téléphone international (reprendre la logique FR/BE/MA/DZ/TN/Djibouti).
3. Ajustement du gating menu + gardes serveur par rôle.

### Lot B — Migration des données historiques ⭐ (souligné prioritaire par Idriss)
Script d'import lisant les Google Sheets (via le connecteur Drive ou export) :
1. **Profs** : créer 10 `User` (role TEACHER) depuis le registre (nom, WhatsApp, timezone par pays).
2. **Élèves + Groupes** : depuis NEW TDB — recréer `EL###`→Student, `G###`→Group (= onglet prof), forfaits, coordonnées. Réappliquer la dédup (nom prioritaire, homonymes, fratries) et la file `A_VERIFIER`.
3. **Cahiers de cours** : depuis les 10 fiches profs — pour chaque onglet élève actif (avant `⚫️`), créer `LessonSession` (SESSION N) + `Lesson` (Cours N : date, présence Présente/Absente/-, contenu). Statut élève ACTIVE/ARCHIVED selon position vs `⚫️`.
4. **Historique paiements** : depuis RECAP — créer les `Payment` confirmés (date, montant, session, payeur).
5. Rapport d'import (équivalent `RAPPORT_ERREURS_TABLEAUX`).

### Lot C — Cahier de cours & fin de session
1. Page Cahier façon Sheet (sessions → cours, cercles présence cliquables — déjà esquissé).
2. Bouton/Automatisation **« Fin de session »** (prof) → crée un `Payment EXPECTED` + déclenche l'email. Option auto : quand le dernier `Lesson` daté d'une session passe à fait.
3. Génération auto des sessions suivantes (12 d'avance), 1 session = `lessonsPerWeek × 4` cours.

### Lot D — Moteur de paiement (parsing email) ⚠️ REFONTE CRITIQUE

> Retour Idriss : l'ancien matching était **très mauvais** (score additif permissif, une concordance de prénom suffisait, un virement validait plusieurs élèves). Refonte complète obligatoire.
> Décisions : auto **uniquement si 100 % univoque** sinon manuel ; **pas de code de référence** (irréaliste) ; matcher sur **payeur + montant + l'existence d'une demande de paiement réelle**.

**Principe directeur : on ne matche jamais dans le vide.** Un email reçu est confronté à une **dette explicitement réclamée** (un `Payment` en attente, dont la session est finie ET l'email de demande a été envoyé). Pas de demande en cours = pas de match possible.

#### Algorithme (gates durs, pas de score additif)

1. **Intégration Gmail** (OAuth refresh token déjà prévu dans `TenantSettings`).
2. **Job périodique** (cron Vercel) : scan PayPal (`service@paypal.fr`) + Wise (`noreply@wise.com`/perso). Pour chaque email → extraire `detectedPayerName` + `receivedAmount` + date.
3. **Email consommé une seule fois** : `gmailMessageId` verrouillé. Ne peut jamais valider deux élèves indépendamment (sauf allocation groupée explicite et plafonnée).
4. **Constitution des candidats** = `Payment` tels que :
   - statut « demandé » : session finie + `emailSentAt` renseigné (← *le paiement a été demandé*) ;
   - non déjà matché/confirmé ;
   - date de l'email reçu **postérieure** à `emailSentAt` et dans une **fenêtre courte** (ex. 45 j).
5. **Gates DURS pour auto-validation** (les 4 obligatoires) :
   - **Montant** : `receivedAmount == expectedAmount` exact (les frais PayPal gérés comme écart connu/expliqué, jamais comme tolérance floue sur le nom) ;
   - **Nom de famille** du payeur détecté ⊇ nom de famille du payeur attendu (col M) — **le prénom seul ne suffit JAMAIS** ;
   - **Unicité** : exactement **un** candidat satisfait (montant + payeur) ;
   - **Email neuf** (non consommé).
   → Si les 4 passent : auto-confirme (`Payment CONFIRMED`, allocation, email consommé). **Sinon → file de vérification manuelle.**
6. **Paiements groupés** (fratrie / 2 sessions) : si `receivedAmount` = **somme** de plusieurs candidats du **même payeur/contact** → proposition d'**allocation** via `PaymentAllocation`, **jamais auto** : confirmation humaine obligatoire, total alloué ≤ montant reçu.
7. **Page Vérification paiements** (secrétaire) : file des cas non auto-validés, avec pour chaque email le(s) candidat(s) suggéré(s) + **la raison du non-auto** (montant ≠, nom faible, plusieurs candidats, groupé probable). Boutons Confirmer / Rejeter / Allouer (multi).
8. **Emails** : fin de session, **remerciement** (après confirmation), **récap quotidien 8h** (sœurs + institut), rappels.

**Anti-régression à tester** : un virement de 14 € « Mme Diallo » ne doit PAS valider 3 élèves « Diallo » ; un prénom commun (« Fatima ») seul ne valide rien ; un email déjà utilisé ne se réutilise pas.

### Lot E — Salaires & commission
1. Page Salaires : calcul nb cours/période × tarif par prof (secrétaire voit montants).
2. Fiche de paie PDF (jspdf déjà installé).
3. Commission secrétaire 10 % (directeur uniquement).

### Lot F — Compléments
1. Page **Statistiques** (présences, paiements, progression) — fichier à créer.
2. Page **Notifications** — fichier à créer.
3. Page **Livres de l'institut**.
4. **Fiche contact** par élève (tél + lien WhatsApp direct) visible prof/secrétaire/directeur.

### Lot G — Déploiement
- Vercel + Postgres (Neon/Supabase) — migration depuis SQLite. Cron Vercel pour le scan paiements et le récap matinal. Retrait du bouton démo login (en dernier).

---

## 4. Points de vigilance
- **Paiements groupés** (fratries, multi-sessions) = la complexité n°1 → le modèle `PaymentAllocation` doit être posé tôt.
- **Layout TDB définitif** : A=IDProf … R=PaiementManuel (cf. mémoire `madrassa-regles-metier`). Ignorer le vieux mapping décalé de `envoiAutoFinSession`.
- **Dédup élèves** à l'import : reprendre fidèlement l'algo (nom prioritaire, Levenshtein prénom, homonymes si email+tél tous deux différents).
- **Multi-fuseau** profs (TN/DZ/MA/FR) déjà géré par `User.timezone` + `TimeSlot`.
- **1 session = 4 cours/semaine-unité** : bien refléter dans la génération.

---

## 5. Prochaine étape proposée
Commencer par le **Lot A** (schéma + permissions), car il débloque tout le reste, puis enchaîner sur le **Lot B** (migration) qu'Idriss a souligné comme prioritaire.
