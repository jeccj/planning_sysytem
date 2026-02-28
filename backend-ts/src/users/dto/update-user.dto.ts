import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { UserRole } from '../../common/enums';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  contact_info?: string;

  @IsString()
  @IsOptional()
  @Length(6, 6)
  @Matches(/^[\dXx]{6}$/)
  identity_last6?: string;

  @IsString()
  @IsOptional()
  managed_building?: string;

  @IsString()
  @IsOptional()
  managed_floor?: string;
}
