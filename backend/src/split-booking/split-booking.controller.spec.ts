import { createHmac } from 'node:crypto';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SplitBookingController } from './split-booking.controller';
import type { SplitBookingService } from './split-booking.service';
import type { RazorpayClient } from '../chart-alert-payments/razorpay.client';

describe('Split booking payment trigger', () => {
  const confirmPayment = jest.fn();
  const handleMuzoboxCallback = jest.fn();
  const controller = new SplitBookingController(
    { confirmPayment, handleMuzoboxCallback } as unknown as SplitBookingService,
    { webhookSecret: 'fixture-secret' } as RazorpayClient,
  );
  const callback = (event: string, status: string) => {
    const body = {
      event,
      payload: {
        payment: {
          entity: {
            id: 'pay1',
            status,
            amount: 81000,
            currency: 'INR',
            order_id: 'order1',
            notes: { bookingRef: 'LB-SB-TEST' },
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'fixture-secret')
      .update(rawBody)
      .digest('hex');
    return controller.handleCallback(
      { body, rawBody } as RawBodyRequest<Request>,
      signature,
    );
  };
  beforeEach(() => jest.clearAllMocks());

  it('treats a Muzobox callback as a request for server verification, not payment proof', async () => {
    const body = {
      paymentId: 'mb_test',
      referenceId: 'LB-SB-TEST',
      status: 'paid',
      amount: 1,
      razorpay_payment_id: 'untrusted',
    };
    await controller.handleMuzoboxCallback(body);
    expect(handleMuzoboxCallback).toHaveBeenCalledWith('mb_test', 'LB-SB-TEST');
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { paymentId: 1, referenceId: 'LB-SB-TEST' },
    { paymentId: 'mb_test', referenceId: '' },
  ])('rejects a malformed Muzobox callback: %j', async (body) => {
    await expect(controller.handleMuzoboxCallback(body)).rejects.toThrow(
      'required',
    );
    expect(handleMuzoboxCallback).not.toHaveBeenCalled();
  });

  it.each(['payment.failed', 'payment.authorized', 'refund.processed'])(
    'never launches a reservation for %s',
    async (event) => {
      await callback(event, 'authorized');
      expect(confirmPayment).not.toHaveBeenCalled();
    },
  );
  it('passes captured payment details for amount/order matching', async () => {
    await callback('payment.captured', 'captured');
    expect(confirmPayment).toHaveBeenCalledWith('LB-SB-TEST', 'pay1', {
      amount: 81000,
      currency: 'INR',
      orderId: 'order1',
    });
  });
  it('rejects a captured event whose payment is not captured', async () => {
    await expect(callback('payment.captured', 'failed')).rejects.toThrow(
      'captured payment',
    );
    expect(confirmPayment).not.toHaveBeenCalled();
  });
});

describe('Split booking admin controller endpoints', () => {
  const adminListBookings = jest.fn();
  const adminUpdateBooking = jest.fn();
  const adminUploadTicketPdf = jest.fn();
  const getTicketPdf = jest.fn();
  const adminNotifyCustomer = jest.fn();

  const service = {
    adminListBookings,
    adminUpdateBooking,
    adminUploadTicketPdf,
    getTicketPdf,
    adminNotifyCustomer,
  } as unknown as SplitBookingService;

  const controller = new SplitBookingController(service, {
    webhookSecret: 'fixture-secret',
  } as RazorpayClient);

  const prevEnv = process.env.CHART_TIME_INGESTION_PASSWORD;
  beforeAll(() => {
    process.env.CHART_TIME_INGESTION_PASSWORD = 'admin-secret-password';
  });
  afterAll(() => {
    process.env.CHART_TIME_INGESTION_PASSWORD = prevEnv;
  });
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthorized access without password', async () => {
    await expect(
      controller.adminList(undefined, {} as Request),
    ).rejects.toThrow();
  });

  it('lists bookings when admin password is valid', async () => {
    adminListBookings.mockResolvedValue({ entries: [] });
    const res = await controller.adminList(
      'admin-secret-password',
      {} as Request,
    );
    expect(res).toEqual({ entries: [] });
    expect(adminListBookings).toHaveBeenCalled();
  });

  it('updates booking details and PNRs', async () => {
    adminUpdateBooking.mockResolvedValue({ ok: true });
    const res = await controller.adminUpdate(
      'admin-secret-password',
      {} as Request,
      'booking-123',
      { bookingStatus: 'CONFIRMED', pnrLeg1: '1234567890' },
    );
    expect(res).toEqual({ ok: true });
    expect(adminUpdateBooking).toHaveBeenCalledWith('booking-123', {
      bookingStatus: 'CONFIRMED',
      pnrLeg1: '1234567890',
    });
  });

  it('uploads ticket pdf via base64 or file', async () => {
    adminUploadTicketPdf.mockResolvedValue({ ok: true });
    const res = await controller.adminUploadTicketPdf(
      'admin-secret-password',
      {} as Request,
      'booking-123',
      undefined,
      { base64: 'JVBERi0xLjQK...', filename: 'ticket.pdf' },
    );
    expect(res).toEqual({ ok: true });
    expect(adminUploadTicketPdf).toHaveBeenCalledWith(
      'booking-123',
      undefined,
      {
        base64: 'JVBERi0xLjQK...',
        filename: 'ticket.pdf',
      },
    );
  });

  it('redirects to signed S3 URL when redirectUrl is available', async () => {
    getTicketPdf.mockResolvedValue({
      redirectUrl:
        'https://lastberth-ticket-storage.s3.ap-south-1.amazonaws.com/tickets/LB-123/ticket.pdf?signed=1',
      filename: 'ticket-LB-123.pdf',
      s3Key: 'tickets/LB-123/ticket.pdf',
    });
    const redirect = jest.fn();
    await controller.getTicketPdf('LB-123', undefined, {
      redirect,
    } as unknown as Response);
    expect(redirect).toHaveBeenCalledWith(
      302,
      'https://lastberth-ticket-storage.s3.ap-south-1.amazonaws.com/tickets/LB-123/ticket.pdf?signed=1',
    );
  });

  it('returns JSON with signed URL when requested via json query param', async () => {
    getTicketPdf.mockResolvedValue({
      redirectUrl:
        'https://lastberth-ticket-storage.s3.ap-south-1.amazonaws.com/tickets/LB-123/ticket.pdf?signed=1',
      filename: 'ticket-LB-123.pdf',
      s3Key: 'tickets/LB-123/ticket.pdf',
    });
    const json = jest.fn();
    await controller.getTicketPdf('LB-123', 'true', {
      json,
    } as unknown as Response);
    expect(json).toHaveBeenCalledWith({
      ok: true,
      signedUrl:
        'https://lastberth-ticket-storage.s3.ap-south-1.amazonaws.com/tickets/LB-123/ticket.pdf?signed=1',
      filename: 'ticket-LB-123.pdf',
    });
  });

  it('streams ticket pdf to response for legacy binary storage', async () => {
    getTicketPdf.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4'),
      filename: 'ticket-LB-123.pdf',
      contentType: 'application/pdf',
    });
    const setHeader = jest.fn();
    const send = jest.fn();
    await controller.getTicketPdf('LB-123', undefined, {
      setHeader,
      send,
    } as unknown as Response);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(send).toHaveBeenCalledWith(Buffer.from('%PDF-1.4'));
  });

  it('triggers customer notification', async () => {
    adminNotifyCustomer.mockResolvedValue({
      ok: true,
      emailSent: true,
      whatsappSent: true,
    });
    const res = await controller.adminNotifyCustomer(
      'admin-secret-password',
      {} as Request,
      'booking-123',
      { channel: 'both', message: 'Coach B2' },
    );
    expect(res).toEqual({ ok: true, emailSent: true, whatsappSent: true });
    expect(adminNotifyCustomer).toHaveBeenCalledWith('booking-123', {
      channel: 'both',
      message: 'Coach B2',
    });
  });
});
