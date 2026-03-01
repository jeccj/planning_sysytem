import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThan, MoreThan, Repository } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationStatus, UserRole, VenueStatus } from '../common/enums';
import { LlmService } from '../llm/llm.service';
import { Venue } from '../venues/entities/venue.entity';
import { ReservationSlot } from './entities/reservation-slot.entity';
import {
  CreateBatchReservationDto,
  CreateRecurringReservationDto,
  RecurrenceFrequency,
} from './dto/create-recurring-reservation.dto';
import { DataSource } from 'typeorm';
import { parseDateTimeWithTimezone } from '../common/utils/datetime.utils';
import { isReservationWithinVenueOpenHours } from '../common/utils/open-hours.utils';
import { parseVenueLocation } from '../venues/utils/location-utils';
import {
  buildSlotWindows,
  isBlockingStatus,
  isUniqueSlotError,
} from './utils/slot-utils';

type ReservationActor = {
  id: number;
  role: UserRole;
  managedBuilding?: string;
  managedFloor?: string;
};

type ReservationFilter = {
  adminId?: number;
  userId?: number;
  buildingName?: string;
  floorLabel?: string;
  status?: ReservationStatus;
};

type ReservationDraft = {
  venue_id: number;
  start_time: string;
  end_time: string;
  activity_name: string;
  organizer?: string;
  organizer_unit: string;
  contact_name: string;
  contact_phone: string;
  attendees_count: number;
  proposal_content: string;
  activity_description?: string;
};

const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 24 * 60;
const MAX_BATCH_ITEMS = 100;
const MAX_RECURRING_OCCURRENCES = 120;

@Injectable()
export class ReservationsService {
  private readonly MAX_AUDIT_CONCURRENCY = 2;
  private runningAuditTasks = 0;
  private readonly auditQueue: number[] = [];
  private readonly pendingAuditIds = new Set<number>();

  constructor(
    @InjectRepository(Reservation)
    private reservationRepository: Repository<Reservation>,
    @InjectRepository(Venue)
    private venueRepository: Repository<Venue>,
    @InjectRepository(ReservationSlot)
    private slotRepository: Repository<ReservationSlot>,
    private dataSource: DataSource,
    private llmService: LlmService,
  ) {}

  async findAll(
    skip: number = 0,
    limit: number = 100,
    filter?: ReservationFilter,
  ): Promise<Reservation[]> {
    const qb = this.reservationRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.user', 'user')
      .leftJoinAndSelect('reservation.venue', 'venue')
      .orderBy('reservation.startTime', 'DESC')
      .skip(skip)
      .take(limit);

    if (filter?.adminId) {
      qb.andWhere('venue.adminId = :adminId', { adminId: filter.adminId });
    }
    if (filter?.userId) {
      qb.andWhere('reservation.userId = :userId', { userId: filter.userId });
    }
    if (filter?.buildingName) {
      qb.andWhere(
        '(venue.buildingName = :buildingName OR venue.location LIKE :buildingLike)',
        {
          buildingName: filter.buildingName,
          buildingLike: `%${filter.buildingName}%`,
        },
      );
    }
    if (filter?.floorLabel) {
      qb.andWhere('venue.floorLabel = :floorLabel', {
        floorLabel: filter.floorLabel,
      });
    }
    if (filter?.status) {
      qb.andWhere('reservation.status = :status', { status: filter.status });
    }

    return qb.getMany();
  }

  async findOne(id: number): Promise<Reservation | null> {
    return this.reservationRepository.findOne({
      where: { id },
      relations: ['venue'],
    });
  }

  async create(
    createReservationDto: CreateReservationDto,
    userId: number,
    proposalUrl?: string,
  ): Promise<Reservation> {
    const savedReservation = await this.createPendingReservation(
      createReservationDto,
      userId,
      proposalUrl,
    );
    this.enqueueAuditReservation(savedReservation.id);
    return savedReservation;
  }

