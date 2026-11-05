# MEDFORCE VRP – Dossier d'architecture technique

Statut : **validé** (confirmation client du 05/11/2026). Version 1.0.

## 1. Principes directeurs

| Exigence (CDC / ateliers) | Réponse d'architecture |
|---|---|
| Base de données **MS SQL Server ou PostgreSQL** | Une seule base de code, avec un ORM multi-dialecte (TypeORM). Types de colonnes portables. Une série de migrations par dialecte. CI qui teste les deux moteurs |
| Mobile **hors connexion et en ligne** | Approche *offline-first* : base SQLite embarquée, journal des opérations (*outbox*) rejoué de manière idempotente, synchronisation incrémentale par curseur |
| Moteur de remises identique sur le mobile et le back-office | Le moteur est écrit **une seule fois** en TypeScript pur (`packages/core`). Il est exécuté par la tablette hors ligne et revérifié par le serveur à la validation |
| Interfaçage avec **Sage X3** | Écriture **uniquement** par web services X3. Lecture par tables ou vues SQL X3. Adaptateur isolé (`integrations/x3`) avec file d'attente et rejeu |
| Interfaçage avec **MedForce VM** | API REST (médecins à proximité, référentiels partagés : sectorisation, produits, utilisateurs) |
| Livraison des codes sources | Monorepo complet : scripts de build, migrations, documentation et jeu de données de démonstration |

### Écart assumé avec le CDC

Le CDC demande que le calcul des remises soit placé dans une procédure stockée SQL. Ce choix obligerait à maintenir deux procédures (T-SQL et PL/pgSQL) et un troisième moteur sur la tablette pour le mode offline. Nous retenons donc un **moteur unique en TypeScript**, versionné et couvert par des tests unitaires, qui sert sur les trois points d'exécution. Pour la maintenance, l'objectif du CDC est atteint : les règles sont centralisées, tracées et testées.

## 2. Vue d'ensemble

```
┌───────────────────────┐     HTTPS/JSON      ┌──────────────────────────────────────┐
│ App mobile RP         │ ◄────────────────► │ API MEDFORCE VRP (NestJS)             │
│ React Native (Expo)   │  /sync/pull /push   │  ├─ Auth JWT, profils, périmètres    │
│ SQLite + outbox       │                     │  ├─ Modules métier                   │
│ @medforce/core        │                     │  ├─ Sync (curseur + outbox idempot.)│
└───────────────────────┘                     │  ├─ @medforce/core (revalidation)   │
┌───────────────────────┐                     │  └─ Intégrations X3 / MedForce VM   │
│ Back-office web       │ ◄─────────────────► │          │                │          │
│ React + Vite          │      REST /api      └──────────┼────────────────┼──────────┘
└───────────────────────┘                                │ TypeORM        │ WS X3 (écriture)
                                              ┌──────────▼──────┐  ┌──────▼─────────────┐
                                              │ SQL Server  OU  │  │ Sage X3            │
                                              │ PostgreSQL      │  │ (vues SQL lecture) │
                                              └─────────────────┘  └────────────────────┘
```

## 3. Stack retenue

| Couche | Technologie | Justification |
|---|---|---|
| Langage | TypeScript (strict) partout | Une seule logique métier partagée entre le mobile, l'API et le back-office |
| Monorepo | pnpm workspaces | Paquets partagés, builds reproductibles |
| API | Node 22 LTS, NestJS 10, class-validator, OpenAPI (Swagger) | Architecture modulaire, injection de dépendances, documentation d'API générée |
| ORM | TypeORM 0.3 (`postgres` / `mssql`) | Mêmes entités pour les deux moteurs, migrations par dialecte |
| Back-office | React 18, Vite, React Router, TanStack Query | Interface rapide, reprenant l'ergonomie MedForce |
| Mobile | React Native / Expo, expo-sqlite | Android/iOS, tablettes et smartphones, fonctionnement hors ligne |
| Tests | Vitest (core), Jest et Supertest (API e2e) | Le moteur de remises est couvert par des cas issus du CDC |
| CI | GitHub Actions avec services PostgreSQL 16 **et** SQL Server 2022 | Garantit la double compatibilité |

## 4. Portabilité SQL Server / PostgreSQL

Règles de codage imposées dans `apps/api/src/database/columns.ts` :

- **Clés primaires** : `uuid`. TypeORM les mappe en `uniqueidentifier` (MSSQL) ou `uuid` (PG). Les identifiants sont **générés côté client**, condition nécessaire pour créer des données hors ligne.
- **Dates** : `datetime2` (MSSQL) ou `timestamptz` (PG), via l'helper `DateTimeColumn`. Le type `timestamp` est interdit, car il désigne `rowversion` sous MSSQL.
- **Montants** : `decimal(18,4)` et quantités `decimal(18,3)`. Le type `float` est interdit.
- **JSON** : `simple-json` (texte) uniquement. Pas de type `jsonb` ni d'opérateurs JSON dans les requêtes.
- **Chaînes** : `varchar(n)` borné. TypeORM utilise `nvarchar` sous MSSQL pour les accents.
- **Pas d'`enum` SQL** : codes `varchar` contrôlés par l'application (constantes dans `@medforce/core`).
- **Pas de SQL brut spécifique** hors de `database/dialect.ts`, qui centralise par exemple la pagination et le `ILIKE` / `LIKE COLLATE`.
- **Booléens** : `boolean`, mappé en `bit` sous MSSQL.

