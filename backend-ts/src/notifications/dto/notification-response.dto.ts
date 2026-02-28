import { Notification } from '../entities/notification.entity';

export class NotificationResponseDto {
  id: number;
  user_id: number;
  title: string;
  content: string;
  is_read: boolean;
  created_at: Date;
  notification_type: string;

  static fromEntity(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      user_id: n.userId,
      title: n.title,
      content: n.content,
      is_read: n.isRead,
      created_at: n.createdAt,
      notification_type: n.notificationType,
    };
  }
}
