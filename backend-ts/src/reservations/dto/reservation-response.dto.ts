import { ReservationStatus } from '../../common/enums';
import { Reservation } from '../entities/reservation.entity';

export class ReservationResponseDto {
    id: number;
    user_id: number;
    venue_id: number;
    venue_name?: string;
    venue_location?: string;
    username?: string;
    start_time: Date;
    end_time: Date;
    activity_name: string;
    organizer?: string;
    organizer_unit: string;
    contact_name: string;
    contact_phone: string;
    attendees_count: number;
    proposal_content: string;
    activity_description?: string;
    proposal_url?: string;
    status: ReservationStatus;
    rejection_reason?: string;
    ai_risk_score?: number;
    ai_audit_comment?: string;

    static fromEntity(r: Reservation): ReservationResponseDto {
        return {
            id: r.id,
            user_id: r.userId,
            venue_id: r.venueId,
            venue_name: (r as any).venue?.name,
            venue_location: (r as any).venue?.location,
            username: (r as any).user?.username,
            start_time: r.startTime,
            end_time: r.endTime,
            activity_name: r.activityName,
            organizer: r.organizer,
            organizer_unit: r.organizerUnit,
            contact_name: r.contactName,
            contact_phone: r.contactPhone,
            attendees_count: r.attendeesCount,
            proposal_content: r.proposalContent,
            activity_description: r.activityDescription,
            proposal_url: r.proposalUrl,
            status: r.status,
            rejection_reason: r.rejectionReason,
            ai_risk_score: r.aiRiskScore,
            ai_audit_comment: r.aiAuditComment,
        };
    }
}
