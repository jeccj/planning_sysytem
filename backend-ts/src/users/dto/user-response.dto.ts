import { UserRole } from '../../common/enums';
import { User } from '../entities/user.entity';

export class UserResponseDto {
  id: number;
  username: string;
  role: UserRole;
  is_first_login: boolean;
  contact_info?: string;
  identity_last6?: string;
  managed_building?: string;
  managed_floor?: string;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      is_first_login: user.isFirstLogin,
      contact_info: user.contactInfo,
      identity_last6: user.identityLast6,
      managed_building: user.managedBuilding,
      managed_floor: user.managedFloor,
    };
  }
}
