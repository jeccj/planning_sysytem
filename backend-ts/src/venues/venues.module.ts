import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { Venue } from './entities/venue.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { LlmModule } from '../llm/llm.module';
import { ReservationSlot } from '../reservations/entities/reservation-slot.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Venue, Reservation, Notification, ReservationSlot]),
        LlmModule,
    ],
    controllers: [VenuesController],
    providers: [VenuesService],
    exports: [VenuesService],
})
export class VenuesModule { }
