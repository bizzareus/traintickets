export interface MarketingEngineConfigDto {
  enabled?: boolean;
  minAbandonedMinutes?: number;
  maxLookbackHours?: number;
}

export interface MarketingStatsResponse {
  totalAbandoned: number;
  remindersSent: number;
  recoveredBookings: number;
  recoveryRatePercent: number;
  recoveredRevenue: number;
  lastCronRun: {
    startedAt: string | null;
    status: string | null;
    durationMs: number | null;
    emailsSent: number;
  } | null;
}

export interface AbandonedBookingItem {
  id: string;
  bookingRef: string;
  trainNumber: string;
  trainName: string | null;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  travelClass: string;
  quota: string;
  totalFare: number;
  passengerName: string;
  passengerAge?: number;
  passengerGender?: string;
  contactMobile: string;
  contactEmail: string;
  paymentStatus: string;
  bookingStatus: string;
  createdAt: string;
  abandonedReminderSentAt: string | null;
  status: 'pending_reminder' | 'reminder_sent' | 'recovered' | 'cancelled';
  payUrl: string | null;
}

export interface ProcessMarketingCronResult {
  scanned: number;
  eligible: number;
  sent: number;
  skipped: number;
  errors: string[];
}

export interface AbandonedBookingsQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'pending_reminder' | 'reminder_sent' | 'recovered';
}
