import {
  PMS_TIMEOUT_MS,
  type AvailabilityQuery,
  type AvailabilityResult,
  type ConfirmReservationRequest,
  type PmsCredentials,
  type RoomHoldRequest,
  type RoomHoldResult,
  type StandardRoomAvailability,
} from '@hotel-bot/shared';
import type { PmsAdapter } from './pms.interface';

export class LobbyPmsAdapter implements PmsAdapter {
  async getAvailability(
    credentials: PmsCredentials,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PMS_TIMEOUT_MS);

    try {
      const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';

      const response = await fetch(`${baseUrl}/v1/availability`, {
        method: 'POST',
        headers: {
          'X-API-Key': credentials.api_key ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: credentials.property_id,
          check_in: query.check_in,
          check_out: query.check_out,
          guests: {
            adults: query.adults,
            children: query.children ?? 0,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return this.fallbackResult('PMS_AUTH_ERROR');
      }

      const data = (await response.json()) as LobbyAvailabilityResponse;
      const rooms = this.mapRooms(data);

      return {
        rooms,
        pms_source: 'lobby',
        queried_at: new Date().toISOString(),
      };
    } catch (error) {
      const code =
        error instanceof Error && error.name === 'AbortError'
          ? 'PMS_TIMEOUT'
          : 'PMS_UNAVAILABLE';
      return this.fallbackResult(code);
    } finally {
      clearTimeout(timeout);
    }
  }

  async holdRoom(
    credentials: PmsCredentials,
    request: RoomHoldRequest,
  ): Promise<RoomHoldResult> {
    const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';
    const expiresAt = new Date(
      Date.now() + request.hold_ttl_minutes * 60 * 1000,
    );

    const response = await fetch(`${baseUrl}/v1/reservations/hold`, {
      method: 'POST',
      headers: {
        'X-API-Key': credentials.api_key ?? '',
        'Content-Type': 'application/json',
        'Idempotency-Key': request.idempotency_key,
      },
      body: JSON.stringify({
        property_id: credentials.property_id,
        room_type_id: request.room_type_id,
        check_in: request.check_in,
        check_out: request.check_out,
        adults: request.adults,
        children: request.children ?? 0,
        hold_until: expiresAt.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Lobby PMS hold failed: ${response.status}`);
    }

    const data = (await response.json()) as LobbyHoldResponse;

    return {
      hold_id: data.hold_id,
      pms_reservation_id: data.reservation_id,
      expires_at: expiresAt.toISOString(),
      room_type_id: request.room_type_id,
      total_amount: data.total_amount,
      currency: data.currency,
    };
  }

  async confirmReservation(
    credentials: PmsCredentials,
    request: ConfirmReservationRequest,
  ): Promise<{ reservation_id: string; confirmation_code?: string }> {
    const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';

    const response = await fetch(
      `${baseUrl}/v1/reservations/${request.pms_reservation_id}/confirm`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': credentials.api_key ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guest: request.guest,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Lobby PMS confirm failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      reservation_id: string;
      confirmation_code?: string;
    };
    return data;
  }

  async releaseHold(
    credentials: PmsCredentials,
    pmsReservationId: string,
  ): Promise<void> {
    const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';

    await fetch(`${baseUrl}/v1/reservations/${pmsReservationId}/cancel`, {
      method: 'POST',
      headers: { 'X-API-Key': credentials.api_key ?? '' },
    });
  }

  async validateCredentials(credentials: PmsCredentials): Promise<boolean> {
    try {
      const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';
      const response = await fetch(
        `${baseUrl}/v1/properties/${credentials.property_id}`,
        {
          headers: { 'X-API-Key': credentials.api_key ?? '' },
          signal: AbortSignal.timeout(PMS_TIMEOUT_MS),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private mapRooms(data: LobbyAvailabilityResponse): StandardRoomAvailability[] {
    return (data.room_types ?? []).map((rt) => ({
      room_type_id: rt.id,
      name: rt.name,
      description: rt.description,
      price: rt.rate,
      currency: rt.currency ?? 'USD',
      photos_urls: rt.images ?? [],
      max_occupancy: rt.max_occupancy,
      available_units: rt.available,
    }));
  }

  private fallbackResult(
    code: 'PMS_UNAVAILABLE' | 'PMS_TIMEOUT' | 'PMS_AUTH_ERROR',
  ): AvailabilityResult {
    return {
      rooms: [],
      pms_source: 'lobby',
      queried_at: new Date().toISOString(),
      fallback: true,
      fallback_code: code,
    };
  }
}

interface LobbyAvailabilityResponse {
  room_types?: Array<{
    id: string;
    name: string;
    description?: string;
    rate: number;
    currency?: string;
    images?: string[];
    max_occupancy?: number;
    available?: number;
  }>;
}

interface LobbyHoldResponse {
  hold_id: string;
  reservation_id: string;
  total_amount: number;
  currency: string;
}
