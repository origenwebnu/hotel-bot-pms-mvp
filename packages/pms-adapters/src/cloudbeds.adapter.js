"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudbedsAdapter = void 0;
const shared_1 = require("@hotel-bot/shared");
class CloudbedsAdapter {
    async getAvailability(credentials, query) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), shared_1.PMS_TIMEOUT_MS);
        try {
            const baseUrl = credentials.base_url ?? 'https://api.cloudbeds.com';
            const params = new URLSearchParams({
                propertyID: credentials.property_id ?? '',
                startDate: query.check_in,
                endDate: query.check_out,
                adults: String(query.adults),
                children: String(query.children ?? 0),
            });
            const response = await fetch(`${baseUrl}/api/v1.1/getAvailableRoomTypes?${params}`, {
                headers: {
                    Authorization: `Bearer ${credentials.api_key}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });
            if (!response.ok) {
                return this.fallbackResult('PMS_AUTH_ERROR');
            }
            const data = (await response.json());
            const rooms = this.mapRooms(data);
            return {
                rooms,
                pms_source: 'cloudbeds',
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
        const baseUrl = credentials.base_url ?? 'https://api.cloudbeds.com';
        const expiresAt = new Date(Date.now() + request.hold_ttl_minutes * 60 * 1000);
        const response = await fetch(`${baseUrl}/api/v1.1/postReservation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${credentials.api_key}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': request.idempotency_key,
            },
            body: JSON.stringify({
                propertyID: credentials.property_id,
                roomTypeID: request.room_type_id,
                startDate: request.check_in,
                endDate: request.check_out,
                adults: request.adults,
                children: request.children ?? 0,
                status: 'hold',
                holdUntil: expiresAt.toISOString(),
            }),
        });
        if (!response.ok) {
            throw new Error(`Cloudbeds hold failed: ${response.status}`);
        }
        const data = (await response.json());
        return {
            hold_id: data.reservationID,
            pms_reservation_id: data.reservationID,
            expires_at: expiresAt.toISOString(),
            room_type_id: request.room_type_id,
            total_amount: data.grandTotal ?? 0,
            currency: data.currency ?? 'USD',
        };
    }
    async confirmReservation(credentials, request) {
        const baseUrl = credentials.base_url ?? 'https://api.cloudbeds.com';
        const response = await fetch(`${baseUrl}/api/v1.1/putReservation`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${credentials.api_key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                reservationID: request.pms_reservation_id,
                status: 'confirmed',
                guestFirstName: request.guest.first_name,
                guestLastName: request.guest.last_name,
                guestEmail: request.guest.email,
                guestPhone: request.guest.phone,
            }),
        });
        if (!response.ok) {
            throw new Error(`Cloudbeds confirm failed: ${response.status}`);
        }
        const data = (await response.json());
        return {
            reservation_id: data.reservationID,
            confirmation_code: data.confirmationCode,
        };
    }
    async releaseHold(credentials, pmsReservationId) {
        const baseUrl = credentials.base_url ?? 'https://api.cloudbeds.com';
        await fetch(`${baseUrl}/api/v1.1/putReservation`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${credentials.api_key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                reservationID: pmsReservationId,
                status: 'cancelled',
            }),
        });
    }
    async validateCredentials(credentials) {
        try {
            const baseUrl = credentials.base_url ?? 'https://api.cloudbeds.com';
            const response = await fetch(`${baseUrl}/api/v1.1/getHotels?propertyIDs=${credentials.property_id}`, {
                headers: { Authorization: `Bearer ${credentials.api_key}` },
                signal: AbortSignal.timeout(shared_1.PMS_TIMEOUT_MS),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    mapRooms(data) {
        const roomTypes = data.data ?? [];
        return roomTypes.map((rt) => ({
            room_type_id: String(rt.roomTypeID),
            name: rt.roomTypeName,
            description: rt.roomTypeDescription,
            price: rt.roomRate ?? rt.totalRate ?? 0,
            currency: rt.currency ?? 'USD',
            photos_urls: (rt.roomTypePhotos ?? []).map((p) => p.photoURL),
            max_occupancy: rt.maxGuests,
            available_units: rt.roomsAvailable,
        }));
    }
    fallbackResult(code) {
        return {
            rooms: [],
            pms_source: 'cloudbeds',
            queried_at: new Date().toISOString(),
            fallback: true,
            fallback_code: code,
        };
    }
}
exports.CloudbedsAdapter = CloudbedsAdapter;
//# sourceMappingURL=cloudbeds.adapter.js.map