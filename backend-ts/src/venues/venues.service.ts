import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, In } from 'typeorm';
import { Venue } from './entities/venue.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { VenueStatus, ReservationStatus, UserRole } from '../common/enums';
import { buildVenueLocation, parseVenueLocation } from './utils/location-utils';
import { ReservationSlot } from '../reservations/entities/reservation-slot.entity';
import { DataSource } from 'typeorm';
import { buildSlotWindows, isUniqueSlotError } from '../reservations/utils/slot-utils';
import { parseDateTimeWithTimezone } from '../common/utils/datetime.utils';

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
    ) { }

    async findAll(
        skip: number = 0,
        limit: number = 100,
        scope?: { role?: UserRole; adminId?: number; managedBuilding?: string; managedFloor?: string },
    ): Promise<Venue[]> {
        const qb = this.venueRepository.createQueryBuilder('venue')
            .skip(skip)
            .take(limit)
            .orderBy('venue.location', 'ASC');

        if (scope?.role === UserRole.VENUE_ADMIN) {
            if (scope.managedBuilding) {
                qb.andWhere('(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)', {
                    buildingName: scope.managedBuilding,
                    buildingLike: `%${scope.managedBuilding}%`,
                });
            }
            if (scope.managedFloor) {
                qb.andWhere('venue.floor_label = :floorLabel', { floorLabel: scope.managedFloor });
            }
            if (!scope.managedBuilding && !scope.managedFloor && scope.adminId) {
                qb.andWhere('venue.admin_id = :adminId', { adminId: scope.adminId });
            }
        }

        if (scope?.role === UserRole.FLOOR_ADMIN) {
            if (scope.managedBuilding) {
                qb.andWhere('(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)', {
                    buildingName: scope.managedBuilding,
                    buildingLike: `%${scope.managedBuilding}%`,
                });
            }
            if (scope.managedFloor) {
                qb.andWhere('venue.floor_label = :floorLabel', { floorLabel: scope.managedFloor });
            }
        }

        return qb.getMany();
    }

    async findOne(id: number): Promise<Venue | null> {
        return this.venueRepository.findOne({ where: { id } });
    }

    async create(createVenueDto: CreateVenueDto, adminId: number): Promise<Venue> {
        const parsed = parseVenueLocation(createVenueDto.location, createVenueDto.name);
        const buildingName = createVenueDto.building_name || parsed.buildingName;
        const floorLabel = createVenueDto.floor_label || parsed.floorLabel;
        const roomCode = createVenueDto.room_code || parsed.roomName || createVenueDto.name;
        const location = buildVenueLocation(buildingName, floorLabel, roomCode, createVenueDto.location);

        const venue = this.venueRepository.create({
            name: createVenueDto.name,
            type: createVenueDto.type,
            capacity: createVenueDto.capacity,
            status: createVenueDto.status || VenueStatus.AVAILABLE,
            openHours: createVenueDto.open_hours,
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

    async update(id: number, updateVenueDto: CreateVenueDto): Promise<Venue> {
        const venue = await this.findOne(id);
        if (!venue) {
            throw new Error('Venue not found');
        }

        const oldStatus = venue.status;

        // Update fields
        venue.name = updateVenueDto.name;
        venue.type = updateVenueDto.type;
        venue.capacity = updateVenueDto.capacity;
        venue.status = updateVenueDto.status || venue.status;
        venue.openHours = updateVenueDto.open_hours ?? '';
        venue.description = updateVenueDto.description ?? '';
        venue.imageUrl = updateVenueDto.image_url ?? '';
        if (Object.prototype.hasOwnProperty.call(updateVenueDto, 'photos')) {
            venue.photos = updateVenueDto.photos || [];
        }
        if (updateVenueDto.admin_id) {
            venue.adminId = updateVenueDto.admin_id;
        }

        const nextLocation = updateVenueDto.location || venue.location;
        const parsed = parseVenueLocation(nextLocation, updateVenueDto.name || venue.name);
        venue.buildingName = updateVenueDto.building_name || venue.buildingName || parsed.buildingName;
        venue.floorLabel = updateVenueDto.floor_label || venue.floorLabel || parsed.floorLabel;
        venue.roomCode = updateVenueDto.room_code || venue.roomCode || parsed.roomName || venue.name;
        venue.location = buildVenueLocation(venue.buildingName, venue.floorLabel, venue.roomCode, nextLocation);

        // TypeORM usually handles JSON/array serialization automatically for @Column('simple-json')
        // but ensuring it's set correctly
        if (Object.prototype.hasOwnProperty.call(updateVenueDto, 'facilities')) {
            venue.facilities = updateVenueDto.facilities || [];
        }

        const updatedVenue = await this.venueRepository.save(venue);

        // Maintenance notification logic
        if (oldStatus === VenueStatus.AVAILABLE && updateVenueDto.status === VenueStatus.MAINTENANCE) {
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
        scope?: { role?: UserRole; adminId?: number; managedBuilding?: string; managedFloor?: string },
    ): Promise<BuildingAvailabilityOverview> {
        const qb = this.venueRepository.createQueryBuilder('venue')
            .where('venue.type = :type', { type: 'Classroom' })
            .orderBy('venue.location', 'ASC');

        if (scope?.role === UserRole.VENUE_ADMIN) {
            if (scope.managedBuilding) {
                qb.andWhere('(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)', {
                    buildingName: scope.managedBuilding,
                    buildingLike: `%${scope.managedBuilding}%`,
                });
            }
            if (scope.managedFloor) {
                qb.andWhere('venue.floor_label = :floorLabel', { floorLabel: scope.managedFloor });
            }
            if (!scope.managedBuilding && !scope.managedFloor && scope.adminId) {
                qb.andWhere('venue.admin_id = :adminId', { adminId: scope.adminId });
            }
        }

        if (scope?.role === UserRole.FLOOR_ADMIN) {
            if (scope.managedBuilding) {
                qb.andWhere('(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)', {
                    buildingName: scope.managedBuilding,
                    buildingLike: `%${scope.managedBuilding}%`,
                });
            }
            if (scope.managedFloor) {
                qb.andWhere('venue.floor_label = :floorLabel', { floorLabel: scope.managedFloor });
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
                status: ReservationStatus.APPROVED,
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
            const status: BuildingClassroomStatus['status'] = venue.status === VenueStatus.MAINTENANCE
                ? 'maintenance'
                : (occupiedSet.has(venue.id) ? 'occupied' : 'available');

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
                const available = rooms.filter((room) => room.status === 'available').length;
                const occupied = rooms.filter((room) => room.status === 'occupied').length;
                const maintenance = rooms.filter((room) => room.status === 'maintenance').length;
                return {
                    name,
                    total_classrooms: rooms.length,
                    available_classrooms: available,
                    occupied_classrooms: occupied,
                    maintenance_classrooms: maintenance,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

        const validSelected = building && grouped.has(building) ? building : buildings[0].name;
        const classroomsOfSelected = (grouped.get(validSelected) || []).slice().sort((a, b) => {
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

    async getVenueStructure(scope?: { role?: UserRole; adminId?: number; managedBuilding?: string; managedFloor?: string }): Promise<VenueStructureOverview> {
        const overview = await this.getBuildingAvailability(undefined, scope);
        if (overview.buildings.length === 0) {
            return { buildings: [] };
        }

        const qb = this.venueRepository.createQueryBuilder('venue')
            .where('venue.type = :type', { type: 'Classroom' })
            .orderBy('venue.location', 'ASC');

        if (scope?.role === UserRole.VENUE_ADMIN) {
            if (scope.managedBuilding) {
                qb.andWhere('(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)', {
                    buildingName: scope.managedBuilding,
                    buildingLike: `%${scope.managedBuilding}%`,
                });
            }
            if (scope.managedFloor) {
                qb.andWhere('venue.floor_label = :floorLabel', { floorLabel: scope.managedFloor });
            }
            if (!scope.managedBuilding && !scope.managedFloor && scope.adminId) {
                qb.andWhere('venue.admin_id = :adminId', { adminId: scope.adminId });
            }
        }
        if (scope?.role === UserRole.FLOOR_ADMIN) {
            if (scope.managedBuilding) {
                qb.andWhere('(venue.building_name = :buildingName OR venue.location LIKE :buildingLike)', {
                    buildingName: scope.managedBuilding,
                    buildingLike: `%${scope.managedBuilding}%`,
                });
            }
            if (scope.managedFloor) {
                qb.andWhere('venue.floor_label = :floorLabel', { floorLabel: scope.managedFloor });
            }
        }

        const classrooms = await qb.getMany();
        const now = new Date();
        const active = await this.reservationRepository.find({
            where: {
                venueId: In(classrooms.map((item) => item.id)),
                status: ReservationStatus.APPROVED,
                startTime: LessThan(now),
                endTime: MoreThan(now),
            },
            select: ['venueId'],
        });
        const occupied = new Set(active.map((item) => item.venueId));

        const buildingMap = new Map<string, Map<string, Array<{ id: number; room_code: string; name: string; capacity: number; status: 'available' | 'occupied' | 'maintenance' }>>>();

        for (const venue of classrooms) {
            const parsed = parseVenueLocation(venue.location, venue.name);
            const buildingName = venue.buildingName || parsed.buildingName;
            const floorLabel = venue.floorLabel || parsed.floorLabel;
            const roomCode = venue.roomCode || parsed.roomName || venue.name;
            const status: 'available' | 'occupied' | 'maintenance' = venue.status === VenueStatus.MAINTENANCE
                ? 'maintenance'
                : (occupied.has(venue.id) ? 'occupied' : 'available');

            const floors = buildingMap.get(buildingName) || new Map();
            const rooms = floors.get(floorLabel) || [];
            rooms.push({ id: venue.id, room_code: roomCode, name: venue.name, capacity: venue.capacity, status });
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
                        const available = rooms.filter((item) => item.status === 'available').length;
                        const occupiedCount = rooms.filter((item) => item.status === 'occupied').length;
                        const maintenance = rooms.filter((item) => item.status === 'maintenance').length;
                        return {
                            floor_label: floorLabel,
                            total_classrooms: rooms.length,
                            available_classrooms: available,
                            occupied_classrooms: occupiedCount,
                            maintenance_classrooms: maintenance,
                            classrooms: rooms.sort((a, b) => a.room_code.localeCompare(b.room_code, 'zh-CN')),
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
    ): Promise<{ venue: Venue; matchDetails: string[]; score: number }[]> {
        const queryBuilder = this.venueRepository.createQueryBuilder('venue');

        // Basic capacity check (hard filter)
        // queryBuilder.where('venue.capacity >= :capacity', { capacity });
        // Changed to soft filter to allow showing slightly smaller venues with warning/lower score if needed, 
        // but for now let's keep it in the loop or use a lower bound in SQL.
        // Let's use SQL for efficiency but maybe allow slightly smaller (e.g. 0.8 * cap)
        queryBuilder.where('venue.capacity >= :minCap', { minCap: Math.floor(capacity * 0.8) });

        if (venueType) {
            queryBuilder.andWhere('venue.type = :venueType', { venueType });
        }

        // Filter out non-available venues (including Maintenance)
        queryBuilder.andWhere('venue.status = :status', { status: VenueStatus.AVAILABLE });

        const candidates = await queryBuilder.getMany();
        const scoredCandidates: { score: number; venue: Venue; matchDetails: string[] }[] = [];

        const candidateIds = candidates.map((item) => item.id);
        const conflictSet = new Set<number>();
        if (candidateIds.length > 0) {
            const conflicts = await this.reservationRepository.find({
                where: {
                    venueId: In(candidateIds),
                    status: In([ReservationStatus.APPROVED, ReservationStatus.MAINTENANCE]),
                    startTime: LessThan(end),
                    endTime: MoreThan(start),
                },
                select: ['venueId'],
            });
            conflicts.forEach((item) => conflictSet.add(item.venueId));
        }

        for (const venue of candidates) {
            let score = 10;
            const matchDetails: string[] = [];
            const facilitiesStr = (venue.facilities || []).join(' ');
            const searchableText = `${venue.name} ${venue.type} ${venue.location} ${facilitiesStr}`.toLowerCase();

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
            const typeKeywords = ['教室', '实验室', '礼堂', 'hall', 'lab', 'classroom', 'lecture'];
            if (typeKeywords.some(term => searchableText.includes(term))) {
                score += 5;
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

    async scheduleMaintenance(venueId: number, startInput: string, endInput: string, reason: string): Promise<Reservation> {
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

            const overlap = await reservationRepo.findOne({
                where: {
                    venueId,
                    status: In([ReservationStatus.APPROVED, ReservationStatus.MAINTENANCE]),
                    startTime: LessThan(end),
                    endTime: MoreThan(start),
                },
            });

            if (overlap) {
                throw new Error('Time slot conflicts with existing reservation or maintenance');
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

            const slots = buildSlotWindows(start, end).map((window) => slotRepo.create({
                reservationId: saved.id,
                venueId,
                slotStart: window.start,
                slotEnd: window.end,
            }));
            if (slots.length > 0) {
                try {
                    await slotRepo.insert(slots);
                } catch (error) {
                    if (isUniqueSlotError(error)) {
                        throw new Error('Time slot conflicts with existing reservation or maintenance');
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
