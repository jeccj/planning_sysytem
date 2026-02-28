import {
  Controller,
  Post,
  Put,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    await this.authService.assertLoginAllowed();
    const user = await this.authService.validateUser(
      loginDto.username,
      loginDto.password,
    );

    if (!user) {
      throw new HttpException(
        'Incorrect username or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.authService.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  async changePassword(
    @CurrentUser() user: User,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<UserResponseDto> {
    try {
      const updatedUser = await this.authService.changePassword(
        user.id,
        changePasswordDto.old_password,
        changePasswordDto.new_password,
      );

      return {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        is_first_login: updatedUser.isFirstLogin,
        contact_info: updatedUser.contactInfo,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const msg = error.message || 'Password change failed';
      const status = msg.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(msg, status);
    }
  }

  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      await this.authService.forgotPasswordByIdentity(
        forgotPasswordDto.username,
        forgotPasswordDto.identity_last6,
        forgotPasswordDto.new_password,
      );
      return { ok: true, message: 'Password updated' };
    } catch (error) {
      const msg = error.message || 'Password reset failed';
      const status = msg.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(msg, status);
    }
  }
}
