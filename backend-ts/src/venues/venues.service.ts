import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, In } from 'typeorm';
import { Venue } from './entities/venue.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { VenueStatus, ReservationStatus, UserRole } from '../common/enums';
import { buildVenueLocation, parseVenueLocation } from './utils/location-utils';
import { ReservationSlot } from '../reservations/entities/reservation-slot.entity';
import { DataSource } from 'typeorm';
import {
  buildSlotWindows,
  isUniqueSlotError,
} from '../reservations/utils/slot-utils';
import { parseDateTimeWithTimezone } from '../common/utils/datetime.utils';
import {
  isReservationWithinVenueOpenHours,
  normalizeAndValidateOpenHoursForStorage,
} from '../common/utils/open-hours.utils';
import { UsersService } from '../users/users.service';
import { SystemConfigService } from '../system-config/system-config.service';

export interface BuildingClassroomStatus {
  id: number;
  name: string;
  room_name: string;
  location: string;
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance';
}

export interface BuildingAvailabilityOverview {
  selected_building: string | null;
  summary: {
    total_buildings: number;
    total_classrooms: number;
    available_classrooms: number;
    occupied_classrooms: number;
    maintenance_classrooms: number;
  };
  buildings: Array<{
    name: string;
    total_classrooms: number;
    available_classrooms: number;
    occupied_classrooms: number;
    maintenance_classrooms: number;
  }>;
  classrooms: BuildingClassroomStatus[];
}

export interface VenueStructureOverview {
  buildings: Array<{
    building_name: string;
    total_classrooms: number;
    floors: Array<{
      floor_label: string;
      total_classrooms: number;
      available_classrooms: number;
      occupied_classrooms: number;
      maintenance_classrooms: number;
      classrooms: Array<{
        id: number;
        room_code: string;
        name: string;
        capacity: number;
        status: 'available' | 'occupied' | 'maintenance';
      }>;
    }>;
  }>;
}

interface VenueHierarchyCatalogEntry {
  building_name: string;
  floors: string[];
}

interface VenueHierarchyCatalogStore {
  buildings: VenueHierarchyCatalogEntry[];
}

export interface VenueHierarchyCatalogView {
  buildings: Array<{
    building_name: string;
    floors: string[];
    manager_count: number;
    managers: Array<{
      id: number;
      username: string;
      managed_floor: string;
    }>;
  }>;
}

export interface CreateBuildingCatalogInput {
  building_name: string;
  floors?: string[];
  auto_create_managers?: boolean;
  manager_password?: string;
}

export interface CreateFloorCatalogInput {
  building_name: string;
  floor_label: string;
  auto_create_manager?: boolean;
  manager_password?: string;
}

const VENUE_HIERARCHY_CATALOG_KEY = 'venue_hierarchy_catalog_v1';
const VENUE_HIERARCHY_CATALOG_DESC =
  'Building/Floor catalog for structured venue creation';
