import { IsString, IsNotEmpty, IsInt, IsArray, IsOptional, IsEnum, Min } from 'class-validator';
import { VenueStatus } from '../../common/enums';

export class UpdateVenueDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    type?: string;

    @IsInt()
    @Min(1)
    @IsOptional()
    capacity?: number;

    @IsString()
    @IsOptional()
    location?: string;

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
    @IsOptional()
    facilities?: string[];

    @IsEnum(VenueStatus)
    @IsOptional()
    status?: VenueStatus;

    @IsString()
    @IsOptional()
    image_url?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    photos?: string[];

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
