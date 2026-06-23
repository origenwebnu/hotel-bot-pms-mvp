export declare const PMS_TIMEOUT_MS = 1500;
export declare const TOTAL_RESPONSE_TIMEOUT_MS = 3500;
export declare const KNOWLEDGE_INDEX_TIMEOUT_MS = 30000;
export declare const DEFAULT_ROOM_HOLD_TTL_MINUTES = 10;
export declare const MAX_LIST_MESSAGE_ROWS = 10;
export declare const WHATSAPP_BUTTON_IDS: {
    readonly RESERVE: "btn_reserve";
    readonly BACK_TO_ROOMS: "btn_back_rooms";
    readonly CONFIRM_DATES: "btn_confirm_dates";
};
export declare const QUEUE_NAMES: {
    readonly WHATSAPP_INBOUND: "whatsapp-inbound";
    readonly WHATSAPP_OUTBOUND: "whatsapp-outbound";
    readonly PAYMENT_WEBHOOK: "payment-webhook";
    readonly KNOWLEDGE_INDEX: "knowledge-index";
    readonly PMS_SYNC: "pms-sync";
};
export declare const JOB_NAMES: {
    readonly PROCESS_MESSAGE: "process-message";
    readonly SEND_MESSAGE: "send-message";
    readonly CONFIRM_PAYMENT: "confirm-payment";
    readonly INDEX_DOCUMENT: "index-document";
    readonly RELEASE_HOLD: "release-hold";
};
