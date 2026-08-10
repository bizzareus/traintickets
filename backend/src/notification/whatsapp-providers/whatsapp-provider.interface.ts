export type WhatsAppTemplateParameter = {
  name: string;
  value: string | number | null | undefined;
};

export type SendWhatsAppPayload = {
  mobile: string;
  text: string;
  templateName?: string;
  broadcastName?: string;
  parameters?: WhatsAppTemplateParameter[];
};

export interface WhatsAppProvider {
  readonly providerName: string;
  sendWhatsApp(payload: SendWhatsAppPayload): Promise<boolean>;
}
