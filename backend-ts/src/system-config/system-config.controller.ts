import { Controller, Get, Put, Body, UseGuards, HttpException, HttpStatus, Post, UploadedFiles, UseInterceptors, BadRequestException, ForbiddenException } from '@nestjs/common';
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
const { runStructuredImport } = require('../../scripts/import-structured');

@Controller('system-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYS_ADMIN)
export class SystemConfigController {
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
