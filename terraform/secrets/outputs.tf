output "redis_secret_arn" {
  description = "ARN of the Redis password secret in AWS Secrets Manager"
  value       = aws_secretsmanager_secret.redis_password.arn
}

output "redis_secret_name" {
  description = "Name of the Redis password secret in AWS Secrets Manager"
  value       = aws_secretsmanager_secret.redis_password.name
}
