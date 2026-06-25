export const PMS_TIMEOUT_MS = 1500;
export const TOTAL_RESPONSE_TIMEOUT_MS = 3500;
export const KNOWLEDGE_INDEX_TIMEOUT_MS = 30000;
export const DEFAULT_ROOM_HOLD_TTL_MINUTES = 30;
export const DEFAULT_DISCOUNT_OFFER_MINUTES = 60;
export const MAX_LIST_MESSAGE_ROWS = 10;

export const WHATSAPP_BUTTON_IDS = {
  RESERVE: 'btn_reserve',
  BACK_TO_ROOMS: 'btn_back_rooms',
  CONFIRM_DATES: 'btn_confirm_dates',
  MENU_BOOK: 'btn_menu_book',
  MENU_FAQ: 'btn_menu_faq',
  MENU_RATES: 'btn_menu_rates',
} as const;

export const QUEUE_NAMES = {
  WHATSAPP_INBOUND: 'whatsapp-inbound',
  WHATSAPP_OUTBOUND: 'whatsapp-outbound',
  PAYMENT_WEBHOOK: 'payment-webhook',
  KNOWLEDGE_INDEX: 'knowledge-index',
  PMS_SYNC: 'pms-sync',
  RESERVATION_HOLDS: 'reservation-holds',
} as const;

export const JOB_NAMES = {
  PROCESS_MESSAGE: 'process-message',
  SEND_MESSAGE: 'send-message',
  CONFIRM_PAYMENT: 'confirm-payment',
  INDEX_DOCUMENT: 'index-document',
  RELEASE_HOLD: 'release-hold',
  RELEASE_EXPIRED_HOLDS: 'release-expired-holds',
} as const;
