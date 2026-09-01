variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "lastberth"
}

variable "gcp_region" {
  description = "GCP region (e.g. asia-south1 for Mumbai, asia-southeast1 for Singapore)"
  type        = string
  default     = "asia-south1"
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "lastberth"
}

variable "domain_name" {
  description = "Frontend domain"
  type        = string
  default     = "lastberth.com"
}

variable "machine_type" {
  description = "Compute Engine machine type (e2-small: 2 vCPU, 2GB RAM)"
  type        = string
  default     = "e2-small"
}
