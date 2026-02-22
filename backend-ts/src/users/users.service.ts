import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '../common/enums';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    async findAll(skip: number = 0, limit: number = 100): Promise<User[]> {
        return this.userRepository.find({
            skip,
            take: limit,
        });
    }

    async findOne(id: number): Promise<User | null> {
        return this.userRepository.findOne({ where: { id } });
    }

    async findByUsername(username: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { username } });
    }

    sanitizeIdentityLast6(raw?: string): string {
        const cleaned = (raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
        if (!cleaned) return '';
        if (cleaned.length !== 6) {
            throw new BadRequestException('identity_last6 must be exactly 6 characters (digits or X)');
        }
        return cleaned;
    }

    async create(createUserDto: CreateUserDto): Promise<User> {
        if (createUserDto.role === UserRole.FLOOR_ADMIN) {
            if (!createUserDto.managed_building && !createUserDto.managed_floor) {
                throw new BadRequestException('floor_admin requires managed_building or managed_floor');
            }
        }

        const existingUser = await this.findByUsername(createUserDto.username);
        if (existingUser) {
            throw new BadRequestException('Username already exists');
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(createUserDto.password, saltRounds);

        const isScopedAdmin = createUserDto.role === UserRole.FLOOR_ADMIN || createUserDto.role === UserRole.VENUE_ADMIN;
        const user = this.userRepository.create({
            username: createUserDto.username,
            hashedPassword,
            role: createUserDto.role,
            contactInfo: createUserDto.contact_info,
            identityLast6: this.sanitizeIdentityLast6(createUserDto.identity_last6),
            managedBuilding: isScopedAdmin ? (createUserDto.managed_building || '') : '',
            managedFloor: isScopedAdmin ? (createUserDto.managed_floor || '') : '',
        });

        return this.userRepository.save(user);
    }

    async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
        const user = await this.findOne(id);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (typeof updateUserDto.username === 'string') {
            const existingUser = await this.findByUsername(updateUserDto.username);
            if (existingUser && existingUser.id !== id) {
                throw new BadRequestException('Username already exists');
            }
            user.username = updateUserDto.username;
        }

        if (updateUserDto.role !== undefined) {
            user.role = updateUserDto.role;
        }

        if (typeof updateUserDto.password === 'string' && updateUserDto.password.trim() !== '') {
            const saltRounds = 10;
            user.hashedPassword = await bcrypt.hash(updateUserDto.password, saltRounds);
        }

        if (Object.prototype.hasOwnProperty.call(updateUserDto, 'contact_info')) {
            user.contactInfo = updateUserDto.contact_info ?? '';
        }

        if (Object.prototype.hasOwnProperty.call(updateUserDto, 'identity_last6')) {
            user.identityLast6 = this.sanitizeIdentityLast6(updateUserDto.identity_last6);
        }

        const targetRole = updateUserDto.role ?? user.role;
        if (targetRole === UserRole.FLOOR_ADMIN || targetRole === UserRole.VENUE_ADMIN) {
            if (
                targetRole === UserRole.FLOOR_ADMIN &&
                !Object.prototype.hasOwnProperty.call(updateUserDto, 'managed_building') &&
                !Object.prototype.hasOwnProperty.call(updateUserDto, 'managed_floor') &&
                !user.managedBuilding &&
                !user.managedFloor
            ) {
                throw new BadRequestException('floor_admin requires managed_building or managed_floor');
            }
            if (Object.prototype.hasOwnProperty.call(updateUserDto, 'managed_building')) {
                user.managedBuilding = updateUserDto.managed_building ?? '';
            }
            if (Object.prototype.hasOwnProperty.call(updateUserDto, 'managed_floor')) {
                user.managedFloor = updateUserDto.managed_floor ?? '';
            }
            if (targetRole === UserRole.FLOOR_ADMIN && !user.managedBuilding && !user.managedFloor) {
                throw new BadRequestException('floor_admin requires managed_building or managed_floor');
            }
        } else {
            user.managedBuilding = '';
            user.managedFloor = '';
        }

        return this.userRepository.save(user);
    }

    async resetPasswordToIdentityLast6(id: number): Promise<User> {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const identityLast6 = this.sanitizeIdentityLast6(user.identityLast6 || '');
        if (!identityLast6) {
            throw new BadRequestException('User identity_last6 is not configured');
        }

        const saltRounds = 10;
        user.hashedPassword = await bcrypt.hash(identityLast6, saltRounds);
        user.isFirstLogin = true;
        return this.userRepository.save(user);
    }

    async remove(id: number): Promise<void> {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        await this.userRepository.delete(id);
    }
}
