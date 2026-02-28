import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SystemConfig } from '../system-config/entities/system-config.entity';
import { randomUUID } from 'crypto';
import { UserRole } from '../common/enums';
import { ensureLegacySqliteUsersColumns } from '../common/sqlite-schema.util';

const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY_FOR_DEV_ONLY';
const IMPORT_MAINTENANCE_ACTIVE_KEY = 'import_maintenance_active';
const SESSION_IDLE_TIMEOUT_MS = Number(
  process.env.SESSION_IDLE_TIMEOUT_MS || 1000 * 60 * 60 * 24 * 14,
);
const SESSION_TOUCH_INTERVAL_MS = Number(
  process.env.SESSION_TOUCH_INTERVAL_MS || 1000 * 60 * 5,
);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SystemConfig)
    private configRepository: Repository<SystemConfig>,
    private dataSource: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
    if (!process.env.JWT_SECRET) {
      this.logger.warn(
        '⚠️  JWT_SECRET is not set! Using insecure default key. Set JWT_SECRET environment variable for production.',
      );
    }
  }

  async validate(payload: any): Promise<User> {
    await ensureLegacySqliteUsersColumns(this.dataSource);
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokenSessionId = String(payload?.sid || '');
    const currentSessionId = String(user.loginSessionId || '');
    if (!tokenSessionId || tokenSessionId !== currentSessionId) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    const maintenance = await this.configRepository.findOne({
      where: { key: IMPORT_MAINTENANCE_ACTIVE_KEY },
    });
    const isMaintenanceActive =
      String(maintenance?.value || '')
        .trim()
        .toLowerCase() === 'true';
    if (isMaintenanceActive && user.role !== UserRole.SYS_ADMIN) {
      throw new ServiceUnavailableException('系统维护中，暂不可用');
    }

    const now = Date.now();
    const lastActiveAtMs = user.lastActiveAt
      ? new Date(user.lastActiveAt).getTime()
      : 0;
    const isIdleExpired =
      lastActiveAtMs > 0 &&
      Number.isFinite(lastActiveAtMs) &&
      now - lastActiveAtMs > SESSION_IDLE_TIMEOUT_MS;
    if (isIdleExpired) {
      user.loginSessionId = randomUUID();
      user.lastActiveAt = null;
      await this.userRepository.save(user);
      throw new UnauthorizedException('登录超时，请重新登录');
    }

    const shouldTouchActivity =
      !lastActiveAtMs ||
      !Number.isFinite(lastActiveAtMs) ||
      now - lastActiveAtMs > SESSION_TOUCH_INTERVAL_MS;
    if (shouldTouchActivity) {
      user.lastActiveAt = new Date(now);
      await this.userRepository.save(user);
    }

    return user;
  }
}
