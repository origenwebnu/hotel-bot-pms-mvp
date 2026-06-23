"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LobbyPmsAdapter = void 0;
const shared_1 = require("@hotel-bot/shared");
class LobbyPmsAdapter {
    async getAvailability(credentials, query) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), shared_1.PMS_TIMEOUT_MS);
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
            const data = (await response.json());
            const rooms = this.mapRooms(data);
            return {
                rooms,
                pms_source: 'lobby',
                queried_at: new Date().toISOString(),
            };
        }
        catch (error) {
            const code = error instanceof Error && error.name === 'AbortError'
                ? 'PMS_TIMEOUT'
                : 'PMS_UNAVAILABLE';
            return this.fallbackResult(code);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async holdRoom(credentials, request) {
        const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';
        const expiresAt = new Date(Date.now() + request.hold_ttl_minutes * 60 * 1000);
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
        const data = (await response.json());
        return {
            hold_id: data.hold_id,
            pms_reservation_id: data.reservation_id,
            expires_at: expiresAt.toISOString(),
            room_type_id: request.room_type_id,
            total_amount: data.total_amount,
            currency: data.currency,
        };
    }
    async confirmReservation(credentials, request) {
        const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';
        const response = await fetch(`${baseUrl}/v1/reservations/${request.pms_reservation_id}/confirm`, {
            method: 'POST',
            headers: {
                'X-API-Key': credentials.api_key ?? '',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                guest: request.guest,
            }),
        });
        if (!response.ok) {
            throw new Error(`Lobby PMS confirm failed: ${response.status}`);
        }
        const data = (await response.json());
        return data;
    }
    async releaseHold(credentials, pmsReservationId) {
        const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';
        await fetch(`${baseUrl}/v1/reservations/${pmsReservationId}/cancel`, {
            method: 'POST',
            headers: { 'X-API-Key': credentials.api_key ?? '' },
        });
    }
    async validateCredentials(credentials) {
        try {
            const baseUrl = credentials.base_url ?? 'https://api.lobbypms.com';
            const response = await fetch(`${baseUrl}/v1/properties/${credentials.property_id}`, {
                headers: { 'X-API-Key': credentials.api_key ?? '' },
                signal: AbortSignal.timeout(shared_1.PMS_TIMEOUT_MS),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    mapRooms(data) {
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
    fallbackResult(code) {
        return {
            rooms: [],
            pms_source: 'lobby',
            queried_at: new Date().toISOString(),
            fallback: true,
            fallback_code: code,
        };
    }
}
exports.LobbyPmsAdapter = LobbyPmsAdapter;
//# sourceMappingURL=lobby.adapter.js.map