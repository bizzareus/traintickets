export type JourneyPayload = {
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode: string;
  stationCodesToMonitor?: string[];
  email?: string;
  mobile?: string;
  trainStartDate?: string;
};

export type CreateQrPaymentInput = JourneyPayload & { amount?: number };

export type QrPaymentResult = {
  qr_code_id: string;
  qr_image: string;
  amount: number;
  currency: string;
  expires_at: string;
};

export type PaymentStatusResult = {
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  qr_code_id: string;
  payments_count_received: number;
  payments_amount_received: number;
  journeyRequestId?: string | null;
};