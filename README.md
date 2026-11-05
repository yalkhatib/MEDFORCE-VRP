# MEDFORCE VRP

CRM et SFA pour les **Représentants Pharmaceutiques** (RP) de Cooper Pharma. C'est le pendant de MedForce VM pour les visiteurs médicaux.

- **Back-office web** : référentiels, clients, validation des fiches, saisie et traitement des commandes, planification.
- **Application mobile RP** : fonctionne *offline-first*. Le moteur de synchronisation est livré (`packages/sync-client`). L'interface Expo est prévue au sprint 2.
- **Bases de données** : **PostgreSQL** ou **MS SQL Server**, au choix (`DB_TYPE`).
- **Moteur de conditions commerciales** unique (`packages/core`), exécuté à l'identique sur la tablette, sur le back-office et sur le serveur.

Documentation : [`docs/02-architecture-technique.md`](docs/02-architecture-technique.md) · [`docs/01-benchmark-SOMADIR-propositions-VRP.md`](docs/01-benchmark-SOMADIR-propositions-VRP.md)

## Structure

```
packages/core          Moteur de remises, règles de planification, protocole de sync (TypeScript pur)
packages/sync-client   Synchronisation offline de la tablette (outbox, pull incrémental, calcul local)
apps/api               API NestJS + TypeORM (PostgreSQL / SQL Server), migrations, jeu de démo
apps/backoffice        Back-office React
docs/                  Architecture, benchmark
```

## Démarrage rapide

Prérequis : Node 22, pnpm 10, Docker.

```bash
pnpm install
docker compose up -d postgres            # ou : docker compose up -d mssql
cp apps/api/.env.example apps/api/.env   # ajuster DB_TYPE / DB_* si SQL Server
pnpm --filter @medforce/core --filter @medforce/sync-client build
pnpm db:migrate && pnpm db:seed
pnpm dev:api      # http://localhost:3000/api  (Swagger : /api/docs)
pnpm dev:bo       # http://localhost:5173
```

Pour SQL Server, mettre `DB_TYPE=mssql`, `DB_PORT=1433`, `DB_USER=sa` et `DB_PASSWORD=Medforce_2026!`, puis créer la base `medforce_vrp` avant `db:migrate`.

Comptes de démonstration (mot de passe `Medforce@2026`) :

| Login | Rôle | Périmètre |
|---|---|---|
| `admin` | Administrateur | National |
| `coordinateur` | Coordinateur (back-office) | National, validation des fiches clients |
| `validateur` | Validation des commandes | National |
| `rr.sud` | Responsable régional | Grande région Sud et son équipe |
| `rp1` | RP, mode « secteur » | Inezgane |
| `rp2` | RP, mode « secteur + portefeuille » | Maârif et son portefeuille |

## Tests

```bash
pnpm test                                             # core + sync-client + e2e API (PostgreSQL local)
DB_TYPE=mssql DB_USER=sa DB_PASSWORD=… DB_PORT=1433 TEST_SCHEMA=migrations pnpm --filter @medforce/api test
```

La CI (GitHub Actions) exécute les tests de bout en bout sur **PostgreSQL 16 et SQL Server 2022**.

## Migrations

Il y a une série de migrations par moteur : `apps/api/src/database/migrations/{postgres,mssql}`. Après toute modification d'entité, il faut générer **les deux** :

```bash
pnpm --filter @medforce/api migration:generate:postgres
pnpm --filter @medforce/api migration:generate:mssql
```

Les règles de portabilité (types de colonnes, UUID, dates, JSON) sont décrites au §4 du dossier d'architecture.