## 5. Synchronisation offline

### 5.1 Modèle

Chaque entité synchronisable hérite de `SyncEntity` :

| Colonne | Rôle |
|---|---|
| `id` (uuid) | Généré par l'émetteur, mobile ou serveur |
| `version` (int) | Incrémentée à chaque écriture. Sert au contrôle de concurrence optimiste |
| `syncSeq` (bigint) | Numéro de séquence serveur, monotone sur toute la base. C'est le **curseur de pull** |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | Audit |
| `deletedAt` | Suppression logique, propagée aux tablettes |

Le `syncSeq` est attribué par le serveur au moment de l'écriture (table `sync_sequence`, verrou court). Contrairement à un horodatage, il est insensible aux dérives d'horloge et ne perd aucune modification.

### 5.2 Pull : du serveur vers la tablette

`GET /api/sync/pull?cursor=<n>&limit=<m>` renvoie, **filtrées par le périmètre du RP** (secteurs affectés et/ou portefeuille, selon le paramètre utilisateur demandé dans la Gap Analysis), toutes les lignes dont `syncSeq > cursor`, triées par `syncSeq`, avec le nouveau curseur et un indicateur `hasMore`. Si un client sort du périmètre du RP, une *tombstone* lui est envoyée.

### 5.3 Push : de la tablette vers le serveur

La tablette accumule des **opérations** dans une outbox locale : `{opId, entity, action, id, baseVersion, payload, clientTime}`.
`POST /api/sync/push` les applique dans l'ordre :

- **Idempotence** : chaque `opId` est mémorisé dans la table `sync_operation`. Un rejeu renvoie le même résultat.
- **Résolution des conflits** par type de donnée :
  - *Documents du RP* (visites, commandes au statut Brouillon ou Confirmée, règlements, réclamations) : le RP est propriétaire. Ses modifications s'appliquent tant que le serveur n'a pas fait avancer le statut, par exemple une commande « En cours » de traitement. Au-delà, l'opération est **rejetée avec motif** et la tablette reçoit la version serveur.
  - *Fiche client* : jamais écrasée directement. Les modifications produisent une **demande de modification** qui suit le workflow de validation, avec l'ancienne et la nouvelle valeur.
  - *Référentiels* (produits, packs, secteurs) : lecture seule sur le mobile, le serveur fait foi.
- **Revalidation serveur** : toute commande confirmée est recalculée par `@medforce/core` avec les packs en vigueur. Un écart est signalé au lieu d'être corrigé silencieusement.

### 5.4 Numérotation hors ligne

Les documents reçoivent un numéro provisoire `<codeRP>-<AAMMJJ>-<seq locale>` sur la tablette, puis un numéro définitif attribué par le serveur à la réception.

## 6. Sécurité

- Authentification par login et mot de passe (bcrypt), puis par code PIN sur le mobile. Le JWT d'accès dure 15 minutes et le jeton de rafraîchissement 30 jours, avec rotation. La révocation de la tablette déclenche l'effacement des données locales.
- Autorisation à trois niveaux : **rôle → permissions** (menus et actions), **périmètre de données** (secteurs, portefeuille, hiérarchie récursive) et droits distincts de création, validation et transfert vers X3.
- Audit au niveau du champ (`audit_log`) pour les entités sensibles.
- HTTPS obligatoire, secrets fournis par variables d'environnement, comptes verrouillés après N échecs.

## 7. Intégrations

| Flux | Sens | Mode |
|---|---|---|
| Clients | X3 ↔ VRP | Lecture : vue X3 incrémentale (date de modification). Écriture : web service X3, rapprochement par code interne |
| Produits, gammes, prix, stock, péremption | X3 → VRP | Lecture planifiée par vues SQL |
| Commandes validées | VRP → X3 | Web service. Le n° de commande X3 est récupéré en retour |
| BL, factures, CA facturé, créances, impayés | X3 → VRP | Lecture planifiée par vues SQL |
| Médecins à proximité, référentiels partagés | MedForce VM → VRP | API REST |

Tous les flux passent par une table `integration_job` (statut, tentatives, erreur) visible dans la console de supervision.

## 8. Arborescence du dépôt

```
apps/
  api/          API NestJS (+ migrations postgres/ et mssql/)
  backoffice/   Back-office React
  mobile/       Application RP (Expo)   ← sprint 2
packages/
  core/         Types, constantes, moteur de remises, règles de planification
docs/
```

## 9. Environnements

| Environnement | Base | Usage |
|---|---|---|
| Développement | PostgreSQL local (ou SQL Server via Docker) | Développement |
| CI | PostgreSQL 16 + SQL Server 2022 | Tests automatiques sur les deux moteurs |
| Recette, production | Au choix de Cooper Pharma | Variable `DB_TYPE=postgres\|mssql` |
