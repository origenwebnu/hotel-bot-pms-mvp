import { type AvailabilityQuery, type AvailabilityResult, type ConfirmReservationRequest, type PmsCredentials, type RoomHoldRequest, type RoomHoldResult } from '@hotel-bot/shared';
import type { PmsAdapter } from './pms.interface';
export declare class LobbyPmsAdapter implements PmsAdapter {
    getAvailability(credentials: PmsCredentials, query: AvailabilityQuery): Promise<AvailabilityResult>;
    holdRoom(credentials: PmsCredentials, request: RoomHoldRequest): Promise<RoomHoldResult>;
    confirmReservation(credentials: PmsCredentials, request: ConfirmReservationRequest): Promise<{
        reservation_id: string;
        confirmation_code?: string;
    }>;
    releaseHold(credentials: PmsCredentials, pmsReservationId: string): Promise<void>;
    validateCredentials(credentials: PmsCredentials): Promise<boolean>;
    private mapRooms;
    private fallbackResult;
}
