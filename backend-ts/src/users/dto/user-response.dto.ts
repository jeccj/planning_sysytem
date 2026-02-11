import { UserRole } from '../../common/enums';

export class UserResponseDto {
    id: number;
    username: string;
    role: UserRole;
    is_first_login: boolean;
    contact_info?: string;
    identity_last6?: string;
    managed_building?: string;
    managed_floor?: string;
}
