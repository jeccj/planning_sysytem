import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from './entities/user.entity';
import { UserRole } from '../common/enums';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    async getCurrentUser(@CurrentUser() user: User): Promise<UserResponseDto> {
        return UserResponseDto.fromEntity(user);
    }

    @Get()
    @Roles(UserRole.SYS_ADMIN)
    async findAll(): Promise<UserResponseDto[]> {
        const users = await this.usersService.findAll();
        return users.map(UserResponseDto.fromEntity);
    }

    @Get('credentials')
    @Roles(UserRole.SYS_ADMIN)
    async findCredentials(): Promise<Array<{ id: number; username: string; role: UserRole; identity_last6: string }>> {
        const users = await this.usersService.findAll();
        return users.map((user) => ({
            id: user.id,
            username: user.username,
            role: user.role,
            identity_last6: user.identityLast6 || '',
        }));
    }

    @Post()
    @Roles(UserRole.SYS_ADMIN)
    async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
        const user = await this.usersService.create(createUserDto);
        return UserResponseDto.fromEntity(user);
    }

    @Put(':id')
    @Roles(UserRole.SYS_ADMIN)
    async update(
        @Param('id') id: string,
        @Body() updateUserDto: UpdateUserDto,
    ): Promise<UserResponseDto> {
        const user = await this.usersService.update(+id, updateUserDto);
        return UserResponseDto.fromEntity(user);
    }

    @Post(':id/reset-password-identity')
    @Roles(UserRole.SYS_ADMIN)
    async resetPasswordToIdentityLast6(@Param('id') id: string): Promise<{ ok: boolean; message: string }> {
        await this.usersService.resetPasswordToIdentityLast6(+id);
        return { ok: true, message: 'Password has been reset to identity_last6' };
    }

    @Delete(':id')
    @Roles(UserRole.SYS_ADMIN)
    async remove(@Param('id') id: string): Promise<void> {
        await this.usersService.remove(+id);
    }
}
