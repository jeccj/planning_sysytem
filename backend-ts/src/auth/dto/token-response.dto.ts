import { UserRole } from '../../common/enums';

export class TokenResponseDto {
  access_token: string;
  token_type: string;
  user_id: number;
  role: UserRole;
  is_first_login: boolean;
}
