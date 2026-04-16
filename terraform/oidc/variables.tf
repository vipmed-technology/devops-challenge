variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "github_repo" {
  description = "GitHub repository in the format owner/repo"
  type        = string
  default     = "esteban1192/devops-challenge"
}
