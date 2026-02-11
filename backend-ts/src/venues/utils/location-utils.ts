export interface ParsedVenueLocation {
    buildingName: string;
    floorLabel: string;
    roomName: string;
}

const DEFAULT_BUILDING = '未分区';
const DEFAULT_FLOOR = '未知楼层';

function normalizeText(value?: string): string {
    return (value || '').replace(/\s+/g, ' ').trim();
}

export function parseVenueLocation(location?: string, fallbackName?: string): ParsedVenueLocation {
    const raw = normalizeText(location) || normalizeText(fallbackName);
    if (!raw) {
        return { buildingName: DEFAULT_BUILDING, floorLabel: DEFAULT_FLOOR, roomName: '' };
    }

    const buildingMatch =
        raw.match(/((?:Building|Block|Tower)\s*[A-Za-z0-9-]+)/i) ||
        raw.match(/([A-Za-z0-9\u4e00-\u9fa5-]+(?:楼|栋|馆|中心|大楼))/) ||
        raw.match(/^([A-Za-z]+(?:-?[A-Za-z0-9]+)?)/);

    const buildingName = buildingMatch?.[1] ? buildingMatch[1].trim() : DEFAULT_BUILDING;
    const floorMatch = raw.match(/((?:B\d+|\d+)[F层]|(?:地上|地下)?\d+层|[一二三四五六七八九十]+层)/);
    const floorLabel = floorMatch?.[1] ? floorMatch[1].trim() : DEFAULT_FLOOR;

    let roomName = '';
    if (buildingMatch?.[1]) {
        roomName = raw.replace(buildingMatch[1], '').replace(/^[\s,，:/\-]+/, '').trim();
    } else {
        const splitParts = raw.split(/[\s,，:/]+/).filter(Boolean);
        roomName = splitParts.length > 1 ? splitParts.slice(1).join(' ') : '';
    }

    if (!roomName) {
        const roomMatch = raw.match(/([A-Za-z]?\d{2,4}[A-Za-z]?室?)/);
        roomName = roomMatch?.[1] || '';
    }

    return {
        buildingName,
        floorLabel,
        roomName,
    };
}

export function buildVenueLocation(buildingName?: string, floorLabel?: string, roomCode?: string, fallback?: string): string {
    const pieces = [normalizeText(buildingName), normalizeText(floorLabel), normalizeText(roomCode)].filter(Boolean);
    if (pieces.length > 0) {
        return pieces.join(' ');
    }
    return normalizeText(fallback);
}
