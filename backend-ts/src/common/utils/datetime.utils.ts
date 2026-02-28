import { BadRequestException } from '@nestjs/common';

const EXPLICIT_TZ_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

export function hasExplicitTimezone(input: string): boolean {
  return EXPLICIT_TZ_PATTERN.test((input || '').trim());
}

export function parseDateTimeWithTimezone(
  input: string,
  fieldName: string,
): Date {
  if (!input || typeof input !== 'string') {
    throw new BadRequestException(`${fieldName} is required`);
  }
  if (!hasExplicitTimezone(input)) {
    throw new BadRequestException(
      `${fieldName} must include timezone offset (Z or +/-HH:mm)`,
    );
  }
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException(`${fieldName} is invalid datetime`);
  }
  return value;
}

export function toUtcIso(value: Date): string {
  return value.toISOString();
}
