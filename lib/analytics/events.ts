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
  | {
      name: "best_available_tickets_route_cache_viewed";
      properties: {
        from_code: string;
        to_code: string;
        journey_date: string;
        train_number: string;
        train_name: string | null;
        is_complete: boolean;
        total_fare: number | null;
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
      name: "alert_requested";
      properties: {
        success: boolean;
        source:
          | "shortlink_subscribe"
          | "chart_times_cta"
          | "chart_times_row"
          | "gap_leg_modal"
          | "search_entire_journey"
          | "live_scraper_cockpit"
          | "v1_page";
        source_page?: string;
        train_number: string;
        train_name?: string;
        from_code: string;
        to_code: string;
        journey_date: string;
        class_code?: string;
        has_email: boolean;
        has_mobile: boolean;
        error?: string;
      };
    }
  | {
      name: "monitoring_alert_requested";
      properties: { success: boolean; train_id_present: boolean };
    }
  | {
      name: "popup_opened";
      properties: {
        popup: PopupId;
        plan_source?: "booking_plan" | "openai_plan" | "helpful_feedback";
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
        plan_source?: "booking_plan" | "openai_plan" | "helpful_feedback";
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
      properties: {
        from_code?: string;
        to_code?: string;
        journey_date?: string;
      };
    }
  | {
      name: "best_train_search_clicked";
      properties: {
        from_code: string;
        to_code: string;
        journey_date: string;
        ac_only: boolean;
        /** Total trains in the search result the user is scanning from. */
        train_count: number;
        /** How many of those we actually sent to the backend to scan (capped). */
        scanned_count: number;
      };
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
        /** Whether the full journey was covered by confirmed segments. */
        is_complete?: boolean;
        leg_count?: number;
        total_fare?: number | null;
        /** The available tickets/segments shown in the popup. */
        tickets?: Array<{
          from: string;
          to: string;
          kind: "confirmed" | "check_realtime";
          travel_class: string | null;
          availability: string | null;
          fare: number | null;
        }>;
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
    }
  | {
      name: "chart_times_search_submitted";
      properties: { train_number: string; journey_date: string };
    }
  | {
      name: "chart_times_train_selected";
      properties: { train_number: string };
    }
  | {
      name: "chart_alert_opened";
      properties: {
        source: "page" | "row";
        train_number: string;
        station_code?: string;
      };
    }
  // PNR feature (prefix: search_pnr_*)
  | { name: "search_pnr_feature_clicked"; properties: Record<string, never> }
  | {
      name: "search_pnr_status_checked";
      properties: { success: boolean; error?: string };
    }
  // Seat status / coach map feature (prefix: seat_status_*)
  | { name: "seat_status_feature_clicked"; properties: Record<string, never> }
  | {
      name: "seat_status_checked";
      properties: {
        success: boolean;
        train_number?: string;
        coach?: string;
        error?: string;
      };
    }
  // Auto-search / Experiment A events
  | {
      name: "experiment_a_tickets_loaded";
      properties: {
        train_number: string;
        train_name?: string | null;
        from_code?: string;
        to_code?: string;
        journey_date?: string;
        ticket_count?: number;
        is_complete?: boolean;
      };
    }
  | {
      name: "ticket_details_cta_clicked";
      properties: {
        train_number: string;
        train_name?: string | null;
        from_code?: string;
        to_code?: string;
        journey_date?: string;
        ticket_count?: number;
        is_complete?: boolean;
      };
    };

export type AnalyticsEventName = AnalyticsEvent["name"];