  async createBatch(createBatchDto: CreateBatchReservationDto, userId: number) {
    const items = createBatchDto.items || [];
    if (items.length < 1) {
      throw new BadRequestException('items is required');
    }
    if (items.length > MAX_BATCH_ITEMS) {
      throw new BadRequestException(
        `Batch size cannot exceed ${MAX_BATCH_ITEMS}`,
      );
    }

    const allOrNothing = !!createBatchDto.all_or_nothing;
    if (allOrNothing) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const created: Reservation[] = [];
        for (const item of items) {
          const row = await this.createPendingReservation(
            item,
            userId,
            undefined,
            queryRunner.manager,
          );
          created.push(row);
        }
        await queryRunner.commitTransaction();
        created.forEach((row) => this.enqueueAuditReservation(row.id));
        return {
          all_or_nothing: true,
          total: items.length,
          created_count: created.length,
          failed_count: 0,
          created_ids: created.map((item) => item.id),
          failed_items: [],
        };
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    }

    const createdIds: number[] = [];
    const failedItems: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const row = await this.createPendingReservation(items[i], userId);
        createdIds.push(row.id);
        this.enqueueAuditReservation(row.id);
      } catch (error) {
        failedItems.push({
          index: i,
          reason: error?.message || 'Create failed',
        });
      }
    }

    return {
      all_or_nothing: false,
      total: items.length,
      created_count: createdIds.length,
      failed_count: failedItems.length,
      created_ids: createdIds,
      failed_items: failedItems,
    };
  }

  async createRecurring(
    createRecurringDto: CreateRecurringReservationDto,
    userId: number,
  ) {
    const occurrences = this.buildRecurringDrafts(createRecurringDto);

    const createdIds: number[] = [];
    const failedItems: Array<{
      start_time: string;
      end_time: string;
      reason: string;
    }> = [];

    for (const occurrence of occurrences) {
      try {
        const row = await this.createPendingReservation(occurrence, userId);
        createdIds.push(row.id);
        this.enqueueAuditReservation(row.id);
      } catch (error) {
        failedItems.push({
          start_time: occurrence.start_time,
          end_time: occurrence.end_time,
          reason: error?.message || 'Create failed',
        });
      }
    }

    return {
      total: occurrences.length,
      created_count: createdIds.length,
      failed_count: failedItems.length,
      created_ids: createdIds,
      failed_items: failedItems,
    };
  }

  async updateStatus(
    id: number,
    updateReservationDto: UpdateReservationDto,
    actor: ReservationActor,
  ): Promise<Reservation> {
    const reservation = await this.findOne(id);
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const targetStatus = updateReservationDto.status;
    const now = new Date();

    if (actor.role === UserRole.STUDENT_TEACHER) {
      if (reservation.userId !== actor.id) {
        throw new ForbiddenException(
          'You can only manage your own reservations',
        );
      }
      if (targetStatus !== ReservationStatus.CANCELED) {
        throw new ForbiddenException('Students can only cancel reservations');
      }
      if (
        reservation.status !== ReservationStatus.PENDING &&
        !(
          reservation.status === ReservationStatus.APPROVED &&
          reservation.startTime > now
        )
      ) {
        throw new BadRequestException(
          'Current reservation status cannot be canceled',
        );
      }

      return this.persistStatusWithSlots(
        id,
        targetStatus,
        updateReservationDto.rejection_reason || '',
      );
    }

    this.assertActorCanManageReservation(actor, reservation);

    // State machine: validate legal status transitions
    this.assertStatusTransitionValid(reservation.status, targetStatus);

    if (targetStatus === ReservationStatus.USED) {
      if (reservation.endTime > now) {
        throw new BadRequestException('Reservation has not ended yet');
      }
    }

    if (
      targetStatus === ReservationStatus.REJECTED &&
      !updateReservationDto.rejection_reason?.trim()
    ) {
      throw new BadRequestException(
        'Rejection reason is required when rejecting a reservation',
      );
    }

    return this.persistStatusWithSlots(
      id,
      targetStatus,
      updateReservationDto.rejection_reason || '',
    );
  }

  async remove(id: number): Promise<void> {
    await this.slotRepository.delete({ reservationId: id });
    await this.reservationRepository.delete(id);
  }

  private async createPendingReservation(
    draft: ReservationDraft,
    userId: number,
    proposalUrl?: string,
    manager?: EntityManager,
  ): Promise<Reservation> {
    const reservationRepo =
      manager?.getRepository(Reservation) || this.reservationRepository;
    const venueRepo = manager?.getRepository(Venue) || this.venueRepository;

    const start = parseDateTimeWithTimezone(draft.start_time, 'start_time');
    const end = parseDateTimeWithTimezone(draft.end_time, 'end_time');
    this.assertTimeRangeValid(start, end);

    if (!Number.isFinite(draft.attendees_count) || draft.attendees_count < 1) {
      throw new BadRequestException('attendees_count must be greater than 0');
    }

    const venue = await venueRepo.findOne({ where: { id: draft.venue_id } });
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }
    if (venue.status !== VenueStatus.AVAILABLE) {
      throw new BadRequestException('Venue is not available for reservation');
    }
    if (draft.attendees_count > venue.capacity) {
      throw new BadRequestException(
        `Attendees exceed venue capacity (${venue.capacity})`,
      );
    }
    if (!isReservationWithinVenueOpenHours(start, end, venue.openHours)) {
      throw new BadRequestException(
        `Reservation time is outside venue open hours (${venue.openHours || '08:00-22:00'})`,
      );
    }

    const overlap = await this.findOverlappingReservationInRepository(
      reservationRepo,
      draft.venue_id,
      start,
      end,
    );
    if (overlap) {
      throw new BadRequestException(
        overlap.status === ReservationStatus.MAINTENANCE
          ? 'Venue is under maintenance during this time'
          : 'Time slot already booked',
      );
    }

    const reservation = reservationRepo.create({
      userId,
      venueId: draft.venue_id,
      startTime: start,
      endTime: end,
      activityName: draft.activity_name,
      organizer: draft.organizer,
      organizerUnit: draft.organizer_unit,
      contactName: draft.contact_name,
      contactPhone: draft.contact_phone,
      attendeesCount: draft.attendees_count,
      proposalContent: draft.proposal_content,
      activityDescription: draft.activity_description,
      proposalUrl: proposalUrl,
      status: ReservationStatus.PENDING,
    });

    return reservationRepo.save(reservation);
  }

  private async persistStatusWithSlots(
    reservationId: number,
    targetStatus: ReservationStatus,
    rejectionReason: string,
  ): Promise<Reservation> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservationRepo = queryRunner.manager.getRepository(Reservation);
      const slotRepo = queryRunner.manager.getRepository(ReservationSlot);

      const reservation = await reservationRepo.findOne({
        where: { id: reservationId },
        relations: ['venue'],
      });

      if (!reservation) {
        throw new NotFoundException('Reservation not found');
      }

      if (isBlockingStatus(targetStatus)) {
        const overlap = await this.findOverlappingReservationInRepository(
          reservationRepo,
          reservation.venueId,
          reservation.startTime,
          reservation.endTime,
          reservation.id,
        );
        if (overlap) {
          throw new BadRequestException(
            overlap.status === ReservationStatus.MAINTENANCE
              ? 'Venue is under maintenance during this time'
              : 'Cannot approve because timeslot is no longer available',
          );
        }
        await this.upsertBlockingSlots(queryRunner.manager, reservation);
      } else if (isBlockingStatus(reservation.status)) {
        await slotRepo.delete({ reservationId: reservation.id });
      }

      reservation.status = targetStatus;
      reservation.rejectionReason = rejectionReason;
      const saved = await reservationRepo.save(reservation);

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async upsertBlockingSlots(
    manager: EntityManager,
    reservation: Reservation,
  ): Promise<void> {
    const slotRepo = manager.getRepository(ReservationSlot);
    await slotRepo.delete({ reservationId: reservation.id });

    const windows = buildSlotWindows(
      reservation.startTime,
      reservation.endTime,
    );
    if (windows.length === 0) {
      return;
    }

    const rows = windows.map((window) =>
      slotRepo.create({
        reservationId: reservation.id,
        venueId: reservation.venueId,
        slotStart: window.start,
        slotEnd: window.end,
      }),
    );

    try {
      await slotRepo.insert(rows);
    } catch (error) {
      if (isUniqueSlotError(error)) {
        throw new BadRequestException('Time slot already booked');
      }
      throw error;
    }
  }

  private async findOverlappingReservationInRepository(
    reservationRepo: Repository<Reservation>,
    venueId: number,
    start: Date,
    end: Date,
    excludeId?: number,
  ): Promise<Reservation | null> {
    const qb = reservationRepo
      .createQueryBuilder('reservation')
      .where('reservation.venueId = :venueId', { venueId })
      .andWhere('reservation.status IN (:...statuses)', {
        statuses: [ReservationStatus.APPROVED, ReservationStatus.MAINTENANCE],
      })
      .andWhere('reservation.startTime < :end', { end })
      .andWhere('reservation.endTime > :start', { start })
      .orderBy('reservation.startTime', 'ASC')
      .take(1);

    if (excludeId) {
      qb.andWhere('reservation.id != :excludeId', { excludeId });
    }

    return qb.getOne();
  }

  private static ALLOWED_STATUS_TRANSITIONS: Record<
    string,
    ReservationStatus[]
  > = {
    [ReservationStatus.PENDING]: [
      ReservationStatus.APPROVED,
      ReservationStatus.REJECTED,
      ReservationStatus.CANCELED,
    ],
    [ReservationStatus.APPROVED]: [
      ReservationStatus.CANCELED,
      ReservationStatus.USED,
      ReservationStatus.REJECTED,
    ],
    // Terminal states: no further transitions allowed
    [ReservationStatus.REJECTED]: [],
    [ReservationStatus.CANCELED]: [],
    [ReservationStatus.USED]: [],
    [ReservationStatus.MAINTENANCE]: [ReservationStatus.CANCELED],
  };

  private assertStatusTransitionValid(
    currentStatus: ReservationStatus,
    targetStatus: ReservationStatus,
  ) {
    const allowed =
      ReservationsService.ALLOWED_STATUS_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${targetStatus}'`,
      );
    }
  }

  private assertTimeRangeValid(start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start_time or end_time');
    }
    if (start <= new Date()) {
      throw new BadRequestException('start_time must be in the future');
    }
    if (end <= start) {
      throw new BadRequestException('end_time must be after start_time');
    }
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
    if (durationMinutes < MIN_DURATION_MINUTES) {
      throw new BadRequestException(
        `Reservation duration must be at least ${MIN_DURATION_MINUTES} minutes`,
      );
    }
    if (durationMinutes > MAX_DURATION_MINUTES) {
      throw new BadRequestException(
        `Reservation duration must be less than ${MAX_DURATION_MINUTES / 60} hours`,
      );
    }
  }

  /** Public scope-check wrapper for use in controller */
  assertActorScope(actor: ReservationActor, reservation: Reservation) {
    this.assertActorCanManageReservation(actor, reservation);
  }

  private assertActorCanManageReservation(
    actor: ReservationActor,
    reservation: Reservation,
  ) {
    if (actor.role === UserRole.SYS_ADMIN) {
      return;
    }

    if (actor.role === UserRole.VENUE_ADMIN) {
      const requiredBuilding = (actor.managedBuilding || '').trim();
      const requiredFloor = (actor.managedFloor || '').trim();
      if (!requiredBuilding && !requiredFloor) {
        throw new ForbiddenException('Venue admin scope is not configured');
      }

      const parsed = parseVenueLocation(
        reservation.venue?.location,
        reservation.venue?.name,
      );
      const venueBuilding =
        reservation.venue?.buildingName || parsed.buildingName;
      const venueFloor = reservation.venue?.floorLabel || parsed.floorLabel;
      if (requiredBuilding && requiredBuilding !== venueBuilding) {
        throw new ForbiddenException(
          'No permission to manage this building reservation',
        );
      }
      if (requiredFloor && requiredFloor !== venueFloor) {
        throw new ForbiddenException(
          'No permission to manage this floor reservation',
        );
      }
      return;
    }

    if (actor.role === UserRole.FLOOR_ADMIN) {
      const parsed = parseVenueLocation(
        reservation.venue?.location,
        reservation.venue?.name,
      );
      const venueBuilding =
        reservation.venue?.buildingName || parsed.buildingName;
      const venueFloor = reservation.venue?.floorLabel || parsed.floorLabel;

      const requiredBuilding = (actor.managedBuilding || '').trim();
      const requiredFloor = (actor.managedFloor || '').trim();
      if (!requiredBuilding && !requiredFloor) {
        throw new ForbiddenException('Floor admin scope is not configured');
      }

      if (requiredBuilding && requiredBuilding !== venueBuilding) {
        throw new ForbiddenException(
          'No permission to manage this building reservation',
        );
      }
      if (requiredFloor && requiredFloor !== venueFloor) {
        throw new ForbiddenException(
          'No permission to manage this floor reservation',
        );
      }
      return;
    }

    throw new ForbiddenException('No permission to manage reservation');
  }

  private buildRecurringDrafts(
    createRecurringDto: CreateRecurringReservationDto,
  ): ReservationDraft[] {
    const baseStart = parseDateTimeWithTimezone(
      createRecurringDto.start_time,
      'start_time',
    );
    const baseEnd = parseDateTimeWithTimezone(
      createRecurringDto.end_time,
      'end_time',
    );
    this.assertTimeRangeValid(baseStart, baseEnd);

    const recurrence = createRecurringDto.recurrence;
    const interval = recurrence.interval || 1;
    const until = recurrence.until
      ? parseDateTimeWithTimezone(recurrence.until, 'recurrence.until')
      : null;

    if (!recurrence.occurrences && !until) {
      throw new BadRequestException(
        'Either recurrence.occurrences or recurrence.until is required',
      );
    }

    const desiredOccurrences = Math.min(
      recurrence.occurrences || MAX_RECURRING_OCCURRENCES,
      MAX_RECURRING_OCCURRENCES,
    );
    const durationMs = baseEnd.getTime() - baseStart.getTime();
    const rows: ReservationDraft[] = [];

    if (recurrence.frequency === RecurrenceFrequency.DAILY) {
      for (let i = 0; rows.length < desiredOccurrences; i++) {
        const start = new Date(
          baseStart.getTime() + i * interval * 24 * 60 * 60 * 1000,
        );
        const end = new Date(start.getTime() + durationMs);
        if (until && start > until) {
          break;
        }
        rows.push(this.withDraftTime(createRecurringDto, start, end));
      }
      return rows;
    }

    const weekdays =
      recurrence.week_days && recurrence.week_days.length > 0
        ? Array.from(new Set(recurrence.week_days)).sort((a, b) => a - b)
        : [baseStart.getUTCDay()];

    const baseDateUtc = Date.UTC(
      baseStart.getUTCFullYear(),
      baseStart.getUTCMonth(),
      baseStart.getUTCDate(),
    );
    const cursor = new Date(baseDateUtc);
    const maxUntil =
      until || new Date(baseStart.getTime() + 400 * 24 * 60 * 60 * 1000);

    let guard = 0;
    while (
      rows.length < desiredOccurrences &&
      cursor <= maxUntil &&
      guard < 5000
    ) {
      guard += 1;
      const dayDateUtc = Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
      );
      const dayDiff = Math.floor(
        (dayDateUtc - baseDateUtc) / (24 * 60 * 60 * 1000),
      );
      if (dayDiff >= 0) {
        const weekIndex = Math.floor(dayDiff / 7);
        const dayOfWeek = cursor.getUTCDay();
        const matchWeek = weekIndex % interval === 0;
        const matchDay = weekdays.includes(dayOfWeek);

        if (matchWeek && matchDay) {
          const start = new Date(
            Date.UTC(
              cursor.getUTCFullYear(),
              cursor.getUTCMonth(),
              cursor.getUTCDate(),
              baseStart.getUTCHours(),
              baseStart.getUTCMinutes(),
              baseStart.getUTCSeconds(),
              baseStart.getUTCMilliseconds(),
            ),
          );
          const end = new Date(start.getTime() + durationMs);
          if (!until || start <= until) {
            rows.push(this.withDraftTime(createRecurringDto, start, end));
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return rows;
  }

  private withDraftTime(
    source: CreateRecurringReservationDto,
    start: Date,
    end: Date,
  ): ReservationDraft {
    return {
      venue_id: source.venue_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      activity_name: source.activity_name,
      organizer: source.organizer,
      organizer_unit: source.organizer_unit,
      contact_name: source.contact_name,
      contact_phone: source.contact_phone,
      attendees_count: source.attendees_count,
      proposal_content: source.proposal_content,
      activity_description: source.activity_description,
    };
  }

  private enqueueAuditReservation(reservationId: number) {
    if (!Number.isFinite(reservationId) || reservationId <= 0) {
      return;
    }
    if (this.pendingAuditIds.has(reservationId)) {
      return;
    }
    this.pendingAuditIds.add(reservationId);
    this.auditQueue.push(reservationId);
    this.drainAuditQueue();
  }

  private drainAuditQueue() {
    while (
      this.runningAuditTasks < this.MAX_AUDIT_CONCURRENCY &&
      this.auditQueue.length > 0
    ) {
      const reservationId = this.auditQueue.shift();
      if (!reservationId) {
        continue;
      }
      this.runningAuditTasks += 1;
      this.runAuditTask(reservationId)
        .catch((error) => {
          console.error(`Failed to audit reservation ${reservationId}:`, error);
        })
        .finally(() => {
          this.runningAuditTasks = Math.max(0, this.runningAuditTasks - 1);
          this.pendingAuditIds.delete(reservationId);
          this.drainAuditQueue();
        });
    }
  }

  private truncateAuditText(value: string, maxLen: number): string {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}…(已截断)`;
  }

  private buildAuditInput(reservation: Reservation): string {
    const venue = reservation.venue;
    const user = reservation.user;
    const lines = [
      `预约编号: ${reservation.id}`,
      `申请人账号: ${user?.username || reservation.organizer || '未知'}`,
      `活动名称: ${reservation.activityName || '未填写'}`,
      `主办单位: ${reservation.organizerUnit || '未填写'}`,
      `负责人: ${reservation.contactName || '未填写'}`,
      `联系电话: ${reservation.contactPhone || '未填写'}`,
      `预计人数: ${reservation.attendeesCount || 0}`,
      `开始时间: ${reservation.startTime ? reservation.startTime.toISOString() : '未填写'}`,
      `结束时间: ${reservation.endTime ? reservation.endTime.toISOString() : '未填写'}`,
      `场地名称: ${venue?.name || '未知'}`,
      `场地类型: ${venue?.type || '未知'}`,
      `场地容量: ${Number.isFinite(Number(venue?.capacity)) ? Number(venue?.capacity) : '未知'}`,
      `场地位置: ${venue?.location || '未知'}`,
      `场地设施: ${Array.isArray(venue?.facilities) && venue.facilities.length > 0 ? venue.facilities.join('、') : '未填写'}`,
      `活动简述: ${this.truncateAuditText(reservation.activityDescription || '', 1200) || '未填写'}`,
      `活动提案: ${this.truncateAuditText(reservation.proposalContent || '', 3000) || '未填写'}`,
    ];

    if (reservation.proposalUrl) {
      lines.push(`附件地址: ${reservation.proposalUrl}`);
    }

    return lines.join('\n');
  }

  private async runAuditTask(reservationId: number) {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['venue', 'user'],
    });

    if (!reservation) {
      return;
    }

    const auditInput = this.buildAuditInput(reservation);
    const auditResult = await this.llmService.auditProposal(auditInput);

    await this.reservationRepository.update(reservationId, {
      aiRiskScore: auditResult.score,
      aiAuditComment: auditResult.reason,
    });
  }
}
