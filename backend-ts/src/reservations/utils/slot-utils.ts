import { ReservationStatus } from '../../common/enums';

export const SLOT_MINUTES = 5;

export function isBlockingStatus(status: ReservationStatus): boolean {
    return status === ReservationStatus.APPROVED || status === ReservationStatus.MAINTENANCE;
}

export function buildSlotWindows(start: Date, end: Date, slotMinutes: number = SLOT_MINUTES): Array<{ start: Date; end: Date }> {
    const slotMs = slotMinutes * 60 * 1000;
    const fromMs = Math.floor(start.getTime() / slotMs) * slotMs;
    const toMs = Math.ceil(end.getTime() / slotMs) * slotMs;
    const windows: Array<{ start: Date; end: Date }> = [];
    for (let ms = fromMs; ms < toMs; ms += slotMs) {
        windows.push({
            start: new Date(ms),
            end: new Date(ms + slotMs),
        });
    }
    return windows;
}

export function isUniqueSlotError(error: any): boolean {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('unique constraint failed') && msg.includes('reservation_slots');
}
