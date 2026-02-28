import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';

@Injectable()
export class SystemConfigService {
    constructor(
        @InjectRepository(SystemConfig)
        private configRepository: Repository<SystemConfig>,
    ) { }

    async findAll(): Promise<SystemConfig[]> {
        return this.configRepository.find();
    }

    async findByKey(key: string): Promise<string | null> {
        const config = await this.configRepository.findOne({ where: { key } });
        return config ? config.value : null;
    }

    async findBoolean(key: string, defaultValue: boolean = false): Promise<boolean> {
        const raw = await this.findByKey(key);
        if (raw === null || raw === undefined || raw === '') return defaultValue;
        const text = String(raw).trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(text)) return true;
        if (['0', 'false', 'no', 'off'].includes(text)) return false;
        return defaultValue;
    }

    async setConfig(key: string, value: string, description?: string): Promise<SystemConfig> {
        let config = await this.configRepository.findOne({ where: { key } });
        if (config) {
            config.value = value;
            if (description) config.description = description;
        } else {
            config = this.configRepository.create({ key, value, description });
        }
        return this.configRepository.save(config);
    }

    async bulkUpdate(configs: { key: string; value: string }[]): Promise<SystemConfig[]> {
        const result: SystemConfig[] = [];
        for (const c of configs) {
            const saved = await this.setConfig(c.key, c.value);
            result.push(saved);
        }
        return result;
    }

    async setBoolean(key: string, value: boolean, description?: string): Promise<SystemConfig> {
        return this.setConfig(key, value ? 'true' : 'false', description);
    }
}
