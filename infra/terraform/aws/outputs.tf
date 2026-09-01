output "frontend_public_ip" {
  description = "Elastic IP address for the Frontend Next.js VM (point v2.lastberth.com / lastberth.com here)"
  value       = aws_eip.frontend_eip.public_ip
}

output "backend_public_ip" {
  description = "Elastic IP address for the Backend API VM (point api-v2.lastberth.com / api.lastberth.com here)"
  value       = aws_eip.backend_eip.public_ip
}
