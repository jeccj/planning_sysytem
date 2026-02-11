import { ReservationStatus } from '../../common/enums';

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
}
