import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ReservationStatus } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Venue } from '../../venues/entities/venue.entity';

@Entity('reservations')
export class Reservation {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'user_id' })
    userId: number;

    @Column({ name: 'venue_id' })
    venueId: number;

    @Column({ name: 'start_time', type: 'datetime' })
    startTime: Date;

    @Column({ name: 'end_time', type: 'datetime' })
    endTime: Date;

    @Column({ name: 'activity_name' })
    activityName: string;

    @Column({ nullable: true })
    organizer: string;

    @Column({ name: 'organizer_unit', nullable: true })
    organizerUnit: string;

    @Column({ name: 'contact_name', nullable: true })
    contactName: string;

    @Column({ name: 'contact_phone', nullable: true })
    contactPhone: string;

    @Column({ name: 'attendees_count' })
    attendeesCount: number;

    @Column({ name: 'proposal_content', type: 'text' })
    proposalContent: string;

    @Column({
        type: 'varchar',
        default: ReservationStatus.PENDING,
    })
    status: ReservationStatus;

    @Column({ name: 'rejection_reason', nullable: true })
    rejectionReason: string;

    @Column({ name: 'proposal_url', nullable: true })
    proposalUrl: string;

    @Column({ name: 'ai_risk_score', nullable: true, type: 'float' })
    aiRiskScore: number;

    @Column({ name: 'ai_audit_comment', nullable: true, type: 'text' })
    aiAuditComment: string;

    @ManyToOne(() => User, (user) => user.reservations)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => Venue, (venue) => venue.reservations)
    @JoinColumn({ name: 'venue_id' })
    venue: Venue;
}
