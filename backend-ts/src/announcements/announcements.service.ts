import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement } from './entities/announcement.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { AnnouncementTargetRole, UserRole } from '../common/enums';

@Injectable()
export class AnnouncementsService {
    constructor(
        @InjectRepository(Announcement)
        private announcementRepository: Repository<Announcement>,
    ) { }

    async findAll(skip: number = 0, limit: number = 100): Promise<Announcement[]> {
        return this.announcementRepository.find({
            order: { publishTime: 'DESC' },
            skip,
            take: limit,
        });
    }

    async findForRole(
        role: UserRole,
        skip: number = 0,
        limit: number = 100,
        scope?: { managedBuilding?: string; managedFloor?: string },
    ): Promise<Announcement[]> {
        if (role === UserRole.SYS_ADMIN) {
            return this.findAll(skip, limit);
        }

        const all = await this.announcementRepository.find({
            order: { publishTime: 'DESC' },
            skip,
            take: limit,
        });

        if (role === UserRole.STUDENT_TEACHER) {
            return all.filter((item) => {
                const roleHit = item.targetRole === AnnouncementTargetRole.ALL || item.targetRole === AnnouncementTargetRole.STUDENT_TEACHER;
                return roleHit;
            });
        }

        if (role === UserRole.VENUE_ADMIN || role === UserRole.FLOOR_ADMIN) {
            const managedBuilding = (scope?.managedBuilding || '').trim();
            const managedFloor = (scope?.managedFloor || '').trim();
            if (!managedBuilding && !managedFloor) {
                return [];
            }

            return all.filter((item) => {
                if (item.targetRole !== AnnouncementTargetRole.VENUE_ADMIN) {
                    return false;
                }
                const itemBuilding = (item.scopeBuilding || '').trim();
                const itemFloor = (item.scopeFloor || '').trim();

                const buildingHit = !managedBuilding || itemBuilding === managedBuilding;
                const floorHit = !managedFloor || itemFloor === managedFloor;
                return buildingHit && floorHit;
            });
        }

        return [];
    }

    async findLatestForRole(
        role: UserRole,
        scope?: { managedBuilding?: string; managedFloor?: string },
    ): Promise<Announcement | null> {
        const list = await this.findForRole(role, 0, 100, scope);
        return list.length > 0 ? list[0] : null;
    }

    async create(createAnnouncementDto: CreateAnnouncementDto): Promise<Announcement> {
        const announcement = this.announcementRepository.create({
            title: createAnnouncementDto.title,
            content: createAnnouncementDto.content,
            targetRole: createAnnouncementDto.target_role || AnnouncementTargetRole.ALL,
            scopeBuilding: (createAnnouncementDto.scope_building || '').trim(),
            scopeFloor: (createAnnouncementDto.scope_floor || '').trim(),
        });
        return this.announcementRepository.save(announcement);
    }

    async update(id: number, updateAnnouncementDto: CreateAnnouncementDto): Promise<Announcement> {
        const announcement = await this.announcementRepository.findOne({ where: { id } });
        if (!announcement) {
            throw new Error('Announcement not found');
        }

        announcement.title = updateAnnouncementDto.title;
        announcement.content = updateAnnouncementDto.content;
        if (updateAnnouncementDto.target_role) {
            announcement.targetRole = updateAnnouncementDto.target_role;
        }
        if (Object.prototype.hasOwnProperty.call(updateAnnouncementDto, 'scope_building')) {
            announcement.scopeBuilding = (updateAnnouncementDto.scope_building || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(updateAnnouncementDto, 'scope_floor')) {
            announcement.scopeFloor = (updateAnnouncementDto.scope_floor || '').trim();
        }

        return this.announcementRepository.save(announcement);
    }

    async remove(id: number): Promise<void> {
        await this.announcementRepository.delete(id);
    }
}
