# Google Sheets professeurs - mode transition

Ce fichier accompagne `teacher-google-sheets.json`.

Objectif : garder les tableaux Google Sheets des professeurs comme source temporaire pendant la transition, sans bousculer les données déjà chargées dans le SaaS.

## Règles de sécurité

- Pas de synchronisation automatique bidirectionnelle.
- Pas d'écriture directe dans la base sans aperçu des différences.
- Pas de suppression automatique des groupes, élèves, paiements, cahiers ou créneaux déjà créés dans le SaaS.
- Import professeur par professeur.
- Matching strict : un Sheet professeur ne doit mettre à jour que ses groupes, ses élèves, son cahier et son emploi du temps.
- En cas de doute sur une ligne, la ligne doit être signalée dans un rapport et laissée inchangée.

## Flux recommandé

1. Lire le Google Sheet du professeur.
2. Convertir les données en format temporaire.
3. Comparer avec la base SaaS.
4. Générer un rapport : créations, modifications, conflits, lignes ignorées.
5. Appliquer uniquement les changements validés.

## Champs autorisés pendant la transition

- Emploi du temps.
- Cahier de cours.
- Informations de cours visibles côté professeur.
- Lien de classe en ligne si le champ existe dans le Sheet.

## Champs à protéger

- Paiements déjà importés.
- Comptes utilisateurs et mots de passe.
- Onboarding et emails de connexion.
- Documents uploadés dans le SaaS.
- Livres, contrôles et fichiers PDF uploadés dans le SaaS.
