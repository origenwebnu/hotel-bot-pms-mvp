export type WhatsAppMessageType =
  | 'text'
  | 'interactive'
  | 'image'
  | 'template';

export interface WhatsAppInboundMessage {
  from: string;
  message_id: string;
  timestamp: string;
  type: 'text' | 'interactive' | 'button' | 'image';
  text?: string;
  interactive?: WhatsAppInteractiveReply;
  button?: { payload: string; text: string };
}

export interface WhatsAppInteractiveReply {
  type: 'list_reply' | 'button_reply';
  list_reply?: { id: string; title: string; description?: string };
  button_reply?: { id: string; title: string };
}

export interface WhatsAppListMessage {
  type: 'list';
  header?: { type: 'text'; text: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    button: string;
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
}

export interface WhatsAppButtonMessage {
  type: 'button';
  header?: { type: 'text' | 'image'; text?: string; image?: { link: string } };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
  };
}

export interface WhatsAppTextMessage {
  type: 'text';
  text: { body: string; preview_url?: boolean };
}

export interface WhatsAppCtaUrlMessage {
  type: 'cta_url';
  body: { text: string };
  action: {
    name: 'cta_url';
    parameters: { display_text: string; url: string };
  };
}

export type WhatsAppOutboundMessage =
  | WhatsAppTextMessage
  | WhatsAppListMessage
  | WhatsAppButtonMessage
  | WhatsAppCtaUrlMessage;

export interface ConversationContext {
  hotel_id: string;
  whatsapp_phone: string;
  session_id: string;
  state: ConversationState;
  check_in?: string;
  check_out?: string;
  adults?: number;
  children?: number;
  selected_room_type_id?: string;
  reservation_id?: string;
  last_message_at: string;
}

export type ConversationState =
  | 'idle'
  | 'collecting_dates'
  | 'collecting_guests'
  | 'showing_rooms'
  | 'room_selected'
  | 'collecting_guest_info'
  | 'awaiting_payment'
  | 'confirmed'
  | 'faq';
