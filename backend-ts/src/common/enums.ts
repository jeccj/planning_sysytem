export enum UserRole {
    STUDENT_TEACHER = 'student_teacher',
    VENUE_ADMIN = 'venue_admin',
    FLOOR_ADMIN = 'floor_admin',
    SYS_ADMIN = 'sys_admin',
}

export enum VenueStatus {
    AVAILABLE = 'available',
    MAINTENANCE = 'maintenance',
}

export enum ReservationStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CANCELED = 'canceled',
    USED = 'used',
    MAINTENANCE = 'maintenance',
}

export enum AnnouncementTargetRole {
    ALL = 'all',
    STUDENT_TEACHER = 'student_teacher',
    VENUE_ADMIN = 'venue_admin',
}
