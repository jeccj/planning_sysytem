import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { AnnouncementResponseDto } from './dto/announcement-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { User } from '../users/entities/user.entity';

@Controller('announcements')
export class AnnouncementsController {
    constructor(private readonly announcementsService: AnnouncementsService) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    async findAll(
        @CurrentUser() user: User,
        @Query('skip') skip: string = '0',
        @Query('limit') limit: string = '100',
    ): Promise<AnnouncementResponseDto[]> {
        const announcements = await this.announcementsService.findForRole(user.role, +skip, +limit);
        return announcements.map(a => ({
            id: a.id,
            title: a.title,
            content: a.content,
            publish_time: a.publishTime,
            target_role: a.targetRole,
        }));
    }

    @Get('latest')
    @UseGuards(JwtAuthGuard)
    async findLatest(@CurrentUser() user: User): Promise<AnnouncementResponseDto> {
        const item = await this.announcementsService.findLatestForRole(user.role);
        if (!item) {
            throw new HttpException('Announcement not found', HttpStatus.NOT_FOUND);
        }
        return {
            id: item.id,
            title: item.title,
            content: item.content,
            publish_time: item.publishTime,
            target_role: item.targetRole,
        };
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async create(@Body() createAnnouncementDto: CreateAnnouncementDto): Promise<AnnouncementResponseDto> {
        const a = await this.announcementsService.create(createAnnouncementDto);
        return {
            id: a.id,
            title: a.title,
            content: a.content,
            publish_time: a.publishTime,
            target_role: a.targetRole,
        };
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async update(
        @Param('id') id: string,
        @Body() updateAnnouncementDto: CreateAnnouncementDto,
    ): Promise<AnnouncementResponseDto> {
        try {
            const a = await this.announcementsService.update(+id, updateAnnouncementDto);
            return {
                id: a.id,
                title: a.title,
                content: a.content,
                publish_time: a.publishTime,
                target_role: a.targetRole,
            };
        } catch (error) {
            throw new HttpException('Announcement not found', HttpStatus.NOT_FOUND);
        }
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async remove(@Param('id') id: string): Promise<void> {
        await this.announcementsService.remove(+id);
    }
}