const DEFAULT_AUTO_VENUE_ADMIN_PASSWORD = 'Admin@123456';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private venueRepository: Repository<Venue>,
    @InjectRepository(Reservation)
    private reservationRepository: Repository<Reservation>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(ReservationSlot)
    private slotRepository: Repository<ReservationSlot>,
    private dataSource: DataSource,
    private usersService: UsersService,
    private systemConfigService: SystemConfigService,
  ) {}

  private normalizeLabel(input: unknown): string {
    return String(input || '').trim();
  }

  private slugify(input: string): string {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private normalizeFloorList(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return Array.from(
        new Set(raw.map((item) => this.normalizeLabel(item)).filter(Boolean)),
      );
    }
    if (typeof raw === 'string') {
      return Array.from(
        new Set(
          raw
            .split(/[;,，\n]/)
            .map((item) => this.normalizeLabel(item))
            .filter(Boolean),
        ),
      );
    }
    return [];
  }

  private parseCatalogStore(
    rawValue: string | null,
  ): VenueHierarchyCatalogStore {
    if (!rawValue) {
      return { buildings: [] };
    }
    try {
      const parsed = JSON.parse(rawValue);
      const rawBuildings = Array.isArray(parsed?.buildings)
        ? parsed.buildings
        : [];
      const buildings: VenueHierarchyCatalogEntry[] = rawBuildings
        .map((item: any) => {
          const buildingName = this.normalizeLabel(item?.building_name);
          if (!buildingName) return null;
          return {
            building_name: buildingName,
            floors: this.normalizeFloorList(item?.floors),
          } as VenueHierarchyCatalogEntry;
        })
        .filter(Boolean);
      return { buildings };
    } catch {
      return { buildings: [] };
    }
  }

  private async loadCatalogStore(): Promise<VenueHierarchyCatalogStore> {
    const raw = await this.systemConfigService.findByKey(
      VENUE_HIERARCHY_CATALOG_KEY,
    );
    return this.parseCatalogStore(raw);
  }

  private async saveCatalogStore(
    store: VenueHierarchyCatalogStore,
  ): Promise<void> {
    const dedupedBuildings: VenueHierarchyCatalogEntry[] = [];
    const seen = new Set<string>();
    for (const entry of Array.isArray(store.buildings) ? store.buildings : []) {
      const buildingName = this.normalizeLabel(entry.building_name);
      if (!buildingName || seen.has(buildingName)) continue;
      seen.add(buildingName);
      dedupedBuildings.push({
        building_name: buildingName,
        floors: this.normalizeFloorList(entry.floors),
      });
    }
    await this.systemConfigService.setConfig(
      VENUE_HIERARCHY_CATALOG_KEY,
      JSON.stringify({ buildings: dedupedBuildings }),
      VENUE_HIERARCHY_CATALOG_DESC,
    );
  }

  private async buildMergedCatalogMap(scope?: {
    role?: UserRole;
    adminId?: number;
    managedBuilding?: string;
    managedFloor?: string;
  }): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    const store = await this.loadCatalogStore();
    for (const entry of store.buildings) {
      const buildingName = this.normalizeLabel(entry.building_name);
      if (!buildingName) continue;
      const floorSet = map.get(buildingName) || new Set<string>();
      this.normalizeFloorList(entry.floors).forEach((floor) =>
        floorSet.add(floor),
      );
      map.set(buildingName, floorSet);
    }

    const venues = await this.findAll(0, 10000, scope);
    venues.forEach((venue) => {
      const parsed = parseVenueLocation(venue.location, venue.name);
      const buildingName = this.normalizeLabel(
        venue.buildingName || parsed.buildingName,
      );
      const floorLabel = this.normalizeLabel(
        venue.floorLabel || parsed.floorLabel,
      );
      if (!buildingName) return;
      const floorSet = map.get(buildingName) || new Set<string>();
      if (floorLabel) floorSet.add(floorLabel);
      map.set(buildingName, floorSet);
    });
    return map;
  }

  private async assertCatalogBuildingFloorExists(
    buildingName: string,
    floorLabel: string,
  ): Promise<void> {
    const nextBuilding = this.normalizeLabel(buildingName);
    const nextFloor = this.normalizeLabel(floorLabel);
    if (!nextBuilding) {
      throw new BadRequestException('创建场馆前请先选择/创建基础楼栋');
    }
    if (!nextFloor) {
      throw new BadRequestException('创建场馆前请先选择/创建楼层单元');
    }
    const catalog = await this.buildMergedCatalogMap();
    if (!catalog.has(nextBuilding)) {
      throw new BadRequestException(
        `楼栋 "${nextBuilding}" 不存在，请先创建基础楼栋`,
      );
    }
    const floorSet = catalog.get(nextBuilding) || new Set<string>();
    if (!floorSet.has(nextFloor)) {
      throw new BadRequestException(
        `楼栋 "${nextBuilding}" 下不存在楼层 "${nextFloor}"，请先创建楼层单元`,
      );
    }
  }

  private async generateUniqueVenueAdminUsername(
    base: string,
  ): Promise<string> {
    const normalizedBase =
      this.normalizeLabel(base).slice(0, 42) || 'venue_admin_auto';
    let candidate = normalizedBase;
    let counter = 1;
    while (await this.usersService.findByUsername(candidate)) {
      counter += 1;
      candidate = `${normalizedBase}_${counter}`.slice(0, 50);
    }
    return candidate;
  }

  private async createAutoVenueAdmin(
    buildingName: string,
    floorLabel: string,
    password: string,
  ): Promise<{ id: number; username: string; managed_floor: string }> {
    const buildingSlug = this.slugify(buildingName).slice(0, 16) || 'building';
    const floorSlug = this.slugify(floorLabel).slice(0, 10);
    const base = floorSlug
      ? `venue_admin_${buildingSlug}_${floorSlug}`
      : `venue_admin_${buildingSlug}`;
    const username = await this.generateUniqueVenueAdminUsername(base);
    const seed = Math.floor(Math.random() * 900000) + 100000;
    const created = await this.usersService.create({
      username,
      password: password || DEFAULT_AUTO_VENUE_ADMIN_PASSWORD,
      role: UserRole.VENUE_ADMIN,
      contact_info: `auto-manager:${buildingName}${floorLabel ? `/${floorLabel}` : ''}`,
      identity_last6: String(seed),
      managed_building: buildingName,
      managed_floor: floorLabel || '',
    } as any);
    return {
      id: created.id,
      username: created.username,
      managed_floor: created.managedFloor || '',
    };
  }

  async getVenueHierarchyCatalog(scope?: {
    role?: UserRole;
    adminId?: number;
    managedBuilding?: string;
    managedFloor?: string;
  }): Promise<VenueHierarchyCatalogView> {
    const catalog = await this.buildMergedCatalogMap(scope);
    const users = await this.usersService.findAll(0, 10000);
    const managerMap = new Map<
      string,
      Array<{ id: number; username: string; managed_floor: string }>
    >();
    users
      .filter((user) => user.role === UserRole.VENUE_ADMIN)
      .forEach((user) => {
        const building = this.normalizeLabel(user.managedBuilding);
        if (!building) return;
        const list = managerMap.get(building) || [];
        list.push({
          id: user.id,
          username: user.username,
          managed_floor: this.normalizeLabel(user.managedFloor),
        });
        managerMap.set(building, list);
      });

    const buildings = Array.from(catalog.entries())
      .map(([buildingName, floors]) => {
        const managers = (managerMap.get(buildingName) || []).sort((a, b) =>
          a.username.localeCompare(b.username, 'zh-CN'),
        );
        return {
          building_name: buildingName,
          floors: Array.from(floors).sort((a, b) =>
            a.localeCompare(b, 'zh-CN'),
          ),
          manager_count: managers.length,
          managers,
        };
      })
      .sort((a, b) => a.building_name.localeCompare(b.building_name, 'zh-CN'));

    return { buildings };
  }

  async createBuildingCatalog(input: CreateBuildingCatalogInput): Promise<{
    building_name: string;
    floors: string[];
    created_managers: Array<{
      id: number;
      username: string;
      managed_floor: string;
    }>;
  }> {
    const buildingName = this.normalizeLabel(input?.building_name);
    if (!buildingName) {
      throw new BadRequestException('building_name is required');
    }
    const floorList = this.normalizeFloorList(input?.floors);
    const mergedMap = await this.buildMergedCatalogMap();
    if (mergedMap.has(buildingName)) {
      throw new BadRequestException(`楼栋 "${buildingName}" 已存在`);
    }

    const store = await this.loadCatalogStore();
    store.buildings.push({
      building_name: buildingName,
      floors: floorList,
    });
    await this.saveCatalogStore(store);

    const autoCreateManagers = input?.auto_create_managers !== false;
    const managerPassword =
      this.normalizeLabel(input?.manager_password) ||
      DEFAULT_AUTO_VENUE_ADMIN_PASSWORD;
    const managerFloors = floorList.length > 0 ? floorList : [''];
    const createdManagers: Array<{
      id: number;
      username: string;
      managed_floor: string;
    }> = [];
    if (autoCreateManagers) {
      for (const floor of managerFloors) {
        const created = await this.createAutoVenueAdmin(
          buildingName,
          floor,
          managerPassword,
        );
        createdManagers.push(created);
      }
    }

    return {
      building_name: buildingName,
      floors: floorList,
      created_managers: createdManagers,
    };
  }

  async createFloorCatalog(input: CreateFloorCatalogInput): Promise<{
    building_name: string;
    floor_label: string;
    created_manager?: { id: number; username: string; managed_floor: string };
  }> {
    const buildingName = this.normalizeLabel(input?.building_name);
    const floorLabel = this.normalizeLabel(input?.floor_label);
    if (!buildingName) {
      throw new BadRequestException('building_name is required');
    }
    if (!floorLabel) {
      throw new BadRequestException('floor_label is required');
    }

    const mergedMap = await this.buildMergedCatalogMap();
    if (!mergedMap.has(buildingName)) {
      throw new BadRequestException(
        `楼栋 "${buildingName}" 不存在，请先创建基础楼栋`,
      );
    }
    const existingFloors = mergedMap.get(buildingName) || new Set<string>();
    if (existingFloors.has(floorLabel)) {
      throw new BadRequestException(
        `楼层 "${buildingName}/${floorLabel}" 已存在`,
      );
    }

    const store = await this.loadCatalogStore();
    const target = store.buildings.find(
      (item) => this.normalizeLabel(item.building_name) === buildingName,
    );
    if (target) {
      target.floors = this.normalizeFloorList([
        ...(target.floors || []),
        floorLabel,
      ]);
    } else {
      store.buildings.push({
        building_name: buildingName,
        floors: [floorLabel],
      });
    }
    await this.saveCatalogStore(store);

    const autoCreateManager = input?.auto_create_manager === true;
    let createdManager:
      | { id: number; username: string; managed_floor: string }
      | undefined;
    if (autoCreateManager) {
      const managerPassword =
        this.normalizeLabel(input?.manager_password) ||
        DEFAULT_AUTO_VENUE_ADMIN_PASSWORD;
      createdManager = await this.createAutoVenueAdmin(
        buildingName,
        floorLabel,
        managerPassword,
      );
    }

    return {
      building_name: buildingName,
      floor_label: floorLabel,
      ...(createdManager ? { created_manager: createdManager } : {}),
    };
  }

  async findAll(
    skip: number = 0,
    limit: number = 100,
    scope?: {
      role?: UserRole;
      adminId?: number;
      managedBuilding?: string;
      managedFloor?: string;
    },
  ): Promise<Venue[]> {
    const qb = this.venueRepository
      .createQueryBuilder('venue')
      .skip(skip)
      .take(limit)
      .orderBy('venue.location', 'ASC');

    if (scope?.role === UserRole.VENUE_ADMIN) {
      if (scope.managedBuilding) {
        qb.andWhere(
          '(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)',
          {
            buildingName: scope.managedBuilding,
            buildingLike: `%${scope.managedBuilding}%`,
          },
        );
      }
      if (scope.managedFloor) {
        qb.andWhere('venue.floor_label = :floorLabel', {
          floorLabel: scope.managedFloor,
        });
      }
      if (!scope.managedBuilding && !scope.managedFloor && scope.adminId) {
        qb.andWhere('venue.admin_id = :adminId', { adminId: scope.adminId });
      }
    }

    return qb.getMany();
  }

  async findOne(id: number): Promise<Venue | null> {
    return this.venueRepository.findOne({ where: { id } });
  }

  async create(
    createVenueDto: CreateVenueDto,
    adminId: number,
  ): Promise<Venue> {
    const openHours = normalizeAndValidateOpenHoursForStorage(
      createVenueDto.open_hours,
    );
    const parsed = parseVenueLocation(
      createVenueDto.location,
      createVenueDto.name,
    );
    const buildingName = createVenueDto.building_name || parsed.buildingName;
    const floorLabel = createVenueDto.floor_label || parsed.floorLabel;
    const roomCode =
      createVenueDto.room_code || parsed.roomName || createVenueDto.name;
    await this.assertCatalogBuildingFloorExists(buildingName, floorLabel);
    const location = buildVenueLocation(
      buildingName,
      floorLabel,
      roomCode,
      createVenueDto.location,
    );

    const venue = this.venueRepository.create({
      name: createVenueDto.name,
      type: createVenueDto.type,
      capacity: createVenueDto.capacity,
      status: createVenueDto.status || VenueStatus.AVAILABLE,
      openHours,
      description: createVenueDto.description,
      imageUrl: createVenueDto.image_url,
      photos: createVenueDto.photos || [],
      adminId,
      location,
      buildingName,
      floorLabel,
      roomCode,
      facilities: createVenueDto.facilities, // Will be handled by simple-json column
    });
    return this.venueRepository.save(venue);
  }

  async update(id: number, updateVenueDto: UpdateVenueDto): Promise<Venue> {
    const venue = await this.findOne(id);
    if (!venue) {
      throw new Error('Venue not found');
    }

    const oldStatus = venue.status;

    // Update fields — only set if provided
    if (updateVenueDto.name !== undefined) venue.name = updateVenueDto.name;
    if (updateVenueDto.type !== undefined) venue.type = updateVenueDto.type;
    if (updateVenueDto.capacity !== undefined)
      venue.capacity = updateVenueDto.capacity;
    if (updateVenueDto.status !== undefined)
      venue.status = updateVenueDto.status;
    if (updateVenueDto.open_hours !== undefined)
      venue.openHours = normalizeAndValidateOpenHoursForStorage(
        updateVenueDto.open_hours,
      );
    if (updateVenueDto.description !== undefined)
      venue.description = updateVenueDto.description;
    if (updateVenueDto.image_url !== undefined)
      venue.imageUrl = updateVenueDto.image_url;
    if (Object.prototype.hasOwnProperty.call(updateVenueDto, 'photos')) {
      venue.photos = updateVenueDto.photos || [];
    }
    if (updateVenueDto.admin_id !== undefined) {
      venue.adminId = updateVenueDto.admin_id;
    }

    const nextLocation = updateVenueDto.location || venue.location;
    const parsed = parseVenueLocation(
      nextLocation,
      updateVenueDto.name || venue.name,
    );
    venue.buildingName =
      updateVenueDto.building_name || venue.buildingName || parsed.buildingName;
    venue.floorLabel =
      updateVenueDto.floor_label || venue.floorLabel || parsed.floorLabel;
    venue.roomCode =
      updateVenueDto.room_code ||
      venue.roomCode ||
      parsed.roomName ||
      venue.name;
    await this.assertCatalogBuildingFloorExists(
      venue.buildingName,
      venue.floorLabel,
    );
    venue.location = buildVenueLocation(
      venue.buildingName,
      venue.floorLabel,
      venue.roomCode,
      nextLocation,
    );

    // TypeORM usually handles JSON/array serialization automatically for @Column('simple-json')
    // but ensuring it's set correctly
    if (Object.prototype.hasOwnProperty.call(updateVenueDto, 'facilities')) {
      venue.facilities = updateVenueDto.facilities || [];
    }

    const updatedVenue = await this.venueRepository.save(venue);

    // Maintenance notification logic
    if (
      oldStatus === VenueStatus.AVAILABLE &&
      updateVenueDto.status === VenueStatus.MAINTENANCE
    ) {
      await this.notifyMaintenance(id, updatedVenue.name);
    }

    return updatedVenue;
  }

  async remove(id: number): Promise<Venue> {
    const venue = await this.findOne(id);
    if (!venue) {
      throw new Error('Venue not found');
    }
    return this.venueRepository.remove(venue);
  }

  async getOccupiedVenueIds(venueIds: number[]): Promise<Set<number>> {
    if (venueIds.length === 0) return new Set();
    const now = new Date();
    const activeReservations = await this.reservationRepository.find({
      where: {
        venueId: In(venueIds),
        status: In([ReservationStatus.APPROVED, ReservationStatus.MAINTENANCE]),
        startTime: LessThan(now),
        endTime: MoreThan(now),
      },
      select: ['venueId'],
    });
    return new Set(activeReservations.map((r) => r.venueId));
  }

  private async notifyMaintenance(venueId: number, venueName: string) {
    const affectedReservations = await this.reservationRepository.find({
      where: {
        venueId,
        status: In([ReservationStatus.PENDING, ReservationStatus.APPROVED]),
      },
    });

    for (const res of affectedReservations) {
      const notification = this.notificationRepository.create({
        userId: res.userId,
        title: '场地维护通知',
        content: `您预约的场地「${venueName}」已被标记为维护状态，您的预约「${res.activityName}」可能受到影响，请关注后续通知或重新预约其他场地。`,
        notificationType: 'venue_change',
      });
      await this.notificationRepository.save(notification);
    }
  }

  async getBuildingAvailability(
    building?: string,
    scope?: {
      role?: UserRole;
      adminId?: number;
      managedBuilding?: string;
      managedFloor?: string;
    },
  ): Promise<BuildingAvailabilityOverview> {
    const qb = this.venueRepository
      .createQueryBuilder('venue')
      .where('venue.type = :type', { type: 'Classroom' })
      .orderBy('venue.location', 'ASC');

    if (scope?.role === UserRole.VENUE_ADMIN) {
      if (scope.managedBuilding) {
        qb.andWhere(
          '(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)',
          {
            buildingName: scope.managedBuilding,
            buildingLike: `%${scope.managedBuilding}%`,
          },
        );
      }
      if (scope.managedFloor) {
        qb.andWhere('venue.floor_label = :floorLabel', {
          floorLabel: scope.managedFloor,
        });
      }
      if (!scope.managedBuilding && !scope.managedFloor && scope.adminId) {
        qb.andWhere('venue.admin_id = :adminId', { adminId: scope.adminId });
      }
    }

    const classrooms = await qb.getMany();

    if (classrooms.length === 0) {
      return {
        selected_building: null,
        summary: {
          total_buildings: 0,
          total_classrooms: 0,
          available_classrooms: 0,
          occupied_classrooms: 0,
          maintenance_classrooms: 0,
        },
        buildings: [],
        classrooms: [],
      };
    }

    const now = new Date();
    const venueIds = classrooms.map((item) => item.id);
    const activeReservations = await this.reservationRepository.find({
      where: {
        venueId: In(venueIds),
        status: In([ReservationStatus.APPROVED, ReservationStatus.MAINTENANCE]),
        startTime: LessThan(now),
        endTime: MoreThan(now),
      },
      select: ['venueId'],
    });
    const occupiedSet = new Set(activeReservations.map((item) => item.venueId));

    const grouped = new Map<string, BuildingClassroomStatus[]>();
    classrooms.forEach((venue) => {
      const parsed = parseVenueLocation(venue.location, venue.name);
      const buildingName = venue.buildingName || parsed.buildingName;
      const status: BuildingClassroomStatus['status'] =
        venue.status === VenueStatus.MAINTENANCE
          ? 'maintenance'
          : occupiedSet.has(venue.id)
            ? 'occupied'
            : 'available';

      const row: BuildingClassroomStatus = {
        id: venue.id,
        name: venue.name,
        room_name: venue.roomCode || parsed.roomName || venue.name,
        location: venue.location,
        capacity: venue.capacity,
        status,
      };

      const bucket = grouped.get(buildingName) || [];
      bucket.push(row);
      grouped.set(buildingName, bucket);
    });

    const buildings = Array.from(grouped.entries())
      .map(([name, rooms]) => {
        const available = rooms.filter(
          (room) => room.status === 'available',
        ).length;
        const occupied = rooms.filter(
          (room) => room.status === 'occupied',
        ).length;
        const maintenance = rooms.filter(
          (room) => room.status === 'maintenance',
        ).length;
        return {
          name,
          total_classrooms: rooms.length,
          available_classrooms: available,
          occupied_classrooms: occupied,
          maintenance_classrooms: maintenance,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    const validSelected =
      building && grouped.has(building) ? building : buildings[0].name;
    const classroomsOfSelected = (grouped.get(validSelected) || [])
      .slice()
      .sort((a, b) => {
        return a.room_name.localeCompare(b.room_name, 'zh-CN');
      });

    const summary = buildings.reduce(
      (acc, item) => {
        acc.total_buildings += 1;
        acc.total_classrooms += item.total_classrooms;
        acc.available_classrooms += item.available_classrooms;
        acc.occupied_classrooms += item.occupied_classrooms;
        acc.maintenance_classrooms += item.maintenance_classrooms;
        return acc;
      },
      {
        total_buildings: 0,
        total_classrooms: 0,
        available_classrooms: 0,
        occupied_classrooms: 0,
        maintenance_classrooms: 0,
      },
    );

    return {
      selected_building: validSelected,
      summary,
      buildings,
      classrooms: classroomsOfSelected,
    };
  }

  async getVenueStructure(scope?: {
    role?: UserRole;
    adminId?: number;
    managedBuilding?: string;
    managedFloor?: string;
  }): Promise<VenueStructureOverview> {
    const overview = await this.getBuildingAvailability(undefined, scope);
    if (overview.buildings.length === 0) {
      return { buildings: [] };
    }

    const qb = this.venueRepository
      .createQueryBuilder('venue')
      .where('venue.type = :type', { type: 'Classroom' })
      .orderBy('venue.location', 'ASC');

    if (scope?.role === UserRole.VENUE_ADMIN) {
      if (scope.managedBuilding) {
        qb.andWhere(
          '(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)',
          {
            buildingName: scope.managedBuilding,
            buildingLike: `%${scope.managedBuilding}%`,
          },
        );
      }
      if (scope.managedFloor) {
        qb.andWhere('venue.floor_label = :floorLabel', {
          floorLabel: scope.managedFloor,
        });
      }
      if (!scope.managedBuilding && !scope.managedFloor && scope.adminId) {
        qb.andWhere('venue.admin_id = :adminId', { adminId: scope.adminId });
      }
    }

    const classrooms = await qb.getMany();
    const now = new Date();
    const active = await this.reservationRepository.find({
      where: {
        venueId: In(classrooms.map((item) => item.id)),
        status: In([ReservationStatus.APPROVED, ReservationStatus.MAINTENANCE]),
        startTime: LessThan(now),
        endTime: MoreThan(now),
      },
      select: ['venueId'],
    });
    const occupied = new Set(active.map((item) => item.venueId));

    const buildingMap = new Map<
      string,
      Map<
        string,
        Array<{
          id: number;
          room_code: string;
          name: string;
          capacity: number;
          status: 'available' | 'occupied' | 'maintenance';
        }>
      >
    >();

    for (const venue of classrooms) {
      const parsed = parseVenueLocation(venue.location, venue.name);
      const buildingName = venue.buildingName || parsed.buildingName;
      const floorLabel = venue.floorLabel || parsed.floorLabel;
      const roomCode = venue.roomCode || parsed.roomName || venue.name;
      const status: 'available' | 'occupied' | 'maintenance' =
        venue.status === VenueStatus.MAINTENANCE
          ? 'maintenance'
          : occupied.has(venue.id)
            ? 'occupied'
            : 'available';

      const floors = buildingMap.get(buildingName) || new Map();
      const rooms = floors.get(floorLabel) || [];
      rooms.push({
        id: venue.id,
        room_code: roomCode,
        name: venue.name,
        capacity: venue.capacity,
        status,
      });
      floors.set(floorLabel, rooms);
      buildingMap.set(buildingName, floors);
    }

    const buildings = Array.from(buildingMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
      .map(([buildingName, floors]) => {
        let totalClassrooms = 0;
        const floorRows = Array.from(floors.entries())
          .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
          .map(([floorLabel, rooms]) => {
            totalClassrooms += rooms.length;
            const available = rooms.filter(
              (item) => item.status === 'available',
            ).length;
            const occupiedCount = rooms.filter(
              (item) => item.status === 'occupied',
            ).length;
            const maintenance = rooms.filter(
              (item) => item.status === 'maintenance',
            ).length;
            return {
              floor_label: floorLabel,
              total_classrooms: rooms.length,
              available_classrooms: available,
              occupied_classrooms: occupiedCount,
              maintenance_classrooms: maintenance,
              classrooms: rooms.sort((a, b) =>
                a.room_code.localeCompare(b.room_code, 'zh-CN'),
              ),
            };
          });
        return {
          building_name: buildingName,
          total_classrooms: totalClassrooms,
          floors: floorRows,
        };
      });

    return { buildings };
  }

  async search(
    capacity: number,
    start: Date,
    end: Date,
    facilities?: string[],
    keywords?: string[],
    venueType?: string,
    buildingName?: string,
  ): Promise<{ venue: Venue; matchDetails: string[]; score: number }[]> {
    const queryBuilder = this.venueRepository.createQueryBuilder('venue');

    // Basic capacity check (hard filter)
    // queryBuilder.where('venue.capacity >= :capacity', { capacity });
    // Changed to soft filter to allow showing slightly smaller venues with warning/lower score if needed,
    // but for now let's keep it in the loop or use a lower bound in SQL.
    // Let's use SQL for efficiency but maybe allow slightly smaller (e.g. 0.8 * cap)
    queryBuilder.where('venue.capacity >= :minCap', {
      minCap: Math.floor(capacity * 0.8),
    });

    if (venueType) {
      queryBuilder.andWhere('venue.type = :venueType', { venueType });
    }

    if (buildingName) {
      queryBuilder.andWhere(
        '(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)',
        {
          buildingName,
          buildingLike: `%${buildingName}%`,
        },
      );
    }

    // Filter out non-available venues (including Maintenance)
    queryBuilder.andWhere('venue.status = :status', {
      status: VenueStatus.AVAILABLE,
    });

    const candidates = await queryBuilder.getMany();
    const scoredCandidates: {
      score: number;
      venue: Venue;
      matchDetails: string[];
    }[] = [];

    const candidateIds = candidates.map((item) => item.id);
    const conflictSet = new Set<number>();
    if (candidateIds.length > 0) {
      const conflicts = await this.reservationRepository.find({
        where: {
          venueId: In(candidateIds),
          status: In([
            ReservationStatus.APPROVED,
            ReservationStatus.MAINTENANCE,
          ]),
          startTime: LessThan(end),
          endTime: MoreThan(start),
        },
        select: ['venueId'],
      });
      conflicts.forEach((item) => conflictSet.add(item.venueId));
    }

    for (const venue of candidates) {
      if (!isReservationWithinVenueOpenHours(start, end, venue.openHours)) {
        continue;
      }
      let score = 10;
      const matchDetails: string[] = [];
      const facilitiesStr = (venue.facilities || []).join(' ');
      const searchableText =
        `${venue.name} ${venue.type} ${venue.location} ${facilitiesStr}`.toLowerCase();

      // 0. Capacity Match
      if (venue.capacity >= capacity) {
        score += 10;
        matchDetails.push(`✅ 容量足够 (${venue.capacity}人 >= ${capacity}人)`);
      } else {
        score -= 10;
        matchDetails.push(`⚠️ 容量略小 (${venue.capacity}人 < ${capacity}人)`);
      }

      // 1. Facility Match
      if (facilities && facilities.length > 0) {
        for (const reqF of facilities) {
          if (searchableText.includes(reqF.toLowerCase())) {
            score += 20;
            matchDetails.push(`✅ 包含设备: ${reqF}`);
          } else {
            matchDetails.push(`❌ 缺少设备: ${reqF}`);
          }
        }
      }

      // 2. Keyword Match
      if (keywords && keywords.length > 0) {
        for (const kw of keywords) {
          if (searchableText.includes(kw.toLowerCase())) {
            score += 15;
            matchDetails.push(`✅ 匹配关键词: ${kw}`);
          }
        }
      }

      // 3. Type Match
      const typeKeywords = [
        '教室',
        '实验室',
        '礼堂',
        'hall',
        'lab',
        'classroom',
        'lecture',
      ];
      if (typeKeywords.some((term) => searchableText.includes(term))) {
        score += 5;
      }

      if (buildingName) {
        const venueBuilding = String(venue.buildingName || '').toLowerCase();
        const matchedBuilding =
          venueBuilding.includes(String(buildingName).toLowerCase()) ||
          String(venue.location || '')
            .toLowerCase()
            .includes(String(buildingName).toLowerCase());
        if (matchedBuilding) {
          score += 10;
          matchDetails.push(`✅ 楼栋匹配: ${buildingName}`);
        }
      }

      // 4. Availability Filter - Check Intersection
      if (!conflictSet.has(venue.id)) {
        matchDetails.push(`✅ 时间段空闲`);
        scoredCandidates.push({ score, venue, matchDetails });
      }
    }

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    return scoredCandidates;
  }

  async scheduleMaintenance(
    venueId: number,
    startInput: string,
    endInput: string,
    reason: string,
  ): Promise<Reservation> {
    const start = parseDateTimeWithTimezone(startInput, 'start');
    const end = parseDateTimeWithTimezone(endInput, 'end');
    if (end <= start) {
      throw new Error('Maintenance end time must be later than start time');
    }

    const venue = await this.findOne(venueId);
    if (!venue) {
      throw new Error('Venue not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservationRepo = queryRunner.manager.getRepository(Reservation);
      const slotRepo = queryRunner.manager.getRepository(ReservationSlot);
      const notificationRepo = queryRunner.manager.getRepository(Notification);

      // Find overlapping approved/pending reservations and cancel them
      const overlapping = await reservationRepo.find({
        where: {
          venueId,
          status: In([ReservationStatus.APPROVED, ReservationStatus.PENDING]),
          startTime: LessThan(end),
          endTime: MoreThan(start),
        },
      });

      // Check if there's an existing maintenance in this slot
      const existingMaintenance = await reservationRepo.findOne({
        where: {
          venueId,
          status: ReservationStatus.MAINTENANCE,
          startTime: LessThan(end),
          endTime: MoreThan(start),
        },
      });
      if (existingMaintenance) {
        throw new Error('Time slot conflicts with existing maintenance window');
      }

      // Cancel overlapping reservations and notify users
      for (const reservation of overlapping) {
        reservation.status = ReservationStatus.CANCELED;
        reservation.rejectionReason = `场地维护：${reason}`;
        await reservationRepo.save(reservation);

        // Delete their slots
        await slotRepo.delete({ reservationId: reservation.id });

        // Notify the user
        const notification = notificationRepo.create({
          userId: reservation.userId,
          title: '预约已取消 - 场地维护',
          content: `您在"${venue.name}"的预约"${reservation.activityName}"（${reservation.startTime.toLocaleString()} ~ ${reservation.endTime.toLocaleString()}）已因场地维护被取消。原因：${reason}`,
          notificationType: 'system',
        });
        await notificationRepo.save(notification);
      }

      const maintenance = reservationRepo.create({
        venueId,
        userId: venue.adminId || 1,
        activityName: `[Maintenance] ${reason}`,
        startTime: start,
        endTime: end,
        status: ReservationStatus.MAINTENANCE,
        organizer: 'System/Admin',
        organizerUnit: 'Facility Management',
        contactName: 'Admin',
        contactPhone: 'N/A',
        attendeesCount: 0,
        proposalContent: reason,
      });

      const saved = await reservationRepo.save(maintenance);

      const slots = buildSlotWindows(start, end).map((window) =>
        slotRepo.create({
          reservationId: saved.id,
          venueId,
          slotStart: window.start,
          slotEnd: window.end,
        }),
      );
      if (slots.length > 0) {
        try {
          await slotRepo.insert(slots);
        } catch (error) {
          if (isUniqueSlotError(error)) {
            throw new Error(
              'Time slot conflicts with existing reservation or maintenance',
            );
          }
          throw error;
        }
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
