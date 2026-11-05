import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './common/auth';

@Controller('health')
export class HealthController {
  constructor(private readonly ds: DataSource) {}

  @Public() @Get()
  async health() {
    await this.ds.query('SELECT 1');
    return { status: 'ok', db: this.ds.options.type, time: new Date().toISOString() };
  }
}
