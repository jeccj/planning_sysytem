import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export enum RecurrenceFrequency {
    DAILY = 'daily',
    WEEKLY = 'weekly',
}

export class RecurrenceRuleDto {
    @IsEnum(RecurrenceFrequency)
    frequency: RecurrenceFrequency;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    @Max(12)
    @IsOptional()
    interval?: number;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    @Max(120)
    @IsOptional()
    occurrences?: number;

    @IsDateString()
    @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'until must include timezone offset (Z or +/-HH:mm)' })
    @IsOptional()
    until?: string;

    @IsArray()
    @Type(() => Number)
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(6, { each: true })
    @IsOptional()
    week_days?: number[];
}

export class CreateRecurringReservationDto {
    @IsInt()
    @Type(() => Number)
    venue_id: number;

    @IsDateString()
    @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'start_time must include timezone offset (Z or +/-HH:mm)' })
    start_time: string;

    @IsDateString()
    @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'end_time must include timezone offset (Z or +/-HH:mm)' })
    end_time: string;

    @IsString()
    activity_name: string;

    @IsString()
    @IsOptional()
    organizer?: string;

    @IsString()
    organizer_unit: string;

    @IsString()
    contact_name: string;

    @IsString()
    contact_phone: string;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    attendees_count: number;

    @IsString()
    proposal_content: string;

    @IsString()
    @IsOptional()
    activity_description?: string;

    @ValidateNested()
    @Type(() => RecurrenceRuleDto)
    recurrence: RecurrenceRuleDto;
}

export class CreateBatchReservationItemDto {
    @IsInt()
    @Type(() => Number)
    venue_id: number;

    @IsDateString()
    @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'start_time must include timezone offset (Z or +/-HH:mm)' })
    start_time: string;

    @IsDateString()
    @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'end_time must include timezone offset (Z or +/-HH:mm)' })
    end_time: string;

    @IsString()
    activity_name: string;

    @IsString()
    @IsOptional()
    organizer?: string;

    @IsString()
    organizer_unit: string;

    @IsString()
    contact_name: string;

    @IsString()
    contact_phone: string;

    @IsInt()
    @Type(() => Number)
    @Min(1)
    attendees_count: number;

    @IsString()
    proposal_content: string;

    @IsString()
    @IsOptional()
    activity_description?: string;
}

export class CreateBatchReservationDto {
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => CreateBatchReservationItemDto)
    items: CreateBatchReservationItemDto[];

    @Type(() => Boolean)
    @IsOptional()
    all_or_nothing?: boolean;
}
