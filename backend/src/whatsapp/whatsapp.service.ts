import { Injectable, Logger } from '@nestjs/common';
import { OpenaiService } from './openai/openai.service';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly openai: OpenaiService,
    private readonly booking: BookingV2Service,
  ) {}

  async handleIncomingMessage(sender: string, messageText: string, groupId?: string) {
    if (!messageText) return;

    // 1. NLP Parse
    const parsed = await this.openai.parseTicketRequest(messageText, new Date());
    if (!parsed.isTicketRequest) {
      this.logger.debug("Not a ticket request, ignoring.");
      return;
    }
    
    // We only process if we have origin, destination, and date
    if (!parsed.origin || !parsed.destination || !parsed.date) {
        await this.sendReply(sender, groupId, `Please specify the origin, destination, and date (e.g. "Delhi to Mumbai tomorrow")`);
        return;
    }

    // 2. Fetch train data internally
    const dateDdMmYyyy = parsed.date; 
    try {
       // Search stations to resolve codes
       const [fromSuggest, toSuggest] = await Promise.all([
         this.booking.searchStations(parsed.origin) as Promise<any>,
         this.booking.searchStations(parsed.destination) as Promise<any>
       ]);
       
       const fromCode = fromSuggest?.data?.stationList?.[0]?.stationCode;
       const toCode = toSuggest?.data?.stationList?.[0]?.stationCode;

       if (!fromCode || !toCode) {
           await this.sendReply(sender, groupId, `Sorry, couldn't resolve the station codes for ${parsed.origin} to ${parsed.destination}.`);
           return;
       }

       // Perform Train Search
       const trainsData = await this.booking.searchTrains(fromCode, toCode, dateDdMmYyyy) as any;
       const trains = trainsData?.data?.trainList || [];
       if (!trains.length) {
          await this.sendReply(sender, groupId, `No trains found from ${fromCode} to ${toCode} on ${dateDdMmYyyy}`);
          return;
       }

       // Construct output message payload
       let text = `🚆 Top Trains from ${fromCode} to ${toCode} on ${parsed.date}:\n\n`;
       const topTrains = trains.slice(0, 3);
       for (const t of topTrains) {
           const timeInfo = t.departureTime ? `${t.departureTime} -> ${t.arrivalTime || '?'}` : "";
           const classes = t.avlClasses?.join(', ') || "N/A";
           text += `*${t.trainNumber}* ${t.trainName}\n🕒 ${timeInfo}\n🎫 Classes: ${classes}\n\n`;
       }
       text += `Please check the portal to book alternate seats if confirming these is difficult!`;

       await this.sendReply(sender, groupId, text);

    } catch (e) {
       this.logger.error("Error processing flight logic", e);
       await this.sendReply(sender, groupId, `Sorry, ran into an error while finding tickets for you.`);
    }
  }

  private async sendReply(toId: string, groupId: string | undefined, message: string) {
     const wasenderUrl = process.env.WASENDER_API_URL;
     const wasenderKey = process.env.WASENDER_API_KEY;
     const wasenderInstance = process.env.WASENDER_INSTANCE_ID || "1";
     
     if (!wasenderUrl || !wasenderKey) {
         this.logger.warn(`WASENDER config missing! Would have sent to ${groupId || toId}: \n${message}`);
         return;
     }
     
     const target = groupId ? groupId : toId;

     try {
       await axios.post(`${wasenderUrl}/api/send/text`, {
          "number": target, 
          "type": groupId ? "group" : "number",
          "message": message,
          "instance_id": wasenderInstance
       }, {
          headers: { "Authorization": `Bearer ${wasenderKey}` }
       });
       this.logger.log(`Replied to ${target} via wasenderapi`);
     } catch(e) {
       this.logger.error("Failed to send WA message", e);
     }
  }
}
