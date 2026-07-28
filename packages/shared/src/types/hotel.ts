export interface Hotel {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  whatsapp_phone_number_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HotelIntegration {
  hotel_id: string;
  pms_provider?: 'cloudbeds' | 'lobby';
  pms_property_id?: string;
  payment_provider?: 'wompi' | 'stripe' | 'bold' | 'epayco' | 'payu';
  pms_connected: boolean;
  payment_connected: boolean;
  last_validated_at?: string;
}

export interface KnowledgeDocument {
  id: string;
  hotel_id: string;
  title: string;
  content: string;
  source_type: 'text' | 'file';
  file_name?: string;
  is_indexed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  hotel_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'staff';
}
