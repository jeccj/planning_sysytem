import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { UserRole } from '../../common/enums';
import { Venue } from '../../venues/entities/venue.entity';
import { Reservation } from '../../reservations/entities/reservation.entity';
import { Notification } from '../../notifications/entities/notification.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    username: string;

    @Column({ name: 'hashed_password' })
    hashedPassword: string;

    @Column({
        type: 'varchar',
        default: UserRole.STUDENT_TEACHER,
    })
    role: UserRole;

    @Column({ name: 'is_first_login', default: true })
    isFirstLogin: boolean;

    @Column({ name: 'contact_info', nullable: true })
    contactInfo: string;

    @Column({ name: 'identity_last6', nullable: true })
    identityLast6: string;

    @Column({ name: 'managed_building', nullable: true })
    managedBuilding: string;

    @Column({ name: 'managed_floor', nullable: true })
    managedFloor: string;

    @Column({ name: 'login_session_id', nullable: true, default: '' })
    loginSessionId: string;

    @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
    lastLoginAt?: Date | null;

    @Column({ name: 'last_active_at', type: 'datetime', nullable: true })
    lastActiveAt?: Date | null;

    @OneToMany(() => Venue, (venue) => venue.admin)
    venuesManaged: Venue[];

    @OneToMany(() => Reservation, (reservation) => reservation.user)
    reservations: Reservation[];

    @OneToMany(() => Notification, (notification) => notification.user)
    notifications: Notification[];
}
