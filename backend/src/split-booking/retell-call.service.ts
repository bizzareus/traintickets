import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SplitTicketBooking } from '@prisma/client';
import Retell from 'retell-sdk';
import { bookingDetails } from './split-booking.helpers';
import { bookingPrice } from './split-booking.pricing';

export const DEFAULT_ADMIN_CALL_PHONE = '+447343092978';
export const DEFAULT_RETELL_FROM_NUMBER = '+14157774444';
export const DEFAULT_RETELL_AGENT_ID = 'agent_b6725826723a9547cc7ccbeb8a';

@Injectable()
export class RetellCallService {
  private readonly logger = new Logger(RetellCallService.name);
  private retellClient: Retell | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RETELL_API_KEY')?.trim();
    if (apiKey) {
      this.retellClient = new Retell({ apiKey });
    }
  }

  /**
   * Triggers an automated outbound phone call alerting the admin of a new paid booking.
   * Never throws — errors are caught and logged so payments and fulfillment are not interrupted.
   */
  async triggerBookingReceivedCall(
    booking: SplitTicketBooking,
  ): Promise<string | null> {
    if (!this.retellClient) {
      this.logger.debug(
        `Retell call skipped for ${booking.bookingRef}: RETELL_API_KEY is not configured`,
      );
      return null;
    }

    const toNumber =
      this.config.get<string>('RETELL_ADMIN_PHONE_NUMBER')?.trim() ||
      DEFAULT_ADMIN_CALL_PHONE;
    const fromNumber =
      this.config.get<string>('RETELL_FROM_NUMBER')?.trim() ||
      DEFAULT_RETELL_FROM_NUMBER;
    const agentId =
      this.config.get<string>('RETELL_AGENT_ID')?.trim() ||
      DEFAULT_RETELL_AGENT_ID;

    if (!fromNumber) {
      this.logger.warn(
        `Retell call skipped for ${booking.bookingRef}: RETELL_FROM_NUMBER is not configured`,
      );
      return null;
    }

    const details = bookingDetails(booking);
    const price = bookingPrice(booking.totalFare, booking.serviceFee);
    const passengerNames = (details.passengers || [])
      .map((p) => p.name)
      .filter(Boolean)
      .join(', ');

    try {
      this.logger.log(
        `Triggering Retell call for ${booking.bookingRef} to ${toNumber} via ${fromNumber}`,
      );

      const callResponse = await this.retellClient.call.createPhoneCall({
        from_number: fromNumber,
        to_number: toNumber,
        ...(agentId
          ? { override_agent_id: agentId, override_agent_version: 1 }
          : {}),
        retell_llm_dynamic_variables: {
          booking_ref: booking.bookingRef,
          train_number: booking.trainNumber,
          train_name: booking.trainName || '',
          route: `${booking.fromStationCode} to ${booking.toStationCode}`,
          journey_date: details.journeyDate,
          amount: String(price.amount),
          total_fare: String(price.totalFare),
          service_fee: String(price.serviceFee),
          booking_mode: booking.bookingMode,
          contact_mobile: booking.contactMobile || '',
          passenger_name: passengerNames || 'Passenger',
        },
      });

      this.logger.log(
        `Retell call initiated for ${booking.bookingRef} (call_id: ${callResponse.call_id})`,
      );
      return callResponse.call_id;
    } catch (error) {
      this.logger.error(
        `Failed to trigger Retell call for ${booking.bookingRef}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }
}
