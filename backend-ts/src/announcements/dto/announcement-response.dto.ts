import { AnnouncementTargetRole } from '../../common/enums';
import { Announcement } from '../entities/announcement.entity';

export class AnnouncementResponseDto {
    id: number;
    title: string;
    content: string;
    publish_time: Date;
    target_role: AnnouncementTargetRole;
    scope_building?: string;
    scope_floor?: string;

    static fromEntity(a: Announcement): AnnouncementResponseDto {
        return {
            id: a.id,
            title: a.title,
            content: a.content,
            publish_time: a.publishTime,
            target_role: a.targetRole,
            scope_building: a.scopeBuilding,
            scope_floor: a.scopeFloor,
        };
    }
}
