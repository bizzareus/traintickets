output "gcs_bucket_name" {
  value = google_storage_bucket.frontend.name
}

output "backend_public_ip" {
  value = google_compute_address.backend_ip.address
}
