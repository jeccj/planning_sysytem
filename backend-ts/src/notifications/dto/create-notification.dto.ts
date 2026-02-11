import { IsString, IsNotEmpty, IsInt } from 'class-validator';

export class CreateNotificationDto {
    @IsInt()
    @IsNotEmpty()
    user_id: number;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsString()
    @IsNotEmpty()
    notification_type: string;
}
