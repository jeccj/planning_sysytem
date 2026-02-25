import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { VenueStatus } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Reservation } from '../../reservations/entities/reservation.entity';

@Entity('venues')
@Index('idx_venues_building_floor', ['buildingName', 'floorLabel'])
@Index('idx_venues_status', ['status'])
@Index('idx_venues_admin', ['adminId'])
export class Venue {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    type: string;

    @Column()
    capacity: number;

    @Column()
    location: string;

    @Column({ name: 'building_name', nullable: true })
    buildingName: string;

    @Column({ name: 'floor_label', nullable: true })
    floorLabel: string;

    @Column({ name: 'room_code', nullable: true })
    roomCode: string;

    @Column('simple-json')
    facilities: string[];

    @Column({
        type: 'varchar',
        default: VenueStatus.AVAILABLE,
    })
    status: VenueStatus;

    @Column({ name: 'image_url', nullable: true })
    imageUrl: string;

    @Column({ name: 'photos', type: 'simple-json', nullable: true })
    photos: string[];

    @Column({ name: 'open_hours', nullable: true })
    openHours: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'admin_id' })
    adminId: number;

    @ManyToOne(() => User, (user) => user.venuesManaged)
    @JoinColumn({ name: 'admin_id' })
    admin: User;

    @OneToMany(() => Reservation, (reservation) => reservation.venue)
    reservations: Reservation[];
}
