import { createHmac } from 'crypto';

const GALLERY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface GalleryTokenPayload {
  roomId: string;
  sessionId: string;
  hotelId: string;
  exp: number;
}

function getSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-gallery-secret';
}

export function signGalleryToken(payload: {
  roomId: string;
  sessionId: string;
  hotelId: string;
}): string {
  const data: GalleryTokenPayload = {
    ...payload,
    exp: Date.now() + GALLERY_TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyGalleryToken(token: string): GalleryTokenPayload | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  if (expected !== signature) return null;

  try {
    const data = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as GalleryTokenPayload;

    if (
      typeof data.roomId !== 'string' ||
      typeof data.sessionId !== 'string' ||
      typeof data.hotelId !== 'string' ||
      typeof data.exp !== 'number' ||
      data.exp < Date.now()
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}
