"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOB_NAMES = exports.QUEUE_NAMES = exports.WHATSAPP_BUTTON_IDS = exports.MAX_LIST_MESSAGE_ROWS = exports.DEFAULT_ROOM_HOLD_TTL_MINUTES = exports.KNOWLEDGE_INDEX_TIMEOUT_MS = exports.TOTAL_RESPONSE_TIMEOUT_MS = exports.PMS_TIMEOUT_MS = void 0;
exports.PMS_TIMEOUT_MS = 1500;
exports.TOTAL_RESPONSE_TIMEOUT_MS = 3500;
exports.KNOWLEDGE_INDEX_TIMEOUT_MS = 30000;
exports.DEFAULT_ROOM_HOLD_TTL_MINUTES = 10;
exports.MAX_LIST_MESSAGE_ROWS = 10;
exports.WHATSAPP_BUTTON_IDS = {
    RESERVE: 'btn_reserve',
    BACK_TO_ROOMS: 'btn_back_rooms',
    CONFIRM_DATES: 'btn_confirm_dates',
};
exports.QUEUE_NAMES = {
    WHATSAPP_INBOUND: 'whatsapp-inbound',
    WHATSAPP_OUTBOUND: 'whatsapp-outbound',
    PAYMENT_WEBHOOK: 'payment-webhook',
    KNOWLEDGE_INDEX: 'knowledge-index',
    PMS_SYNC: 'pms-sync',
};
exports.JOB_NAMES = {
    PROCESS_MESSAGE: 'process-message',
    SEND_MESSAGE: 'send-message',
    CONFIRM_PAYMENT: 'confirm-payment',
    INDEX_DOCUMENT: 'index-document',
    RELEASE_HOLD: 'release-hold',
};
//# sourceMappingURL=constants.js.map