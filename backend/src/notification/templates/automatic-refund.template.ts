import { escapeHtml } from '../notification.helpers';

export function renderAutomaticDeliveryFailureRefundEmailHtml(params: {
  trainNumber: string;
  journeyDate: string;
  amount: number;
  refundId?: string;
}): string {
  const reference = params.refundId
    ? `<p style="margin:8px 0 0;color:#64748b;font-size:13px;">Refund ID: ${escapeHtml(params.refundId)}</p>`
    : '';
  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f8fafc;padding:24px;">
  <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <h2 style="margin:0 0 12px;">Your LastBerth payment is being refunded</h2>
    <p>Due to a railway systems error, we could not process your chart alert for train ${escapeHtml(params.trainNumber)} on ${escapeHtml(params.journeyDate)} in time through email or WhatsApp.</p>
    <p>We have automatically refunded ₹${params.amount} to your original payment method. It usually reflects within 5–7 business days.</p>
    ${reference}
  </div>
</body></html>`;
}
