# Cloud Storage bucket for frontend
resource "google_storage_bucket" "frontend" {
  name     = "${var.project_name}-frontend-static"
  location = "ASIA"

  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }
}

# Make bucket public readable for static site serving
resource "google_storage_bucket_iam_member" "public_rule" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
