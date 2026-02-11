import { IsString, IsNotEmpty, IsInt, IsOptional, IsDateString, Matches } from 'class-validator';

export class CreateReservationDto {
    @IsInt()
    @IsNotEmpty()
    venue_id: number;

    @IsDateString()
    @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'start_time must include timezone offset (Z or +/-HH:mm)' })
    @IsNotEmpty()
    start_time: string;

    @IsDateString()
    @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'end_time must include timezone offset (Z or +/-HH:mm)' })
    @IsNotEmpty()
    end_time: string;

    @IsString()
    @IsNotEmpty()
    activity_name: string;

    @IsString()
    @IsOptional()
    organizer?: string;

    @IsString()
    @IsNotEmpty()
    organizer_unit: string;

    @IsString()
    @IsNotEmpty()
    contact_name: string;

    @IsString()
    @IsNotEmpty()
    contact_phone: string;

    @IsInt()
    @IsNotEmpty()
    attendees_count: number;

    @IsString()
    @IsNotEmpty()
    proposal_content: string;
}
