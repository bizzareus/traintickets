variable "aws_profile" {
  description = "AWS CLI profile name to use for authentication"
  type        = string
  default     = "lastberth"
}

variable "aws_region" {
  description = "AWS region for deployment (e.g. ap-south-1 for Mumbai, ap-southeast-1 for Singapore)"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project name prefix for AWS resources"
  type        = string
  default     = "lastberth"
}

variable "domain_name" {
  description = "Root domain name for frontend"
  type        = string
  default     = "lastberth.com"
}

variable "api_domain_name" {
  description = "API domain name for backend"
  type        = string
  default     = "api.lastberth.com"
}

variable "instance_type" {
  description = "EC2 instance type (t3.micro or t3.small x86)"
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key" {
  description = "Optional SSH public key content for EC2 access"
  type        = string
  default     = ""
}

variable "enable_cloudfront" {
  description = "Set to true once CloudFront verification is approved by AWS Support"
  type        = bool
  default     = false
}
