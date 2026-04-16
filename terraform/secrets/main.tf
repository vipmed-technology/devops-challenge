terraform {
  required_version = ">= 1.5"

  # S3 backend for shared state. For first-time local setup run:
  #   terraform init -backend-config=backend.hcl
  # Create backend.hcl with your bucket/region values, or use:
  #   terraform init -backend=false
  # to skip remote state temporarily.
  backend "s3" {
    bucket       = "esteban-devops-challenge-tf-state"
    key          = "secrets/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "devops-challenge"
      Environment = terraform.workspace
      ManagedBy   = "terraform"
    }
  }
}
