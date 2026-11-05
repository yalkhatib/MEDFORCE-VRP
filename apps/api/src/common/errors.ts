import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export const notFound = (what: string) => new NotFoundException(`${what} introuvable`);
export const badRequest = (message: string, details?: unknown) => new BadRequestException({ message, details });
export const conflict = (message: string, details?: unknown) => new ConflictException({ message, details });
