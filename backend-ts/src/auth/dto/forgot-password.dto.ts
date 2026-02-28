import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[\dXx]{6}$/)
  identity_last6: string;

  @IsString()
  @MinLength(6)
  new_password: string;
}
