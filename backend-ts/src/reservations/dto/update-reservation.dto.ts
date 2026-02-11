import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReservationStatus } from '../../common/enums';

export class UpdateReservationDto {
    @IsEnum(ReservationStatus)
    status: ReservationStatus;

    @IsString()
    @IsOptional()
    rejection_reason?: string;
}
