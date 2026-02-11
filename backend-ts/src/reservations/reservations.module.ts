import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { Reservation } from './entities/reservation.entity';
import { LlmModule } from '../llm/llm.module';
import { Venue } from '../venues/entities/venue.entity';
import { ReservationSlot } from './entities/reservation-slot.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Reservation, Venue, ReservationSlot]),
        LlmModule,
    ],
    controllers: [ReservationsController],
    providers: [ReservationsService],
    exports: [ReservationsService],
})
export class ReservationsModule { }
