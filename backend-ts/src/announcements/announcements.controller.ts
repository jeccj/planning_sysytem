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
        const announcements = await this.announcementsService.findForRole(user.role, +skip, +limit, {
            managedBuilding: user.managedBuilding,
            managedFloor: user.managedFloor,
        });
        return announcements.map(AnnouncementResponseDto.fromEntity);
    }

    @Get('latest')
    @UseGuards(JwtAuthGuard)
    async findLatest(@CurrentUser() user: User): Promise<AnnouncementResponseDto> {
        const item = await this.announcementsService.findLatestForRole(user.role, {
            managedBuilding: user.managedBuilding,
            managedFloor: user.managedFloor,
        });
        if (!item) {
            throw new HttpException('Announcement not found', HttpStatus.NOT_FOUND);
        }
        return AnnouncementResponseDto.fromEntity(item);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async create(@Body() createAnnouncementDto: CreateAnnouncementDto): Promise<AnnouncementResponseDto> {
        const a = await this.announcementsService.create(createAnnouncementDto);
        return AnnouncementResponseDto.fromEntity(a);
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
            return AnnouncementResponseDto.fromEntity(a);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            if (error.message === 'Announcement not found') {
                throw new HttpException('Announcement not found', HttpStatus.NOT_FOUND);
            }
            throw new HttpException(error.message || 'Update failed', HttpStatus.BAD_REQUEST);
        }
    }

    @Delete('history/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async clearAllHistory(): Promise<{ ok: boolean; deleted: number }> {
        const deleted = await this.announcementsService.clearAllHistory();
        return {
            ok: true,
            deleted,
        };
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async remove(@Param('id') id: string): Promise<void> {
        await this.announcementsService.remove(+id);
    }
}
