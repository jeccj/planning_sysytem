import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpException, HttpStatus, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../common/enums';
import { CreateBatchReservationDto, CreateRecurringReservationDto } from './dto/create-recurring-reservation.dto';

@Controller('reservations')
export class ReservationsController {
    constructor(private readonly reservationsService: ReservationsService) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    async findAll(
        @CurrentUser() user: User,
        @Query('skip') skip: string = '0',
        @Query('limit') limit: string = '100',
    ): Promise<ReservationResponseDto[]> {
        const filter = user.role === UserRole.VENUE_ADMIN
            ? {
                buildingName: (user.managedBuilding || '').trim() || (((user.managedFloor || '').trim()) ? undefined : '__NO_SCOPE__'),
                floorLabel: (user.managedFloor || '').trim() || undefined,
            }
            : (user.role === UserRole.FLOOR_ADMIN
                ? {
                    buildingName: (user.managedBuilding || '').trim() || (((user.managedFloor || '').trim()) ? undefined : '__NO_SCOPE__'),
                    floorLabel: (user.managedFloor || '').trim() || undefined,
                }
                : (user.role === UserRole.STUDENT_TEACHER ? { userId: user.id } : undefined));
        const reservations = await this.reservationsService.findAll(+skip, +limit, filter);
        return reservations.map(res => ({
            id: res.id,
            user_id: res.userId,
            venue_id: res.venueId,
            start_time: res.startTime,
            end_time: res.endTime,
            activity_name: res.activityName,
            organizer: res.organizer,
            organizer_unit: res.organizerUnit,
            contact_name: res.contactName,
            contact_phone: res.contactPhone,
            attendees_count: res.attendeesCount,
            proposal_content: res.proposalContent,
            proposal_url: res.proposalUrl,
            status: res.status,
            rejection_reason: res.rejectionReason,
            ai_risk_score: res.aiRiskScore,
            ai_audit_comment: res.aiAuditComment,
        }));
    }

    @Post('batch')
    @UseGuards(JwtAuthGuard)
    async createBatch(
        @CurrentUser() user: User,
        @Body() createBatchReservationDto: CreateBatchReservationDto,
    ) {
        return this.reservationsService.createBatch(createBatchReservationDto, user.id);
    }

    @Post('recurring')
    @UseGuards(JwtAuthGuard)
    async createRecurring(
        @CurrentUser() user: User,
        @Body() createRecurringReservationDto: CreateRecurringReservationDto,
    ) {
        return this.reservationsService.createRecurring(createRecurringReservationDto, user.id);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: './uploads',
            filename: (req, file, cb) => {
                const randomName = Array(32).fill(null).map(() => (Math.round(Math.random() * 16)).toString(16)).join('');
                cb(null, `${randomName}${extname(file.originalname)}`);
            }
        })
    }))
    async create(
        @CurrentUser() user: User,
        @Body() createReservationDto: CreateReservationDto,
        @UploadedFile() file: any,
    ): Promise<ReservationResponseDto> {
        let proposalUrl: string | undefined = undefined;
        if (file) {
            proposalUrl = `/uploads/${file.filename}`;
        }

        const res = await this.reservationsService.create(createReservationDto, user.id, proposalUrl);
        return {
            id: res.id,
            user_id: res.userId,
            venue_id: res.venueId,
            start_time: res.startTime,
            end_time: res.endTime,
            activity_name: res.activityName,
            organizer: res.organizer,
            organizer_unit: res.organizerUnit,
            contact_name: res.contactName,
            contact_phone: res.contactPhone,
            attendees_count: res.attendeesCount,
            proposal_content: res.proposalContent,
            proposal_url: res.proposalUrl,
            status: res.status,
            rejection_reason: res.rejectionReason,
            ai_risk_score: res.aiRiskScore,
            ai_audit_comment: res.aiAuditComment,
        };
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard)
    async update(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() updateReservationDto: UpdateReservationDto,
    ): Promise<ReservationResponseDto> {
        try {
            const res = await this.reservationsService.updateStatus(+id, updateReservationDto, {
                id: user.id,
                role: user.role,
                managedBuilding: user.managedBuilding,
                managedFloor: user.managedFloor,
            });
            return {
                id: res.id,
                user_id: res.userId,
                venue_id: res.venueId,
                start_time: res.startTime,
                end_time: res.endTime,
                activity_name: res.activityName,
                organizer: res.organizer,
                organizer_unit: res.organizerUnit,
                contact_name: res.contactName,
                contact_phone: res.contactPhone,
                attendees_count: res.attendeesCount,
                proposal_content: res.proposalContent,
                proposal_url: res.proposalUrl,
                status: res.status,
                rejection_reason: res.rejectionReason,
                ai_risk_score: res.aiRiskScore,
                ai_audit_comment: res.aiAuditComment,
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(error.message || 'Reservation update failed', HttpStatus.BAD_REQUEST);
        }
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async remove(@Param('id') id: string): Promise<void> {
        await this.reservationsService.remove(+id);
    }
}
