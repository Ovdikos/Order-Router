import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { DomainExceptionFilter } from './orders/filters/domain-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const details = errors.map((err) => ({
          field: err.property,
          reason: Object.values(err.constraints ?? {}).join('; '),
        }));
        return new BadRequestException({ error: 'VALIDATION_FAILED', details });
      },
    }),
  );

  app.useGlobalFilters(new DomainExceptionFilter());

  const port = 3000;
  await app.listen(port);
  Logger.log(`Application is running on port ${port}`, 'Bootstrap');
}

await bootstrap();


