import { ReservationStatus } from '../../common/enums';
import { Reservation } from '../entities/reservation.entity';

export class ReservationResponseDto {
    id: number;
    user_id: number;
    venue_id: number;
    start_time: Date;
    end_time: Date;
    activity_name: string;
    organizer?: string;
    organizer_unit: string;
    contact_name: string;
    contact_phone: string;
    attendees_count: number;
    proposal_content: string;
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
            start_time: r.startTime,
            end_time: r.endTime,
            activity_name: r.activityName,
            organizer: r.organizer,
            organizer_unit: r.organizerUnit,
            contact_name: r.contactName,
            contact_phone: r.contactPhone,
            attendees_count: r.attendeesCount,
            proposal_content: r.proposalContent,
            proposal_url: r.proposalUrl,
            status: r.status,
            rejection_reason: r.rejectionReason,
            ai_risk_score: r.aiRiskScore,
            ai_audit_comment: r.aiAuditComment,
        };
    }
}
