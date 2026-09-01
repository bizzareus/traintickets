output "s3_bucket_name" {
  description = "S3 bucket for frontend"
  value       = aws_s3_bucket.frontend.id
}

output "s3_website_endpoint" {
  description = "S3 Static Website Hosting HTTP endpoint"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "cloudfront_distribution_id" {
  description = "CloudFront Distribution ID (if enabled)"
  value       = length(aws_cloudfront_distribution.frontend) > 0 ? aws_cloudfront_distribution.frontend[0].id : null
}

output "cloudfront_domain_name" {
  description = "CloudFront default domain name (if enabled)"
  value       = length(aws_cloudfront_distribution.frontend) > 0 ? aws_cloudfront_distribution.frontend[0].domain_name : null
}

output "backend_public_ip" {
  description = "Public IP address for the backend VM"
  value       = aws_eip.backend_eip.public_ip
}
