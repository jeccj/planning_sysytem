import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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

    async findForRole(role: UserRole, skip: number = 0, limit: number = 100): Promise<Announcement[]> {
        if (role === UserRole.SYS_ADMIN) {
            return this.findAll(skip, limit);
        }

        // Map UserRole to AnnouncementTargetRole where applicable
        // Logic: 'all' OR role specific target
        let target = AnnouncementTargetRole.ALL;
        if (role === UserRole.STUDENT_TEACHER) target = AnnouncementTargetRole.STUDENT_TEACHER;
        if (role === UserRole.VENUE_ADMIN || role === UserRole.FLOOR_ADMIN) target = AnnouncementTargetRole.VENUE_ADMIN;

        return this.announcementRepository.find({
            where: [
                { targetRole: AnnouncementTargetRole.ALL },
                { targetRole: target }
            ],
            order: { publishTime: 'DESC' },
            skip,
            take: limit,
        });
    }

    async findLatestForRole(role: UserRole): Promise<Announcement | null> {
        const list = await this.findForRole(role, 0, 1);
        return list.length > 0 ? list[0] : null;
    }

    async create(createAnnouncementDto: CreateAnnouncementDto): Promise<Announcement> {
        const announcement = this.announcementRepository.create({
            title: createAnnouncementDto.title,
            content: createAnnouncementDto.content,
            targetRole: createAnnouncementDto.target_role || AnnouncementTargetRole.ALL,
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

        return this.announcementRepository.save(announcement);
    }

    async remove(id: number): Promise<void> {
        await this.announcementRepository.delete(id);
    }
}
