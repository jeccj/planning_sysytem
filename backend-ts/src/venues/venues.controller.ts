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
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, resolve } from 'path';
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
import {
  IntentResult,
  LlmService,
  VenueSearchInsight,
} from '../llm/llm.service';
import { parseVenueLocation } from './utils/location-utils';

@Controller('venues')
export class VenuesController {
  constructor(
    private readonly venuesService: VenuesService,
    private readonly llmService: LlmService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @CurrentUser() user: User,
    @Query('skip') skip: string = '0',
    @Query('limit') limit: string = '100',
  ): Promise<VenueResponseDto[]> {
    const scope = this.buildVenueScope(user);
    const venues = await this.venuesService.findAll(+skip, +limit, scope);
    const occupiedIds = await this.venuesService.getOccupiedVenueIds(
      venues.map((v) => v.id),
    );
    return venues.map((v) => ({
      ...this.toResponseDto(v),
      is_reserved: occupiedIds.has(v.id),
    }));
  }

  @Get('structure')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN)
  async getVenueStructure(@CurrentUser() user: User) {
    const scope = this.buildVenueScope(user);
    return this.venuesService.getVenueStructure(scope);
  }

  @Get('building-availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN, UserRole.STUDENT_TEACHER)
  async getBuildingAvailability(
    @CurrentUser() user: User,
    @Query('building') building?: string,
  ) {
    const scope = this.buildVenueScope(user);
    return this.venuesService.getBuildingAvailability(building, scope);
  }

  @Get('catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN)
  async getVenueHierarchyCatalog(@CurrentUser() user: User) {
    const scope = this.buildVenueScope(user);
    return this.venuesService.getVenueHierarchyCatalog(scope);
  }

  @Post('catalog/buildings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN)
  async createCatalogBuilding(
    @Body()
    body: {
      building_name?: string;
      floors?: string[] | string;
      auto_create_managers?: boolean | string;
      manager_password?: string;
    },
  ) {
    const floors = Array.isArray(body?.floors)
      ? body.floors
      : typeof body?.floors === 'string'
        ? body.floors
            .split(/[;,，\n]/)
            .map((item) => String(item || '').trim())
            .filter(Boolean)
        : [];
    const autoCreateManagers = this.parseOptionalBoolean(
      body?.auto_create_managers,
      true,
    );
    return this.venuesService.createBuildingCatalog({
      building_name: String(body?.building_name || '').trim(),
      floors,
      auto_create_managers: autoCreateManagers,
      manager_password: String(body?.manager_password || '').trim(),
    });
  }

  @Post('catalog/floors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN)
  async createCatalogFloor(
    @Body()
    body: {
      building_name?: string;
      floor_label?: string;
      auto_create_manager?: boolean | string;
      manager_password?: string;
    },
  ) {
    const autoCreateManager = this.parseOptionalBoolean(
      body?.auto_create_manager,
      false,
    );
    return this.venuesService.createFloorCatalog({
      building_name: String(body?.building_name || '').trim(),
      floor_label: String(body?.floor_label || '').trim(),
      auto_create_manager: autoCreateManager,
      manager_password: String(body?.manager_password || '').trim(),
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN)
  async create(
    @CurrentUser() user: User,
    @Body() createVenueDto: CreateVenueDto,
  ): Promise<VenueResponseDto> {
    const assignedAdminId =
      user.role === UserRole.SYS_ADMIN && createVenueDto.admin_id
        ? Number(createVenueDto.admin_id)
        : user.id;
    const venue = await this.venuesService.create(
      createVenueDto,
      assignedAdminId,
    );
    return this.toResponseDto(venue);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  async search(@Query('q') q: string): Promise<VenueResponseDto[]> {
    return this.executeBasicSearch(q);
  }

  @Get('search-smart')
  @UseGuards(JwtAuthGuard)
  async searchSmart(@Query('q') q: string) {
    try {
      return await this.executeSmartSearch(q);
    } catch (error: any) {
      console.error(
        '[search-smart] failed, fallback to basic search:',
        error?.message || error,
      );
      const results = await this.executeBasicSearch(q);
      return {
        query: String(q || '').trim(),
        intent: {},
        time_window: null,
        defaults: ['智能解释链路异常，已降级为基础检索'],
        insight: {
          summary: `已降级为基础检索，共 ${results.length} 条结果。`,
          criteria: [],
          tips: ['可稍后重试智能搜索'],
        },
        results,
      };
    }
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
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN)
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
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN)
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<VenueResponseDto> {
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
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN)
  @UseInterceptors(
    FilesInterceptor('photos', 10, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadDir = resolve(__dirname, '..', '..', 'uploads', 'venues');
          mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const rand = Array(24)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${rand}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\//)) {
          return cb(
            new HttpException('仅允许上传图片文件', HttpStatus.BAD_REQUEST),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadPhotos(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<VenueResponseDto> {
    const venue = await this.venuesService.findOne(+id);
    if (!venue)
      throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
    this.assertScopedAdminVenueAccess(user, venue);
    const newUrls = (files || []).map((f) => `/uploads/venues/${f.filename}`);
    const existingPhotos: string[] = Array.isArray(venue.photos)
      ? venue.photos
      : [];
    const updated = await this.venuesService.update(+id, {
      photos: [...existingPhotos, ...newUrls],
    } as any);
    return this.toResponseDto(updated);
  }

  @Delete(':id/photos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN)
  async deletePhoto(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('url') url: string,
  ): Promise<VenueResponseDto> {
    const venue = await this.venuesService.findOne(+id);
    if (!venue)
      throw new HttpException('Venue not found', HttpStatus.NOT_FOUND);
    this.assertScopedAdminVenueAccess(user, venue);
    const existingPhotos: string[] = Array.isArray(venue.photos)
      ? venue.photos
      : [];
    if (!existingPhotos.includes(url)) {
      throw new HttpException(
        'Photo URL not found on this venue',
        HttpStatus.BAD_REQUEST,
      );
    }
    const filtered = existingPhotos.filter((p) => p !== url);
    const updated = await this.venuesService.update(+id, {
      photos: filtered,
    } as any);
    // Best-effort delete file from disk — only allow files under /uploads/venues/
    try {
      if (url.startsWith('/uploads/venues/') && !url.includes('..')) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '..', '..', url);
        const uploadsDir = path.resolve(
          path.join(__dirname, '..', '..', 'uploads', 'venues'),
        );
        const resolvedPath = path.resolve(filePath);
        if (
          resolvedPath.startsWith(uploadsDir) &&
          fs.existsSync(resolvedPath)
        ) {
          fs.unlinkSync(resolvedPath);
        }
      }
    } catch {
      /* ignore */
    }
    return this.toResponseDto(updated);
  }

  private resolveSearchWindow(intent: IntentResult): {
    startDate: Date;
    endDate: Date;
    defaults: string[];
  } {
    const now = new Date();
    const defaults: string[] = [];
    let startDate: Date;
    let endDate: Date;

    if (intent.date && intent.time_range?.length === 2) {
      const [startHM, endHM] = intent.time_range;
      startDate = new Date(`${intent.date}T${startHM}:00`);
      endDate = new Date(`${intent.date}T${endHM}:00`);
      if (
        isNaN(startDate.getTime()) ||
        isNaN(endDate.getTime()) ||
        endDate <= startDate
      ) {
        defaults.push('时间无效，已改为明天14:00-16:00');
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(14, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(startDate.getHours() + 2);
      }
      return { startDate, endDate, defaults };
    }

    if (intent.date) {
      startDate = new Date(`${intent.date}T08:00:00`);
      endDate = new Date(`${intent.date}T22:00:00`);
      if (isNaN(startDate.getTime())) {
        defaults.push('日期无效，已改为明天14:00-16:00');
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(14, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(startDate.getHours() + 2);
      } else {
        defaults.push('未指定时段，默认08:00-22:00');
      }
      return { startDate, endDate, defaults };
    }

    startDate = new Date(now);
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(14, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 2);
    defaults.push('未指定时间，默认明天14:00-16:00');
    return { startDate, endDate, defaults };
  }

  private async executeSmartSearch(rawQuery: string) {
    const q = String(rawQuery || '').trim();
    if (!q) {
      return {
        query: '',
        intent: {},
        time_window: null,
        defaults: [],
        insight: {
          summary: '请输入搜索需求，例如“明德楼60人教室”。',
          criteria: [],
          tips: ['可直接输入人数、楼栋、设备需求'],
        },
        results: [],
      };
    }

    const intent = await this.llmService.parseIntent(q);

    const { startDate, endDate, defaults } = this.resolveSearchWindow(intent);
    const capacity = Math.max(
      1,
      Number((intent as any)?.attendees_count || intent.capacity || 1),
    );
    const facilities = Array.isArray(intent.facilities)
      ? intent.facilities
      : [];
    const keywords = Array.isArray(intent.keywords) ? intent.keywords : [];
    const venueType = intent.type;
    const buildingName = (intent.building || '').trim() || undefined;

    const results = await this.venuesService.search(
      capacity,
      startDate,
      endDate,
      facilities,
      keywords,
      venueType,
      buildingName,
    );

    const mapped = results.map((item) => ({
      ...this.toResponseDto(item.venue),
      match_details: item.matchDetails,
      score: item.score,
    }));

    const fallbackInsight = this.buildFallbackInsight(
      intent,
      mapped.length,
      defaults,
    );
    let insight = fallbackInsight;
    try {
      insight = await Promise.race([
        this.llmService.explainVenueSearch({
          query: q,
          intent,
          resultCount: mapped.length,
          defaultAssumptions: defaults,
          topResults: mapped.slice(0, 5).map((item) => ({
            name: item.name,
            location: item.location,
            capacity: item.capacity,
            type: item.type,
            score: item.score,
            match_details: item.match_details || [],
          })),
        }),
        new Promise<VenueSearchInsight>((resolve) => {
          setTimeout(() => resolve(fallbackInsight), 1200);
        }),
      ]);
    } catch {
      insight = fallbackInsight;
    }

    return {
      query: q,
      intent,
      time_window: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      defaults,
      insight,
      results: mapped,
    };
  }

  private async executeBasicSearch(
    rawQuery: string,
  ): Promise<VenueResponseDto[]> {
    const q = String(rawQuery || '').trim();
    if (!q) return [];

    const intent = await this.llmService.parseIntent(q);
    const { startDate, endDate } = this.resolveSearchWindow(intent || {});
    const capacity = Math.max(
      1,
      Number((intent as any)?.attendees_count || intent?.capacity || 1),
    );
    const facilities = Array.isArray(intent?.facilities)
      ? intent.facilities
      : [];
    const keywords = Array.isArray(intent?.keywords) ? intent.keywords : [];
    const venueType = intent?.type;
    const buildingName = (intent?.building || '').trim() || undefined;

    const results = await this.venuesService.search(
      capacity,
      startDate,
      endDate,
      facilities,
      keywords,
      venueType,
      buildingName,
    );

    return results.map((item) => ({
      ...this.toResponseDto(item.venue),
      match_details: item.matchDetails,
      score: item.score,
    }));
  }

  private normalizeFacilities(rawFacilities: any): string[] {
    if (Array.isArray(rawFacilities)) {
      return rawFacilities.map((item) => String(item)).filter(Boolean);
    }
    if (typeof rawFacilities === 'string') {
      try {
        const parsed = JSON.parse(rawFacilities);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item)).filter(Boolean);
        }
      } catch {
        // ignore invalid JSON and fallback to separator split
      }
      return rawFacilities
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private buildFallbackInsight(
    intent: IntentResult,
    resultCount: number,
    defaults: string[],
  ): VenueSearchInsight {
    const criteria: string[] = [];
    const capacity = Number(
      (intent as any)?.attendees_count || intent?.capacity || 0,
    );
    if (intent?.building) criteria.push(`楼栋:${intent.building}`);
    if (capacity > 0) criteria.push(`人数≥${capacity}`);
    if (intent?.type) criteria.push(`类型:${intent.type}`);
    if (Array.isArray(intent?.facilities)) {
      intent.facilities
        .slice(0, 3)
        .forEach((item) => criteria.push(`设备:${item}`));
    }
    if (intent?.date) criteria.push(`日期:${intent.date}`);
    if (Array.isArray(intent?.time_range) && intent.time_range.length === 2) {
      criteria.push(`时段:${intent.time_range[0]}-${intent.time_range[1]}`);
    }
    defaults.slice(0, 2).forEach((item) => criteria.push(`默认:${item}`));

    return {
      summary:
        resultCount > 0
          ? `已结合你的条件筛选，找到 ${resultCount} 个候选场馆。`
          : '当前条件下暂无可用场馆，可尝试放宽条件。',
      criteria: criteria.slice(0, 8),
      tips:
        resultCount === 0
          ? ['放宽人数或设备要求', '尝试更换时间段', '可去掉楼栋限制再试']
          : resultCount < 3
            ? ['可放宽设备要求提高命中']
            : [],
    };
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
      facilities: this.normalizeFacilities(venue.facilities),
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
  @Roles(UserRole.SYS_ADMIN, UserRole.VENUE_ADMIN)
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
        body.reason,
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
    if (user.role !== UserRole.VENUE_ADMIN) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    const parsed = parseVenueLocation(venue.location, venue.name);
    const venueBuilding = venue.buildingName || parsed.buildingName;
    const venueFloor = venue.floorLabel || parsed.floorLabel;
    const requiredBuilding = (user.managedBuilding || '').trim();
    const requiredFloor = (user.managedFloor || '').trim();
    if (!requiredBuilding && !requiredFloor) {
      throw new HttpException(
        'Admin scope is not configured',
        HttpStatus.FORBIDDEN,
      );
    }
    if (requiredBuilding && requiredBuilding !== venueBuilding) {
      throw new HttpException(
        'No permission for this building',
        HttpStatus.FORBIDDEN,
      );
    }
    if (requiredFloor && requiredFloor !== venueFloor) {
      throw new HttpException(
        'No permission for this floor',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private assertScopedAdminVenuePayload(
    user: User,
    payload: UpdateVenueDto | CreateVenueDto,
    existingVenue: any,
  ) {
    if (user.role === UserRole.SYS_ADMIN) {
      return;
    }
    if (user.role !== UserRole.VENUE_ADMIN) {
      return;
    }
    const parsed = parseVenueLocation(
      existingVenue.location,
      existingVenue.name,
    );
    const nextBuilding = (
      payload.building_name ||
      existingVenue.buildingName ||
      parsed.buildingName ||
      ''
    ).trim();
    const nextFloor = (
      payload.floor_label ||
      existingVenue.floorLabel ||
      parsed.floorLabel ||
      ''
    ).trim();
    const requiredBuilding = (user.managedBuilding || '').trim();
    const requiredFloor = (user.managedFloor || '').trim();

    if (!requiredBuilding && !requiredFloor) {
      throw new HttpException(
        'Admin scope is not configured',
        HttpStatus.FORBIDDEN,
      );
    }
    if (requiredBuilding && nextBuilding !== requiredBuilding) {
      throw new HttpException(
        'No permission for this building',
        HttpStatus.FORBIDDEN,
      );
    }
    if (requiredFloor && nextFloor !== requiredFloor) {
      throw new HttpException(
        'No permission for this floor',
        HttpStatus.FORBIDDEN,
      );
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
    return { role: user.role };
  }

  private parseOptionalBoolean(raw: unknown, defaultValue: boolean): boolean {
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    if (typeof raw === 'boolean') return raw;
    const text = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(text)) return true;
    if (['0', 'false', 'no', 'off'].includes(text)) return false;
    throw new BadRequestException(`invalid boolean value: ${raw}`);
  }
}
