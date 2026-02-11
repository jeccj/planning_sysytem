import { AnnouncementTargetRole } from '../../common/enums';

export class AnnouncementResponseDto {
    id: number;
    title: string;
    content: string;
    publish_time: Date;
    target_role: AnnouncementTargetRole;
    scope_building?: string;
    scope_floor?: string;
}
