import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { TokenResponseDto } from './dto/token-response.dto';
import { SystemConfig } from '../system-config/entities/system-config.entity';
import { ensureLegacySqliteUsersColumns } from '../common/sqlite-schema.util';

const MAX_BCRYPT_BYTES = 72;
const IMPORT_MAINTENANCE_ACTIVE_KEY = 'import_maintenance_active';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SystemConfig)
    private configRepository: Repository<SystemConfig>,
    private jwtService: JwtService,
    private dataSource: DataSource,
  ) {}

  private async isImportMaintenanceActive(): Promise<boolean> {
    const config = await this.configRepository.findOne({
      where: { key: IMPORT_MAINTENANCE_ACTIVE_KEY },
    });
    return (
      String(config?.value || '')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  async assertLoginAllowed(): Promise<void> {
    if (await this.isImportMaintenanceActive()) {
      throw new ServiceUnavailableException(
        '系统正在维护（数据导入中），暂不支持登录',
      );
    }
  }

  async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    if (!plainPassword || !hashedPassword) {
      return false;
    }

    if (Buffer.byteLength(plainPassword, 'utf-8') > MAX_BCRYPT_BYTES) {
      return false;
    }

    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    await ensureLegacySqliteUsersColumns(this.dataSource);
    const user = await this.userRepository.findOne({ where: { username } });

    if (user && (await this.validatePassword(password, user.hashedPassword))) {
      return user;
    }

    return null;
  }

  async login(user: User): Promise<TokenResponseDto> {
    await ensureLegacySqliteUsersColumns(this.dataSource);
    const sessionId = randomUUID();
    const now = new Date();
    user.loginSessionId = sessionId;
    user.lastLoginAt = now;
    user.lastActiveAt = now;
    await this.userRepository.save(user);
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      sid: sessionId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'bearer',
      user_id: user.id,
      role: user.role,
      is_first_login: user.isFirstLogin,
    };
  }

  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<User> {
    await ensureLegacySqliteUsersColumns(this.dataSource);
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await this.validatePassword(
      oldPassword,
      user.hashedPassword,
    );
    if (!isValid) {
      throw new Error('Incorrect old password');
    }

    user.hashedPassword = await this.hashPassword(newPassword);
    user.isFirstLogin = false;
    user.loginSessionId = randomUUID();

    return this.userRepository.save(user);
  }

  async verifyPassword(userId: number, password: string): Promise<boolean> {
    await ensureLegacySqliteUsersColumns(this.dataSource);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    return this.validatePassword(password, user.hashedPassword);
  }

  async forgotPasswordByIdentity(
    username: string,
    identityLast6: string,
    newPassword: string,
  ): Promise<void> {
    await ensureLegacySqliteUsersColumns(this.dataSource);
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      throw new Error('User not found');
    }

    const normalizedIdentity = (identityLast6 || '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase();
    const savedIdentity = (user.identityLast6 || '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase();
    if (!normalizedIdentity || normalizedIdentity.length !== 6) {
      throw new Error('identity_last6 must be 6 characters');
    }
    if (!savedIdentity) {
      throw new Error('identity_last6 is not configured');
    }
    if (normalizedIdentity !== savedIdentity) {
      throw new Error('identity_last6 not matched');
    }

    user.hashedPassword = await this.hashPassword(newPassword);
    user.isFirstLogin = true;
    user.loginSessionId = randomUUID();
    await this.userRepository.save(user);
  }
}
