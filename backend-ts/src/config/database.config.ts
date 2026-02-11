import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Venue } from '../venues/entities/venue.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Announcement } from '../announcements/entities/announcement.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { SystemConfig } from '../system-config/entities/system-config.entity';
import { ReservationSlot } from '../reservations/entities/reservation-slot.entity';
import * as path from 'path';

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'sqlite',
  database: path.join(__dirname, '../../..', process.env.DATABASE_PATH || 'campus.db'),
  entities: [User, Venue, Reservation, ReservationSlot, Announcement, Notification, SystemConfig],
  synchronize: true, // Set to false to avoid overwriting existing database
  logging: true,
};
