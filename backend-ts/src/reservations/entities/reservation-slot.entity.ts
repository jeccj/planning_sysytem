import { Entity, Column, PrimaryGeneratedColumn, JoinColumn, ManyToOne, Index } from 'typeorm';
import { Reservation } from './reservation.entity';

@Entity('reservation_slots')
@Index(['venueId', 'slotStart'], { unique: true })
@Index('idx_reservation_slots_reservation_id', ['reservationId'])
export class ReservationSlot {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'venue_id' })
    venueId: number;

    @Column({ name: 'reservation_id' })
    reservationId: number;

    @Column({ name: 'slot_start', type: 'datetime' })
    slotStart: Date;

    @Column({ name: 'slot_end', type: 'datetime' })
    slotEnd: Date;

    @ManyToOne(() => Reservation, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'reservation_id' })
    reservation: Reservation;
}
