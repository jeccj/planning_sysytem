import { Controller, Get, Put, Body, UseGuards, HttpException, HttpStatus, Post, UploadedFiles, UseInterceptors, BadRequestException, ForbiddenException, Param, NotFoundException, ConflictException, Res } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SystemConfigService } from './system-config.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { User } from '../users/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { getDefaultLlmPrompts, LLM_PROMPT_CONFIG_KEYS, LLM_PROMPT_LOCKED_KEYS } from '../llm/prompt-templates';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
const { runStructuredImport } = require('../../scripts/import-structured');
const { exportStructuredUsersCsv, exportStructuredVenuesCsv } = require('../../scripts/export-structured');

const IMPORT_MAINTENANCE_ACTIVE_KEY = 'import_maintenance_active';
const IMPORT_MAINTENANCE_MESSAGE_KEY = 'import_maintenance_message';

type StructuredImportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface StructuredImportJobState {
    id: string;
    status: StructuredImportJobStatus;
    progress_percent: number;
    phase: string;
    message: string;
    dry_run: boolean;
    replace_classrooms: boolean;
    prune_missing_users: boolean;
    prune_missing_venues: boolean;
    started_at: string;
    updated_at: string;
    finished_at?: string;
    result?: any;
    error?: string;
}

@Controller('system-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYS_ADMIN)
export class SystemConfigController {
    private readonly importJobs = new Map<string, StructuredImportJobState>();
    private importRunning = false;

    constructor(
        private readonly configService: SystemConfigService,
        private readonly authService: AuthService,
    ) { }

    @Get()
    async getAll() {
        const rows = await this.configService.findAll();
        let apiKeyConfigured = false;

        const safeRows = rows.map((item) => {
            if (item.key === 'llm_api_key') {
                apiKeyConfigured = !!String(item.value || '').trim();
                return {
                    ...item,
                    value: '',
                };
            }
            return item;
        });

        safeRows.push({
            key: 'llm_api_key_configured',
            value: apiKeyConfigured ? 'true' : 'false',
            description: 'Whether llm_api_key is configured',
        } as any);

        return safeRows;
    }

    @Get('llm-prompt-defaults')
    getLlmPromptDefaults() {
        return getDefaultLlmPrompts();
    }

    @Put()
    async updateConfigs(
        @CurrentUser() user: User,
        @Body() body: { configs: { key: string; value: string }[]; confirm_password?: string },
    ) {
        if (user.role !== UserRole.SYS_ADMIN) {
            throw new ForbiddenException('Only sys_admin can update system prompts');
        }

        if (!body.configs || !Array.isArray(body.configs)) {
            throw new HttpException('Invalid data format', HttpStatus.BAD_REQUEST);
        }

        const sensitivePromptKeys = new Set<string>(LLM_PROMPT_CONFIG_KEYS);
        const lockedPromptKeys = new Set<string>(LLM_PROMPT_LOCKED_KEYS);
        const defaultPrompts = getDefaultLlmPrompts();
        const nextConfigs: { key: string; value: string }[] = [];

        for (const config of body.configs) {
            if (!config || !config.key) {
                continue;
            }

            if (lockedPromptKeys.has(config.key)) {
                throw new BadRequestException(`'${config.key}' 为固定模板，禁止修改`);
            }

            if (config.key === 'llm_api_key') {
                const nextApiKey = String(config.value || '').trim();
                if (!nextApiKey) {
                    continue;
                }
                nextConfigs.push({ key: config.key, value: nextApiKey });
                continue;
            }

            nextConfigs.push({ key: config.key, value: String(config.value || '') });

            if (!config || !sensitivePromptKeys.has(config.key)) {
                continue;
            }

            const currentValueInDb = await this.configService.findByKey(config.key);
            const editableDefaults = defaultPrompts.editable_defaults as Record<string, string>;
            const currentValue = currentValueInDb === null
                ? String(editableDefaults[config.key] || '')
                : String(currentValueInDb || '');
            const nextValue = String(config.value || '');
            if (nextValue !== currentValue) {
                const confirmPassword = String(body.confirm_password || '').trim();
                if (!confirmPassword) {
                    throw new HttpException('修改 LLM 提示词需要二次输入当前密码', HttpStatus.BAD_REQUEST);
                }
                const verified = await this.authService.verifyPassword(user.id, confirmPassword);
                if (!verified) {
                    throw new HttpException('当前密码校验失败，LLM 提示词未更新', HttpStatus.UNAUTHORIZED);
                }
                break;
            }
        }

        return await this.configService.bulkUpdate(nextConfigs);
    }

    @Post('import/structured')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'users_file', maxCount: 1 },
        { name: 'venues_file', maxCount: 1 },
    ]))
    async importStructured(
        @CurrentUser() user: User,
        @UploadedFiles() files: { users_file?: any[]; venues_file?: any[] },
        @Body() body: { dry_run?: string; replace_classrooms?: string; prune_missing_users?: string; prune_missing_venues?: string },
    ) {
        const payload = this.parseImportPayload(files, body);
        if (this.importRunning) {
            throw new ConflictException('已有导入任务正在执行，请稍后再试');
        }

        this.importRunning = true;
        try {
            const result = await this.runStructuredImportWithMaintenance(payload, user);
            return {
                ok: true,
                message: payload.dryRun ? 'dry-run 验证通过（未落库）' : '导入成功',
                ...result,
            };
        } catch (error) {
            throw new BadRequestException(error?.message || '导入失败：CSV 格式不合法');
        } finally {
            this.importRunning = false;
        }
    }

    @Post('import/structured/start')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'users_file', maxCount: 1 },
        { name: 'venues_file', maxCount: 1 },
    ]))
    async startStructuredImport(
        @CurrentUser() user: User,
        @UploadedFiles() files: { users_file?: any[]; venues_file?: any[] },
        @Body() body: { dry_run?: string; replace_classrooms?: string; prune_missing_users?: string; prune_missing_venues?: string },
    ) {
        if (this.importRunning) {
            throw new ConflictException('已有导入任务正在执行，请稍后再试');
        }

        const payload = this.parseImportPayload(files, body);
        const jobId = randomUUID();
        const now = new Date().toISOString();
        const job: StructuredImportJobState = {
            id: jobId,
            status: 'queued',
            progress_percent: 0,
            phase: 'queued',
            message: '导入任务已排队',
            dry_run: payload.dryRun,
            replace_classrooms: payload.replaceClassrooms,
            prune_missing_users: payload.pruneMissingUsers,
            prune_missing_venues: payload.pruneMissingVenues,
            started_at: now,
            updated_at: now,
        };
        this.importJobs.set(jobId, job);
        this.importRunning = true;

        void this.runStructuredImportWithMaintenance(payload, user, (event: any) => {
            this.updateImportJob(jobId, {
                status: event?.status === 'failed' ? 'failed' : 'running',
                progress_percent: Number(event?.percent || 0),
                phase: String(event?.phase || 'running'),
                message: String(event?.message || '导入执行中'),
            });
        }).then((result: any) => {
            this.updateImportJob(jobId, {
                status: 'completed',
                progress_percent: 100,
                phase: 'done',
                message: payload.dryRun ? 'dry-run 完成（未落库）' : '导入完成',
                finished_at: new Date().toISOString(),
                result: {
                    ok: true,
                    message: payload.dryRun ? 'dry-run 验证通过（未落库）' : '导入成功',
                    ...result,
                },
            });
        }).catch((error: any) => {
            this.updateImportJob(jobId, {
                status: 'failed',
                progress_percent: 100,
                phase: 'failed',
                message: error?.message || '导入失败',
                finished_at: new Date().toISOString(),
                error: error?.message || '导入失败',
                result: {
                    ok: false,
                    message: error?.message || '导入失败',
                },
            });
        }).finally(() => {
            this.importRunning = false;
        });

        return {
            ok: true,
            job_id: jobId,
            message: '导入任务已启动',
        };
    }

    @Get('import/structured/progress/:jobId')
    getStructuredImportProgress(@Param('jobId') jobId: string) {
        const job = this.importJobs.get(jobId);
        if (!job) {
            throw new NotFoundException('导入任务不存在或已过期');
        }
        return {
            ok: true,
            ...job,
        };
    }

    @Get('export/structured/users')
    async exportStructuredUsers(@Res({ passthrough: true }) res: Response) {
        if (this.importRunning) {
            throw new ConflictException('导入进行中，暂不支持导出');
        }
        try {
            const result = await exportStructuredUsersCsv();
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${this.buildExportFilename('users')}"`);
            res.setHeader('X-Structured-Export-Rows', String(result.rows || 0));
            return result.csvText;
        } catch (error) {
            throw new BadRequestException(error?.message || '导出 users.csv 失败');
        }
    }

    @Get('export/structured/venues')
    async exportStructuredVenues(@Res({ passthrough: true }) res: Response) {
        if (this.importRunning) {
            throw new ConflictException('导入进行中，暂不支持导出');
        }
        try {
            const result = await exportStructuredVenuesCsv();
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${this.buildExportFilename('venues')}"`);
            res.setHeader('X-Structured-Export-Rows', String(result.rows || 0));
            return result.csvText;
        } catch (error) {
            throw new BadRequestException(error?.message || '导出 venues.csv 失败');
        }
    }

    private updateImportJob(jobId: string, patch: Partial<StructuredImportJobState>) {
        const current = this.importJobs.get(jobId);
        if (!current) return;
        const nextProgress = Math.max(
            Number(current.progress_percent || 0),
            Number(patch.progress_percent || 0),
        );
        this.importJobs.set(jobId, {
            ...current,
            ...patch,
            progress_percent: Math.min(100, nextProgress),
            updated_at: new Date().toISOString(),
        });
    }

    private parseImportPayload(
        files: { users_file?: any[]; venues_file?: any[] },
        body: { dry_run?: string; replace_classrooms?: string; prune_missing_users?: string; prune_missing_venues?: string },
    ) {
        const usersFile = files?.users_file?.[0];
        const venuesFile = files?.venues_file?.[0];
        if (!usersFile && !venuesFile) {
            throw new BadRequestException('请上传 users_file 或 venues_file 至少一个 CSV 文件');
        }

        return {
            usersCsvText: usersFile ? this.readUploadedFileText(usersFile) : null,
            venuesCsvText: venuesFile ? this.readUploadedFileText(venuesFile) : null,
            dryRun: this.parseBooleanFlag(body?.dry_run, true),
            replaceClassrooms: this.parseBooleanFlag(body?.replace_classrooms, false),
            pruneMissingUsers: this.parseBooleanFlag(body?.prune_missing_users, true),
            pruneMissingVenues: this.parseBooleanFlag(body?.prune_missing_venues, true),
        };
    }

    private buildExportFilename(prefix: string): string {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        return `${prefix}.${stamp}.csv`;
    }

    private async setImportMaintenance(active: boolean, actor?: User) {
        const message = active
            ? `系统维护中：正在执行结构化导入（操作者：${actor?.username || 'unknown'}）`
            : '';
        await this.configService.setBoolean(
            IMPORT_MAINTENANCE_ACTIVE_KEY,
            active,
            'Whether import maintenance mode is active',
        );
        await this.configService.setConfig(
            IMPORT_MAINTENANCE_MESSAGE_KEY,
            message,
            'Import maintenance message',
        );
    }

    private async runStructuredImportWithMaintenance(
        payload: {
            usersCsvText: string | null;
            venuesCsvText: string | null;
            dryRun: boolean;
            replaceClassrooms: boolean;
            pruneMissingUsers: boolean;
            pruneMissingVenues: boolean;
        },
        actor?: User,
        onProgress?: (event: any) => void,
    ) {
        await this.setImportMaintenance(true, actor);
        try {
            return await runStructuredImport({
                usersCsvText: payload.usersCsvText,
                venuesCsvText: payload.venuesCsvText,
                dryRun: payload.dryRun,
                replaceClassrooms: payload.replaceClassrooms,
                pruneMissingUsers: payload.pruneMissingUsers,
                pruneMissingVenues: payload.pruneMissingVenues,
                protectedUsernames: actor?.username ? [actor.username] : [],
                onProgress,
            });
        } finally {
            await this.setImportMaintenance(false, actor);
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
