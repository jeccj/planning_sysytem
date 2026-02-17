import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    async findAll(
        @CurrentUser() user: User,
        @Query('skip') skip: string = '0',
        @Query('limit') limit: string = '100',
    ): Promise<NotificationResponseDto[]> {
        const notifications = await this.notificationsService.findAllForUser(user.id, +skip, +limit);
        return notifications.map(NotificationResponseDto.fromEntity);
    }

    @Get('unread-count')
    async getUnreadCount(@CurrentUser() user: User): Promise<{ count: number }> {
        const count = await this.notificationsService.countUnreadForUser(user.id);
        return { count };
    }

    @Post()
    async create(@Body() createNotificationDto: CreateNotificationDto): Promise<NotificationResponseDto> {
        const n = await this.notificationsService.create(createNotificationDto);
        return NotificationResponseDto.fromEntity(n);
    }

    @Post('send')
    @UseGuards(RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async send(@Body() createNotificationDto: CreateNotificationDto): Promise<NotificationResponseDto> {
        const n = await this.notificationsService.create(createNotificationDto);
        return NotificationResponseDto.fromEntity(n);
    }

    @Put(':id/read')
    async markAsRead(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<NotificationResponseDto> {
        try {
            const n = await this.notificationsService.markAsRead(+id, user.id);
            return NotificationResponseDto.fromEntity(n);
        } catch (error) {
            throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
        }
    }

    @Put('read-all')
    async markAllAsRead(@CurrentUser() user: User): Promise<{ updated: number }> {
        const updated = await this.notificationsService.markAllAsRead(user.id);
        return { updated };
    }

    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<void> {
        try {
            await this.notificationsService.remove(+id, user.id);
        } catch (error) {
            throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
        }
    }
}
