import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { AnnouncementTargetRole } from '../../common/enums';

@Entity('announcements')
export class Announcement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn({ name: 'publish_time' })
    publishTime: Date;

    @Column({
        type: 'varchar',
        name: 'target_role',
        default: AnnouncementTargetRole.ALL,
    })
    targetRole: AnnouncementTargetRole;
}
