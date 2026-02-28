import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, resolve } from 'path';
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
import { ReservationStatus } from '../common/enums';
import {
  CreateBatchReservationDto,
  CreateRecurringReservationDto,
} from './dto/create-recurring-reservation.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @CurrentUser() user: User,
    @Query('skip') skip: string = '0',
    @Query('limit') limit: string = '100',
    @Query('status') status?: string,
  ): Promise<ReservationResponseDto[]> {
    const filter: Record<string, any> = {};
    const managedBuilding = (user.managedBuilding || '').trim();
    const managedFloor = (user.managedFloor || '').trim();

    if (
      user.role === UserRole.VENUE_ADMIN ||
      user.role === UserRole.FLOOR_ADMIN
    ) {
      filter.buildingName =
        managedBuilding || (managedFloor ? undefined : '__NO_SCOPE__');
      filter.floorLabel = managedFloor || undefined;
    } else if (user.role !== UserRole.SYS_ADMIN) {
      // Non-admin roles must only see their own reservations.
      filter.userId = user.id;
    }

    // Add status filter if provided
    if (
      status &&
      Object.values(ReservationStatus).includes(status as ReservationStatus)
    ) {
      filter.status = status as ReservationStatus;
    }
    const reservations = await this.reservationsService.findAll(
      +skip,
      +limit,
      filter,
    );
    return reservations.map(ReservationResponseDto.fromEntity);
  }

  @Post('batch')
  @UseGuards(JwtAuthGuard)
  async createBatch(
    @CurrentUser() user: User,
    @Body() createBatchReservationDto: CreateBatchReservationDto,
  ) {
    return this.reservationsService.createBatch(
      createBatchReservationDto,
      user.id,
    );
  }

  @Post('recurring')
  @UseGuards(JwtAuthGuard)
  async createRecurring(
    @CurrentUser() user: User,
    @Body() createRecurringReservationDto: CreateRecurringReservationDto,
  ) {
    return this.reservationsService.createRecurring(
      createRecurringReservationDto,
      user.id,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadDir = resolve(__dirname, '..', '..', 'uploads');
          mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|png|jpg|jpeg)$/i;
        if (!allowed.test(file.originalname)) {
          return cb(
            new (require('@nestjs/common').HttpException)(
              '不支持的文件类型',
              400,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async create(
    @CurrentUser() user: User,
    @Body() createReservationDto: CreateReservationDto,
    @UploadedFile() file: any,
  ): Promise<ReservationResponseDto> {
    let proposalUrl: string | undefined = undefined;
    if (file) {
      proposalUrl = `/uploads/${file.filename}`;
    }

    const res = await this.reservationsService.create(
      createReservationDto,
      user.id,
      proposalUrl,
    );
    return ReservationResponseDto.fromEntity(res);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ): Promise<ReservationResponseDto> {
    try {
      const res = await this.reservationsService.updateStatus(
        +id,
        updateReservationDto,
        {
          id: user.id,
          role: user.role,
          managedBuilding: user.managedBuilding,
          managedFloor: user.managedFloor,
        },
      );
      return ReservationResponseDto.fromEntity(res);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Reservation update failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    const reservation = await this.reservationsService.findOne(+id);
    if (!reservation) {
      throw new HttpException('Reservation not found', HttpStatus.NOT_FOUND);
    }
    // Scope check for non-sys-admin
    if (user.role !== UserRole.SYS_ADMIN) {
      this.reservationsService.assertActorScope(
        {
          id: user.id,
          role: user.role,
          managedBuilding: user.managedBuilding,
          managedFloor: user.managedFloor,
        },
        reservation,
      );
    }
    await this.reservationsService.remove(+id);
  }
}
