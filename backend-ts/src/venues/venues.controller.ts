import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpException, HttpStatus, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { ScheduleMaintenanceDto } from './dto/schedule-maintenance.dto';
import { VenueResponseDto } from './dto/venue-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../common/enums';
import { LlmService } from '../llm/llm.service';
import { parseVenueLocation } from './utils/location-utils';

@Controller('venues')
export class VenuesController {
    constructor(
        private readonly venuesService: VenuesService,
        private readonly llmService: LlmService,
    ) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    async findAll(
        @CurrentUser() user: User,
        @Query('skip') skip: string = '0',
        @Query('limit') limit: string = '100'
    ): Promise<VenueResponseDto[]> {
        const scope = this.buildVenueScope(user);
        const venues = await this.venuesService.findAll(+skip, +limit, scope);
        const occupiedIds = await this.venuesService.getOccupiedVenueIds(venues.map(v => v.id));
        return venues.map(v => ({
            ...this.toResponseDto(v),
            is_reserved: occupiedIds.has(v.id),
        }));
    }

    @Get('structure')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async getVenueStructure(@CurrentUser() user: User) {
        const scope = this.buildVenueScope(user);
        return this.venuesService.getVenueStructure(scope);
    }

    @Get('building-availability')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN, UserRole.STUDENT_TEACHER)
    async getBuildingAvailability(
        @CurrentUser() user: User,
        @Query('building') building?: string,
    ) {
        const scope = this.buildVenueScope(user);
        return this.venuesService.getBuildingAvailability(building, scope);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN)
    async create(
        @CurrentUser() user: User,
        @Body() createVenueDto: CreateVenueDto,
    ): Promise<VenueResponseDto> {
        const assignedAdminId = user.role === UserRole.SYS_ADMIN && createVenueDto.admin_id
            ? Number(createVenueDto.admin_id)
            : user.id;
        const venue = await this.venuesService.create(createVenueDto, assignedAdminId);
        return this.toResponseDto(venue);
    }

    @Get('search')
    @UseGuards(JwtAuthGuard)
    async search(@Query('q') q: string): Promise<VenueResponseDto[]> {
        // 1. AI Parsing
        const intent = await this.llmService.parseIntent(q);

        console.log(`AI Search Intent: ${JSON.stringify(intent)}`);

        // 2. Build date/time from intent, with sensible fallback
        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        if (intent.date && intent.time_range?.length === 2) {
            const [startHM, endHM] = intent.time_range;
            startDate = new Date(`${intent.date}T${startHM}:00`);
            endDate = new Date(`${intent.date}T${endHM}:00`);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() + 1);
                startDate.setHours(14, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setHours(startDate.getHours() + 2);
            }
        } else if (intent.date) {
            startDate = new Date(`${intent.date}T08:00:00`);
            endDate = new Date(`${intent.date}T22:00:00`);
            if (isNaN(startDate.getTime())) {
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() + 1);
                startDate.setHours(8, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setHours(22, 0, 0, 0);
            }
        } else {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() + 1);
            startDate.setHours(14, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setHours(startDate.getHours() + 2);
        }

        const capacity = intent.capacity || 1;
        const facilities = intent.facilities || [];
        const keywords = intent.keywords || [];
        const venueType = intent.type;

        const results = await this.venuesService.search(
            capacity,
            startDate,
            endDate,
            facilities,
            keywords,
            venueType
        );

        return results.map(item => ({
            ...this.toResponseDto(item.venue),
            match_details: item.matchDetails,
            score: item.score
        }));
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    async findOne(@Param('id') id: string): Promise<VenueResponseDto> {
        const venue = await this.venuesService.findOne(+id);
        if (!venue) {
            throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
        }
        return this.toResponseDto(venue);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async update(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() updateVenueDto: UpdateVenueDto,
    ): Promise<VenueResponseDto> {
        try {
            const existing = await this.venuesService.findOne(+id);
            if (!existing) {
                throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
            }
            this.assertScopedAdminVenueAccess(user, existing);
            this.assertScopedAdminVenuePayload(user, updateVenueDto, existing);
            if (user.role !== UserRole.SYS_ADMIN) {
                updateVenueDto.admin_id = undefined;
            }
            const venue = await this.venuesService.update(+id, updateVenueDto);
            return this.toResponseDto(venue);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
        }
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async remove(@CurrentUser() user: User, @Param('id') id: string): Promise<VenueResponseDto> {
        try {
            const existing = await this.venuesService.findOne(+id);
            if (!existing) {
                throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
            }
            this.assertScopedAdminVenueAccess(user, existing);
            const venue = await this.venuesService.remove(+id);
            return this.toResponseDto(venue);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
        }
    }

    @Post(':id/photos')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    @UseInterceptors(FilesInterceptor('photos', 10, {
        storage: diskStorage({
            destination: './uploads/venues',
            filename: (_req, file, cb) => {
                const rand = Array(24).fill(null).map(() => Math.round(Math.random() * 16).toString(16)).join('');
                cb(null, `${rand}${extname(file.originalname)}`);
            },
        }),
        fileFilter: (_req, file, cb) => {
            if (!file.mimetype.match(/^image\//)) {
                return cb(new HttpException('仅允许上传图片文件', HttpStatus.BAD_REQUEST), false);
            }
            cb(null, true);
        },
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }))
    async uploadPhotos(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @UploadedFiles() files: Array<Express.Multer.File>,
    ): Promise<VenueResponseDto> {
        const venue = await this.venuesService.findOne(+id);
        if (!venue) throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
        this.assertScopedAdminVenueAccess(user, venue);
        const newUrls = (files || []).map(f => `/uploads/venues/${f.filename}`);
        const existingPhotos: string[] = Array.isArray(venue.photos) ? venue.photos : [];
        const updated = await this.venuesService.update(+id, { photos: [...existingPhotos, ...newUrls] } as any);
        return this.toResponseDto(updated);
    }

    @Delete(':id/photos')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async deletePhoto(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body('url') url: string,
    ): Promise<VenueResponseDto> {
        const venue = await this.venuesService.findOne(+id);
        if (!venue) throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
        this.assertScopedAdminVenueAccess(user, venue);
        const existingPhotos: string[] = Array.isArray(venue.photos) ? venue.photos : [];
        if (!existingPhotos.includes(url)) {
            throw new HttpException('Photo URL not found on this venue', HttpStatus.BAD_REQUEST);
        }
        const filtered = existingPhotos.filter(p => p !== url);
        const updated = await this.venuesService.update(+id, { photos: filtered } as any);
        // Best-effort delete file from disk — only allow files under /uploads/venues/
        try {
            if (url.startsWith('/uploads/venues/') && !url.includes('..')) {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '..', '..', url);
                const uploadsDir = path.resolve(path.join(__dirname, '..', '..', 'uploads', 'venues'));
                const resolvedPath = path.resolve(filePath);
                if (resolvedPath.startsWith(uploadsDir) && fs.existsSync(resolvedPath)) {
                    fs.unlinkSync(resolvedPath);
                }
            }
        } catch { /* ignore */ }
        return this.toResponseDto(updated);
    }

    private toResponseDto(venue: any): VenueResponseDto {
        const parsedLocation = parseVenueLocation(venue.location, venue.name);
        return {
            id: venue.id,
            name: venue.name,
            type: venue.type,
            capacity: venue.capacity,
            location: venue.location,
            building_name: venue.buildingName || parsedLocation.buildingName,
            floor_label: venue.floorLabel || parsedLocation.floorLabel,
            room_name: venue.roomCode || parsedLocation.roomName,
            room_code: venue.roomCode || parsedLocation.roomName,
            facilities: typeof venue.facilities === 'string' ? JSON.parse(venue.facilities) : venue.facilities,
            status: venue.status,
            image_url: venue.imageUrl,
            photos: Array.isArray(venue.photos) ? venue.photos : [],
            open_hours: venue.openHours,
            description: venue.description,
            admin_id: venue.adminId,
        };
    }

    @Post(':id/maintenance')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async scheduleMaintenance(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() body: ScheduleMaintenanceDto,
    ) {
        try {
            const existing = await this.venuesService.findOne(+id);
            if (!existing) {
                throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
            }
            this.assertScopedAdminVenueAccess(user, existing);
            return await this.venuesService.scheduleMaintenance(
                +id,
                body.start,
                body.end,
                body.reason
            );
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    private assertScopedAdminVenueAccess(user: User, venue: any) {
        if (user.role === UserRole.SYS_ADMIN) {
            return;
        }
        if (![UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN].includes(user.role)) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }
        const parsed = parseVenueLocation(venue.location, venue.name);
        const venueBuilding = venue.buildingName || parsed.buildingName;
        const venueFloor = venue.floorLabel || parsed.floorLabel;
        const requiredBuilding = (user.managedBuilding || '').trim();
        const requiredFloor = (user.managedFloor || '').trim();
        if (!requiredBuilding && !requiredFloor) {
            throw new HttpException('Admin scope is not configured', HttpStatus.FORBIDDEN);
        }
        if (requiredBuilding && requiredBuilding !== venueBuilding) {
            throw new HttpException('No permission for this building', HttpStatus.FORBIDDEN);
        }
        if (requiredFloor && requiredFloor !== venueFloor) {
            throw new HttpException('No permission for this floor', HttpStatus.FORBIDDEN);
        }
    }

    private assertScopedAdminVenuePayload(user: User, payload: UpdateVenueDto | CreateVenueDto, existingVenue: any) {
        if (user.role === UserRole.SYS_ADMIN) {
            return;
        }
        if (![UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN].includes(user.role)) {
            return;
        }
        const parsed = parseVenueLocation(existingVenue.location, existingVenue.name);
        const nextBuilding = (payload.building_name || existingVenue.buildingName || parsed.buildingName || '').trim();
        const nextFloor = (payload.floor_label || existingVenue.floorLabel || parsed.floorLabel || '').trim();
        const requiredBuilding = (user.managedBuilding || '').trim();
        const requiredFloor = (user.managedFloor || '').trim();

        if (!requiredBuilding && !requiredFloor) {
            throw new HttpException('Admin scope is not configured', HttpStatus.FORBIDDEN);
        }
        if (requiredBuilding && nextBuilding !== requiredBuilding) {
            throw new HttpException('No permission for this building', HttpStatus.FORBIDDEN);
        }
        if (requiredFloor && nextFloor !== requiredFloor) {
            throw new HttpException('No permission for this floor', HttpStatus.FORBIDDEN);
        }
    }

    private buildVenueScope(user: User) {
        if (user.role === UserRole.VENUE_ADMIN) {
            const managedBuilding = (user.managedBuilding || '').trim();
            const managedFloor = (user.managedFloor || '').trim();
            if (!managedBuilding && !managedFloor) {
                return { role: user.role, managedBuilding: '__NO_SCOPE__' };
            }
            return {
                role: user.role,
                adminId: user.id,
                managedBuilding,
                managedFloor,
            };
        }
        if (user.role === UserRole.FLOOR_ADMIN) {
            const managedBuilding = (user.managedBuilding || '').trim();
            const managedFloor = (user.managedFloor || '').trim();
            if (!managedBuilding && !managedFloor) {
                return { role: user.role, managedBuilding: '__NO_SCOPE__' };
            }
            return { role: user.role, managedBuilding, managedFloor };
        }
        return { role: user.role };
    }
}
