import { escapeHtml } from '../notification.helpers';

/** Admin email body for a manual refund request submitted via /refund. */
export function renderRefundRequestAdminEmailHtml(params: {
  id: string;
  mobile: string;
  trainNumber: string;
  journeyDate: string;
  txnId?: string | null;
  createdAt: string;
  duplicate: boolean;
}): string {
  const rows: Array<[string, string]> = [
    ['Mobile', params.mobile],
    ['Train number', params.trainNumber],
    ['Journey date', params.journeyDate],
    ['Transaction ID', params.txnId?.trim() || '—'],
    ['Request ID', params.id],
    ['Submitted', params.createdAt],
  ];
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0;">
    <h2 style="margin:0 0 8px 0;font-size:18px;">Refund requested 💸</h2>
    ${
      params.duplicate
        ? `<p style="margin:0 0 12px 0;font-size:13px;color:#92400e;">Duplicate of a pending request from the last 24h — no new row was created.</p>`
        : `<p style="margin:0 0 12px 0;font-size:13px;color:#475569;">A user asked for a manual refund via the /refund form. Review it in the admin dashboard under Refunds.</p>`
    }
    <table cellpadding="0" cellspacing="0">${rowsHtml}</table>
  </div>
</body>
</html>`;
}
