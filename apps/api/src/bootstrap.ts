import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configurerApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true }));
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('MEDFORCE VRP API').setVersion('0.1.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('api/docs', app, doc);
  return app;
}
