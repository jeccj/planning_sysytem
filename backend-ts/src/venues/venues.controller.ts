import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
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
    async findAll(
        @Query('skip') skip: string = '0',
        @Query('limit') limit: string = '100'
    ): Promise<VenueResponseDto[]> {
        const venues = await this.venuesService.findAll(+skip, +limit);
        return venues.map(this.toResponseDto);
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
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async create(
        @CurrentUser() user: User,
        @Body() createVenueDto: CreateVenueDto,
    ): Promise<VenueResponseDto> {
        if (user.role === UserRole.FLOOR_ADMIN) {
            if (user.managedBuilding) {
                createVenueDto.building_name = user.managedBuilding;
            }
            if (user.managedFloor) {
                createVenueDto.floor_label = user.managedFloor;
            }
            createVenueDto.admin_id = user.id;
        }
        const assignedAdminId = user.role === UserRole.SYS_ADMIN && createVenueDto.admin_id
            ? Number(createVenueDto.admin_id)
            : user.id;
        const venue = await this.venuesService.create(createVenueDto, assignedAdminId);
        return this.toResponseDto(venue);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.FLOOR_ADMIN)
    async update(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() updateVenueDto: CreateVenueDto,
    ): Promise<VenueResponseDto> {
        try {
            const existing = await this.venuesService.findOne(+id);
            if (!existing) {
                throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
            }
            this.assertFloorAdminVenueAccess(user, existing);
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
            this.assertFloorAdminVenueAccess(user, existing);
            const venue = await this.venuesService.remove(+id);
            return this.toResponseDto(venue);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
        }
    }

    @Get('search')
    async search(@Query('q') q: string): Promise<VenueResponseDto[]> {
        // 1. AI Parsing
        const intent = await this.llmService.parseIntent(q);

        console.log(`AI Search Intent: ${JSON.stringify(intent)}`);

        // 2. Default fallback logic similar to Python
        // Mock tomorrow 2pm if date/time not found
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(14, 0, 0, 0);

        const endDate = new Date(startDate);
        endDate.setHours(startDate.getHours() + 2); // Default duration 2 hours

        // Override with intent data if available (simplified for now, full date parsing would be in a util)
        // For now we use the mock dates to ensure stability, or could implement ISO parsing if intent returns ISO strings

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
        @Body() body: { start: string; end: string; reason: string },
    ) {
        try {
            const existing = await this.venuesService.findOne(+id);
            if (!existing) {
                throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
            }
            this.assertFloorAdminVenueAccess(user, existing);
            return await this.venuesService.scheduleMaintenance(
                +id,
                body.start,
                body.end,
                body.reason
            );
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
    }

    private assertFloorAdminVenueAccess(user: User, venue: any) {
        if (user.role !== UserRole.FLOOR_ADMIN) {
            return;
        }
        const parsed = parseVenueLocation(venue.location, venue.name);
        const venueBuilding = venue.buildingName || parsed.buildingName;
        const venueFloor = venue.floorLabel || parsed.floorLabel;
        const requiredBuilding = (user.managedBuilding || '').trim();
        const requiredFloor = (user.managedFloor || '').trim();
        if (!requiredBuilding && !requiredFloor) {
            throw new HttpException('Floor admin scope is not configured', HttpStatus.FORBIDDEN);
        }
        if (requiredBuilding && requiredBuilding !== venueBuilding) {
            throw new HttpException('No permission for this building', HttpStatus.FORBIDDEN);
        }
        if (requiredFloor && requiredFloor !== venueFloor) {
            throw new HttpException('No permission for this floor', HttpStatus.FORBIDDEN);
        }
    }

    private buildVenueScope(user: User) {
        if (user.role === UserRole.VENUE_ADMIN) {
            return {
                role: user.role,
                adminId: user.id,
                managedBuilding: (user.managedBuilding || '').trim(),
                managedFloor: (user.managedFloor || '').trim(),
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
