# Static external IP
resource "google_compute_address" "backend_ip" {
  name   = "${var.project_name}-backend-ip"
  region = var.gcp_region
}

# Firewall rule
resource "google_compute_firewall" "allow_http_https" {
  name    = "${var.project_name}-allow-http-https"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["lastberth-api"]
}

# Compute Engine VM
resource "google_compute_instance" "backend" {
  name         = "${var.project_name}-backend"
  machine_type = var.machine_type
  zone         = "${var.gcp_region}-a"

  tags = ["lastberth-api"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = 25 # GB
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.backend_ip.address
    }
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab

    apt-get update
    apt-get install -y ca-certificates curl gnupg git docker.io docker-compose-v2
    systemctl enable docker
    systemctl start docker
  EOF
}
