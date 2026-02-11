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
        return notifications.map(n => ({
            id: n.id,
            user_id: n.userId,
            title: n.title,
            content: n.content,
            is_read: n.isRead,
            created_at: n.createdAt,
            notification_type: n.notificationType,
        }));
    }

    @Get('unread-count')
    async getUnreadCount(@CurrentUser() user: User): Promise<{ count: number }> {
        const count = await this.notificationsService.countUnreadForUser(user.id);
        return { count };
    }

    @Post()
    async create(@Body() createNotificationDto: CreateNotificationDto): Promise<NotificationResponseDto> {
        // Note: Usually notifications are created by system events (venue change, etc), but API allows manual creation too
        const n = await this.notificationsService.create(createNotificationDto);
        return {
            id: n.id,
            user_id: n.userId,
            title: n.title,
            content: n.content,
            is_read: n.isRead,
            created_at: n.createdAt,
            notification_type: n.notificationType,
        };
    }

    @Post('send')
    @UseGuards(RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async send(@Body() createNotificationDto: CreateNotificationDto): Promise<NotificationResponseDto> {
        const n = await this.notificationsService.create(createNotificationDto);
        return {
            id: n.id,
            user_id: n.userId,
            title: n.title,
            content: n.content,
            is_read: n.isRead,
            created_at: n.createdAt,
            notification_type: n.notificationType,
        };
    }

    @Put(':id/read')
    async markAsRead(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<NotificationResponseDto> {
        try {
            const n = await this.notificationsService.markAsRead(+id, user.id);
            return {
                id: n.id,
                user_id: n.userId,
                title: n.title,
                content: n.content,
                is_read: n.isRead,
                created_at: n.createdAt,
                notification_type: n.notificationType,
            };
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
