import type { AvailabilityQuery, AvailabilityResult, ConfirmReservationRequest, PmsCredentials, RoomHoldRequest, RoomHoldResult } from '@hotel-bot/shared';
export interface PmsAdapter {
    getAvailability(credentials: PmsCredentials, query: AvailabilityQuery): Promise<AvailabilityResult>;
    holdRoom(credentials: PmsCredentials, request: RoomHoldRequest): Promise<RoomHoldResult>;
    confirmReservation(credentials: PmsCredentials, request: ConfirmReservationRequest): Promise<{
        reservation_id: string;
        confirmation_code?: string;
    }>;
    releaseHold(credentials: PmsCredentials, pmsReservationId: string): Promise<void>;
    validateCredentials(credentials: PmsCredentials): Promise<boolean>;
}
