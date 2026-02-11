import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { TokenResponseDto } from './dto/token-response.dto';

const MAX_BCRYPT_BYTES = 72;

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private jwtService: JwtService,
    ) { }

    async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
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
        const user = await this.userRepository.findOne({ where: { username } });

        if (user && await this.validatePassword(password, user.hashedPassword)) {
            return user;
        }

        return null;
    }

    async login(user: User): Promise<TokenResponseDto> {
        const payload = { sub: user.username, role: user.role };

        return {
            access_token: this.jwtService.sign(payload),
            token_type: 'bearer',
        };
    }

    async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id: userId } });

        if (!user) {
            throw new Error('User not found');
        }

        const isValid = await this.validatePassword(oldPassword, user.hashedPassword);
        if (!isValid) {
            throw new Error('Incorrect old password');
        }

        user.hashedPassword = await this.hashPassword(newPassword);
        user.isFirstLogin = false;

        return this.userRepository.save(user);
    }

    async forgotPasswordByIdentity(username: string, identityLast6: string, newPassword: string): Promise<void> {
        const user = await this.userRepository.findOne({ where: { username } });
        if (!user) {
            throw new Error('User not found');
        }

        const normalizedIdentity = (identityLast6 || '').replace(/\D/g, '');
        const savedIdentity = (user.identityLast6 || '').replace(/\D/g, '');
        if (!normalizedIdentity || normalizedIdentity.length !== 6) {
            throw new Error('identity_last6 must be 6 digits');
        }
        if (!savedIdentity) {
            throw new Error('identity_last6 is not configured');
        }
        if (normalizedIdentity !== savedIdentity) {
            throw new Error('identity_last6 not matched');
        }

        user.hashedPassword = await this.hashPassword(newPassword);
        user.isFirstLogin = false;
        await this.userRepository.save(user);
    }
}
