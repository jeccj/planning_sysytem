import { IsString, IsNotEmpty, IsOptional, IsEnum, Length, Matches } from 'class-validator';
import { UserRole } from '../../common/enums';

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    username: string;

    @IsString()
    @IsNotEmpty()
    password: string;

    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;

    @IsString()
    @IsOptional()
    contact_info?: string;

    @IsString()
    @IsOptional()
    @Length(6, 6)
    @Matches(/^\d{6}$/)
    identity_last6?: string;

    @IsString()
    @IsOptional()
    managed_building?: string;

    @IsString()
    @IsOptional()
    managed_floor?: string;
}
