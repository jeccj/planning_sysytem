import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY_FOR_DEV_ONLY';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    private readonly logger = new Logger(JwtStrategy.name);

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: JWT_SECRET,
        });
        if (!process.env.JWT_SECRET) {
            this.logger.warn('⚠️  JWT_SECRET is not set! Using insecure default key. Set JWT_SECRET environment variable for production.');
        }
    }

    async validate(payload: any): Promise<User> {
        const user = await this.userRepository.findOne({
            where: { id: payload.sub }
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const tokenSessionId = String(payload?.sid || '');
        const currentSessionId = String(user.loginSessionId || '');
        if (!tokenSessionId || tokenSessionId !== currentSessionId) {
            throw new UnauthorizedException('登录状态已失效，请重新登录');
        }

        return user;
    }
}
