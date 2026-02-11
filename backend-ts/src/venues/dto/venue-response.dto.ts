import { VenueStatus } from '../../common/enums';

export class VenueResponseDto {
    id: number;
    name: string;
    type: string;
    capacity: number;
    location: string;
    building_name?: string;
    floor_label?: string;
    room_name?: string;
    room_code?: string;
    facilities: string[];
    status: VenueStatus;
    image_url?: string;
    open_hours?: string;
    description?: string;
    admin_id?: number;
    match_details?: string[];
    score?: number;
}
