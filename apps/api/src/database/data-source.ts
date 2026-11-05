import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './options';

/** DataSource utilisée par la CLI TypeORM (migrations). */
export default new DataSource(dataSourceOptions());
