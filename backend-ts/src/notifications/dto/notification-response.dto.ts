export class NotificationResponseDto {
    id: number;
    user_id: number;
    title: string;
    content: string;
    is_read: boolean;
    created_at: Date;
    notification_type: string;
}
