import { Controller, Get, Put, Body, UseGuards, HttpException, HttpStatus, Post, UploadedFiles, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SystemConfigService } from './system-config.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import * as fs from 'fs';
const { runStructuredImport } = require('../../scripts/import-structured');

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

    @Post('import/structured')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'users_file', maxCount: 1 },
        { name: 'venues_file', maxCount: 1 },
    ]))
    async importStructured(
        @UploadedFiles() files: { users_file?: any[]; venues_file?: any[] },
        @Body() body: { dry_run?: string; replace_classrooms?: string },
    ) {
        const usersFile = files?.users_file?.[0];
        const venuesFile = files?.venues_file?.[0];
        if (!usersFile && !venuesFile) {
            throw new BadRequestException('请上传 users_file 或 venues_file 至少一个 CSV 文件');
        }

        const usersCsvText = usersFile ? this.readUploadedFileText(usersFile) : null;
        const venuesCsvText = venuesFile ? this.readUploadedFileText(venuesFile) : null;
        const dryRun = this.parseBooleanFlag(body?.dry_run, true);
        const replaceClassrooms = this.parseBooleanFlag(body?.replace_classrooms, false);

        try {
            const result = await runStructuredImport({
                usersCsvText,
                venuesCsvText,
                dryRun,
                replaceClassrooms,
            });
            return {
                ok: true,
                message: dryRun ? 'dry-run 验证通过（未落库）' : '导入成功',
                ...result,
            };
        } catch (error) {
            throw new BadRequestException(error?.message || '导入失败：CSV 格式不合法');
        }
    }

    private parseBooleanFlag(raw: string | undefined, defaultValue: boolean): boolean {
        if (raw === undefined || raw === null || raw === '') return defaultValue;
        const text = String(raw).trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(text)) return true;
        if (['0', 'false', 'no', 'off'].includes(text)) return false;
        throw new BadRequestException(`无效的布尔参数: ${raw}`);
    }

    private readUploadedFileText(file: any): string {
        if (file?.buffer && Buffer.isBuffer(file.buffer)) {
            return file.buffer.toString('utf8');
        }
        if (file?.path) {
            return fs.readFileSync(file.path, 'utf8');
        }
        throw new BadRequestException(`无法读取上传文件: ${file?.originalname || 'unknown'}`);
    }
}
