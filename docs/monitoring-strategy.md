# Monitoring & Observability Strategy

## Overview

This document outlines the monitoring strategy for the microservices application, covering metrics collection, logging, and alerting.

---

## 1. Metrics Collection (Prometheus)

### Implementation
Both services expose Prometheus metrics at the `/metrics` endpoint using the `prom-client` library.

### Metrics Collected

**Default Metrics:**
- Process CPU and memory usage
- Node.js event loop lag
- Garbage collection statistics

**Custom Application Metrics:**

*API Gateway:*
- `http_requests_total` - Total HTTP requests (by method, route, status)
- `http_request_duration_seconds` - Request latency histogram
- `upstream_request_duration_seconds` - User service call latency

*User Service:*
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency histogram
- `redis_operation_duration_seconds` - Redis operation latency
- `user_operations_total` - User CRUD operations (by type and status)

### Deployment Options

**Option A: In-Cluster (Recommended for this project)**
```bash
# Install Prometheus + Grafana with Helm
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace
```

**Option B: Managed Service**
- Datadog, New Relic, Grafana Cloud
- Lower operational overhead
- Higher cost

---

## 2. Logging Strategy

### Implementation
Structured JSON logging using Winston library.

### Log Format
```json
{
  "timestamp": "2026-02-09T10:30:00.000Z",
  "level": "info",
  "service": "api-gateway",
  "message": "HTTP request",
  "method": "GET",
  "path": "/api/users",
  "statusCode": 200,
  "duration": "0.045s"
}
```

### Log Levels
- **Production:** `info` (errors, warnings, important events)
- **Development:** `debug` (all events including debug info)

### Log Aggregation
- **Current:** Logs to stdout (captured by Kubernetes)
- **Recommended:** Grafana Loki or ELK stack for centralized logging

---

## 3. Health Checks

Each service exposes three health endpoints:

- `/health` - Basic health status
- `/health/live` - Liveness probe (is the process running?)
- `/health/ready` - Readiness probe (can it handle traffic?)

Kubernetes uses these for:
- **Liveness:** Restart unhealthy pods
- **Readiness:** Remove unhealthy pods from load balancing

---

## 4. Alerting Rules

### Critical Alerts (Page Immediately)

**1. Service Down**
```yaml
alert: ServiceDown
expr: up{job="devops-challenge"} == 0
for: 1m
severity: critical
description: "{{ $labels.service }} is down"
```
**Impact:** Service unavailable to users  
**Action:** Check pod status, logs, and recent deployments

**2. High Error Rate**
```yaml
alert: HighErrorRate
expr: |
  rate(http_requests_total{status_code=~"5.."}[5m]) 
  / rate(http_requests_total[5m]) > 0.05
for: 5m
severity: critical
description: "Error rate above 5% for {{ $labels.service }}"
```
**Impact:** Users experiencing errors  
**Action:** Check application logs, verify dependencies

**3. Redis Connection Failure**
```yaml
alert: RedisDown
expr: up{job="redis"} == 0
for: 2m
severity: critical
description: "Redis is unreachable"
```
**Impact:** User service cannot read/write data  
**Action:** Check Redis pod status and network connectivity

### Warning Alerts (Investigate During Business Hours)

**4. High Latency**
```yaml
alert: HighLatency
expr: |
  histogram_quantile(0.95, 
    rate(http_request_duration_seconds_bucket[5m])
  ) > 2
for: 10m
severity: warning
description: "P95 latency above 2s for {{ $labels.service }}"
```
**Impact:** Slow user experience  
**Action:** Check resource usage, database performance

**5. High Memory Usage**
```yaml
alert: HighMemoryUsage
expr: |
  container_memory_usage_bytes{pod=~".*gateway.*|.*service.*"} 
  / container_spec_memory_limit_bytes > 0.85
for: 15m
severity: warning
description: "{{ $labels.pod }} using >85% memory"
```
**Impact:** Risk of OOMKilled pods  
**Action:** Review memory limits, check for memory leaks

**6. Pod Restart Loop**
```yaml
alert: PodRestartLoop
expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
for: 5m
severity: warning
description: "{{ $labels.pod }} is restarting frequently"
```
**Impact:** Service instability  
**Action:** Check pod logs, review liveness probe configuration

---

## 5. Dashboards

### Recommended Grafana Dashboards

**Service Overview:**
- Request rate (req/sec)
- Error rate (%)
- P50, P95, P99 latency
- Active pods and their status

**Infrastructure:**
- CPU usage per pod
- Memory usage per pod
- Network I/O
- Pod restarts

**Business Metrics:**
- User operations per minute
- Total users
- API endpoint usage

---

## Next Steps

1. Deploy Prometheus and Grafana to the cluster
2. Configure ServiceMonitor for automatic scraping
3. Import recommended Grafana dashboards
4. Set up AlertManager with notification channels
5. Configure log aggregation (Loki recommended)

---

**Note:** This strategy provides production-ready observability. Start with in-cluster Prometheus for cost-effectiveness, then consider managed services as the application scales.
