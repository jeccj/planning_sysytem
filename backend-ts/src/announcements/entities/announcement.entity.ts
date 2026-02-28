import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
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

  @Column({ name: 'scope_building', nullable: true })
  scopeBuilding: string;

  @Column({ name: 'scope_floor', nullable: true })
  scopeFloor: string;
}
