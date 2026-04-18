/**
 * Central catalogue of product analytics events. Add new actions here so names
 * stay consistent and properties stay typed.
 *
 * popup_* + button_clicked are optimized for PostHog funnels alongside legacy
 * semantic events (monitor_modal_*, irctc_book_clicked, etc.).
 */
export type PopupId =
  | "chart_pending"
  | "monitoring_success"
  | "irctc_disclaimer"
  | "gap_leg_monitor"
  | "helpful_feedback";

export type PopupCloseMethod =
  | "backdrop"
  | "x_button"
  | "go_back"
  | "continue_irctc"
  | "got_it"
  | "cancel"
  | "helpful_yes"
  | "helpful_no";

export type HomeButtonId =
  | "search_submit"
  | "search_again"
  | "swap_stations"
  | "book_ticket_card"
  | "chart_pending_reopen"
  | "chart_pending_monitor_tickets"
  | "gap_leg_monitor_open"
  | "gap_monitor_cancel"
  | "gap_monitor_start"
  | "irctc_disclaimer_go_back"
  | "monitoring_success_got_it"
  | "helpful_feedback_yes"
  | "helpful_feedback_no"
  | "helpful_feedback_irctc";

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
      properties: { success: boolean; error?: string; queued?: boolean };
    }
  | {
      name: "irctc_book_clicked";
      properties: {
        source: "booking_plan" | "openai_plan" | "helpful_feedback";
      };
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
    }
  | {
      name: "popup_opened";
      properties: {
        popup: PopupId;
        plan_source?:
          | "booking_plan"
          | "openai_plan"
          | "helpful_feedback";
        from_code?: string;
        to_code?: string;
      };
    }
  | {
      name: "popup_closed";
      properties: {
        popup: PopupId;
        method: PopupCloseMethod;
      };
    }
  | {
      name: "button_clicked";
      properties: {
        button_id: HomeButtonId;
        plan_source?:
          | "booking_plan"
          | "openai_plan"
          | "helpful_feedback";
        train_number?: string;
        from_code?: string;
        to_code?: string;
      };
    }
  | {
      name: "result_helpfulness_submitted";
      properties: {
        helpful: boolean;
      };
    }
  | {
      name: "search_from_selected";
      properties: { from_code: string; from_name: string };
    }
  | {
      name: "search_to_selected";
      properties: { to_code: string; to_name: string };
    }
  | {
      name: "search_date_selected";
      properties: { journey_date: string };
    }
  | {
      name: "search_tickets_clicked";
      properties: { from_code?: string; to_code?: string; journey_date?: string };
    }
  | {
      name: "alternate_paths_popup_viewed";
      properties: {
        train_number: string;
        from_code: string;
        to_code: string;
        journey_date: string;
        trainStartDate?: string;
      };
    }
  | {
      name: "alternate_paths_popup_loaded";
      properties: {
        train_number: string;
        from_code: string;
        to_code: string;
        journey_date: string;
        success: boolean;
        trainStartDate?: string;
      };
    }
  | {
      name: "alternate_paths_irctc_clicked";
      properties: {
        train_number: string;
        from_code: string;
        to_code: string;
        class_code: string;
        trainStartDate?: string;
      };
    }
  | {
      name: "chart_time_load_failed_booking_popup";
      properties: {
        trainNumber: string;
        legFrom: string;
        journeyDate: string;
      };
    }
  | {
      name: "station_suggestion_failed";
      properties: { error: string; query: string; field: "from" | "to" };
    };

export type AnalyticsEventName = AnalyticsEvent["name"];
