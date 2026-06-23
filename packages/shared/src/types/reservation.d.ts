export type ReservationStatus = 'inquiry' | 'quoted' | 'hold' | 'payment_pending' | 'confirmed' | 'cancelled' | 'expired';
export interface Reservation {
    id: string;
    hotel_id: string;
    whatsapp_session_id: string;
    idempotency_key: string;
    status: ReservationStatus;
    room_type_id?: string;
    room_name?: string;
    check_in?: string;
    check_out?: string;
    adults?: number;
    children?: number;
    total_amount?: number;
    currency?: string;
    pms_reservation_id?: string;
    hold_expires_at?: string;
    payment_link?: string;
    payment_id?: string;
    guest_first_name?: string;
    guest_last_name?: string;
    guest_email?: string;
    guest_phone?: string;
    created_at: string;
    updated_at: string;
}
