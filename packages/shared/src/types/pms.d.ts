export interface StandardRoomAvailability {
    room_type_id: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    photos_urls: string[];
    max_occupancy?: number;
    available_units?: number;
}
export interface AvailabilityQuery {
    check_in: string;
    check_out: string;
    adults: number;
    children?: number;
}
export interface AvailabilityResult {
    rooms: StandardRoomAvailability[];
    pms_source: PmsProvider;
    queried_at: string;
    fallback?: boolean;
    fallback_code?: PmsFallbackCode;
}
export type PmsProvider = 'cloudbeds' | 'lobby';
export type PmsFallbackCode = 'PMS_UNAVAILABLE' | 'PMS_TIMEOUT' | 'PMS_AUTH_ERROR' | 'PMS_INVALID_RESPONSE';
export interface RoomHoldRequest {
    room_type_id: string;
    check_in: string;
    check_out: string;
    adults: number;
    children?: number;
    hold_ttl_minutes: number;
    idempotency_key: string;
}
export interface RoomHoldResult {
    hold_id: string;
    pms_reservation_id: string;
    expires_at: string;
    room_type_id: string;
    total_amount: number;
    currency: string;
}
export interface ConfirmReservationRequest {
    hold_id: string;
    pms_reservation_id: string;
    guest: GuestInfo;
}
export interface GuestInfo {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
}
export interface PmsCredentials {
    provider: PmsProvider;
    api_key?: string;
    api_secret?: string;
    property_id?: string;
    base_url?: string;
}
