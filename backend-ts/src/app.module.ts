import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VenuesModule } from './venues/venues.module';
import { ReservationsModule } from './reservations/reservations.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NlpModule } from './nlp/nlp.module';
import { LlmModule } from './llm/llm.module';
import { AppController } from './app.controller';
import { SystemConfigModule } from './system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    AuthModule,
    UsersModule,
    VenuesModule,
    ReservationsModule,
    AnnouncementsModule,
    NotificationsModule,
    NlpModule,
    LlmModule,
    SystemConfigModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule { }
