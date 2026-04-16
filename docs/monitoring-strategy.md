# Monitoring Strategy

> **Note to Candidate:** Document your monitoring and observability approach here.

## Metrics

### Application Metrics

**http_requests_total** → Total number of requests
**http_request_duration_seconds** → Request latency
**process_cpu_seconds_total** → CPU usage
**process_resident_memory_bytes** → Memory usage

### Infrastructure Metrics

**container_cpu_usage_seconds_total** → CPU per container
**container_memory_usage_bytes** → Memory per container
**kube_pod_status_ready** → Pod readiness status
**kube_pod_container_status_restarts_total** → Container restarts

## Logging

### Log Format

Describe the structured logging format you implemented:
{
  "level": "info",
  "message": "request",
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "duration": 12
}

### Log Aggregation Strategy

**ELK Stack or Loki + Grafana**

## Alerting Rules

## Alerting Rules

### High Error Rate
##--------------------------
**alert: HighErrorRate**
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
##--------------------------
**Pod Not Ready**
- alert: PodNotReady
  expr: kube_pod_status_ready{condition="false"} == 1
##------------------------
**High Memory Usage **
- alert: HighMemoryUsage
  expr: container_memory_usage_bytes > 200000000
---
### Alert 1:
## Dashboards

1. Request rate
2. Latency
3. CPU and memory usage
## Distributed Tracing (Bonus)

Can be implemented using OpenTelemetry or Dynatrace

