import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { AnnouncementTargetRole } from '../../common/enums';

export class CreateAnnouncementDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsEnum(AnnouncementTargetRole)
    @IsOptional()
    target_role?: AnnouncementTargetRole;

    @IsString()
    @IsOptional()
    scope_building?: string;

    @IsString()
    @IsOptional()
    scope_floor?: string;
}
