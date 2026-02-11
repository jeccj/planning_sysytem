import { Controller, Get, Put, Body, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';

@Controller('system-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYS_ADMIN)
export class SystemConfigController {
    constructor(private readonly configService: SystemConfigService) { }

    @Get()
    async getAll() {
        return await this.configService.findAll();
    }

    @Put()
    async updateConfigs(@Body() body: { configs: { key: string; value: string }[] }) {
        if (!body.configs || !Array.isArray(body.configs)) {
            throw new HttpException('Invalid data format', HttpStatus.BAD_REQUEST);
        }
        return await this.configService.bulkUpdate(body.configs);
    }
}
