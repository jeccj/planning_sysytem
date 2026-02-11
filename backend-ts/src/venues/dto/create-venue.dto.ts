import { IsString, IsNotEmpty, IsInt, IsArray, IsOptional, IsEnum } from 'class-validator';
import { VenueStatus } from '../../common/enums';

export class CreateVenueDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    type: string;

    @IsInt()
    @IsNotEmpty()
    capacity: number;

    @IsString()
    @IsOptional()
    location: string;

    @IsString()
    @IsOptional()
    building_name?: string;

    @IsString()
    @IsOptional()
    floor_label?: string;

    @IsString()
    @IsOptional()
    room_code?: string;

    @IsArray()
    @IsString({ each: true })
    facilities: string[];

    @IsEnum(VenueStatus)
    @IsOptional()
    status?: VenueStatus;

    @IsString()
    @IsOptional()
    image_url?: string;

    @IsString()
    @IsOptional()
    open_hours?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @IsOptional()
    admin_id?: number;
}
