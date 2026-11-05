import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurerApp } from './bootstrap';

async function main() {
  const app = configurerApp(await NestFactory.create(AppModule));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`MEDFORCE VRP API : http://localhost:${port}/api (docs : /api/docs)`);
}
main();
