/**
 * Central catalogue of product analytics events. Add new actions here so names
 * stay consistent and properties stay typed.
 */
export type AnalyticsEvent =
  | {
      name: "search_submitted";
      properties: {
        train_number: string;
        from_code: string;
        to_code: string;
        journey_date: string;
      };
    }
  | {
      name: "search_completed";
      properties: {
        success: boolean;
        has_chart_status?: boolean;
        error?: string;
      };
    }
  | { name: "swap_stations_clicked"; properties: Record<string, never> }
  | {
      name: "train_selected_from_dropdown";
      properties: { train_number: string };
    }
  | {
      name: "monitor_modal_opened";
      properties: { source: "chart_pending" | "gap_leg" };
    }
  | {
      name: "monitor_modal_closed";
      properties: {
        outcome: "cancel" | "success_dismiss" | "backdrop";
        source?: "chart_pending" | "gap_leg" | "monitoring_started";
      };
    }
  | {
      name: "monitor_journey_submitted";
      properties: { success: boolean; error?: string };
    }
  | {
      name: "irctc_book_clicked";
      properties: { source: "booking_plan" | "openai_plan" };
    }
  | { name: "irctc_open_login_clicked"; properties: Record<string, never> }
  | { name: "auth_login_submitted"; properties: { success: boolean } }
  | { name: "auth_register_submitted"; properties: { success: boolean } }
  | {
      name: "dashboard_viewed";
      properties: { request_count: number };
    }
  | {
      name: "monitoring_alert_requested";
      properties: { success: boolean; train_id_present: boolean };
    };

export type AnalyticsEventName = AnalyticsEvent["name"];
