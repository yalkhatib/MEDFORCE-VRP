import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './options';
import { MOT_DE_PASSE_DEMO, seed } from './seed-data';

/** Charge le jeu de données de démonstration (base vide, migrations exécutées). */
async function main() {
  const ds = await new DataSource(dataSourceOptions()).initialize();
  await seed(ds);
  console.log(`Jeu de démonstration chargé. Comptes : admin, coordinateur, validateur, rr.sud, rp1, rp2 / ${MOT_DE_PASSE_DEMO}`);
  await ds.destroy();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
