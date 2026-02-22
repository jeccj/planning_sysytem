import { IsString, IsNotEmpty } from 'class-validator';

export class ScheduleMaintenanceDto {
    @IsString()
    @IsNotEmpty()
    start: string;

    @IsString()
    @IsNotEmpty()
    end: string;

    @IsString()
    @IsNotEmpty()
    reason: string;
}
