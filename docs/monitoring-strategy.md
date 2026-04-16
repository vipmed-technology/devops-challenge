# Monitoring Strategy

## Overview

Our observability stack follows the three pillars of observability: **metrics**, **logs**, and **traces**. We use Prometheus for metrics collection, Winston for structured logging, and document a path to distributed tracing with OpenTelemetry.

---

## Metrics

### Application Metrics

Both services expose a `/metrics` endpoint in Prometheus exposition format via `prom-client`.

| Metric Name | Type | Description |
|-------------|------|-------------|
| `http_request_duration_seconds` | Histogram | Duration of HTTP requests by method, route, and status code |
| `http_requests_total` | Counter | Total HTTP requests by method, route, and status code |
| `redis_connection_status` | Gauge | Redis connection health (1 = connected, 0 = disconnected). User-service only. |
| `nodejs_heap_size_total_bytes` | Gauge | Total heap size (default metric from prom-client) |
| `nodejs_active_handles_total` | Gauge | Active handles (default metric) |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag (default metric) |
| `process_cpu_seconds_total` | Counter | CPU time consumed (default metric) |

### Infrastructure Metrics

| Metric Name | Source | Description |
|-------------|--------|-------------|
| `container_cpu_usage_seconds_total` | cAdvisor / kubelet | CPU usage per container |
| `container_memory_working_set_bytes` | cAdvisor / kubelet | Memory usage per container |
| `kube_pod_status_phase` | kube-state-metrics | Pod lifecycle phase (Pending, Running, Failed) |
| `kube_deployment_status_replicas_available` | kube-state-metrics | Available replicas per deployment |
| `node_cpu_seconds_total` | node-exporter | Node-level CPU usage |

### Collection Architecture

```
┌─────────────┐     ┌─────────────┐
│ api-gateway  │     │ user-service │
│  /metrics    │     │  /metrics    │
└──────┬───────┘     └──────┬───────┘
       │   scrape           │   scrape
       └────────┐  ┌────────┘
                ▼  ▼
           ┌──────────┐
           │Prometheus │
           └─────┬─────┘
                 │ query
           ┌─────▼─────┐
           │  Grafana   │
           └────────────┘
```

Prometheus scrapes each service pod's `/metrics` endpoint every 15 seconds via Kubernetes service discovery (`kubernetes_sd_configs` with role `pod`). Pods are annotated with:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"   # or 3001 for user-service
  prometheus.io/path: "/metrics"
```

---

## Logging

### Log Format

All application logs use structured JSON via Winston:

```json
{
  "level": "info",
  "message": "request completed",
  "service": "api-gateway",
  "timestamp": "2026-04-16T10:30:00.000Z",
  "method": "GET",
  "path": "/api/users",
  "statusCode": 200,
  "durationMs": 42
}
```

Key fields:
- **level**: `error`, `warn`, `info`, `debug` (controlled via `LOG_LEVEL` env var)
- **service**: identifies which microservice emitted the log
- **timestamp**: ISO-8601 for consistent time-series correlation
- **Contextual fields**: method, path, statusCode, durationMs for requests; error details for errors

### Log Aggregation Strategy

**Recommended: Grafana Loki + Promtail**

| Component | Role |
|-----------|------|
| Promtail (DaemonSet) | Tails container stdout/stderr from each node, ships to Loki |
| Loki | Log storage and indexing (label-based, low cost) |
| Grafana | Unified query UI for both metrics (Prometheus) and logs (Loki) |

**Why Loki over EFK (Elasticsearch + Fluentd + Kibana):**
- Lower resource footprint — Loki only indexes labels, not full text
- Native Grafana integration — single pane of glass with Prometheus metrics
- Simpler operations — no JVM-based Elasticsearch cluster to manage
- Cost-effective for moderate log volumes typical of microservices

**Trade-off:** Loki is less suited for full-text search across log bodies. If ad-hoc text search is critical, EFK or OpenSearch would be better choices.

---

## Alerting Rules

### Alert 1: High Error Rate

```yaml
groups:
  - name: api-gateway-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{service="api-gateway", status_code=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="api-gateway"}[5m]))
          > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "API Gateway error rate above 5%"
          description: "{{ $value | humanizePercentage }} of requests are returning 5xx errors over the last 5 minutes."
```

### Alert 2: High Request Latency

```yaml
      - alert: HighP95Latency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{service="api-gateway"}[5m])) by (le)
          ) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API Gateway p95 latency above 1 second"
          description: "95th percentile latency is {{ $value }}s over the last 5 minutes."
```

### Alert 3: Service Down (Zero Healthy Pods)

```yaml
      - alert: ServiceDown
        expr: |
          kube_deployment_status_replicas_available{
            namespace="devops-challenge",
            deployment=~"api-gateway|user-service"
          } == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.deployment }} has no available replicas"
          description: "Deployment {{ $labels.deployment }} in namespace {{ $labels.namespace }} has 0 available replicas for over 1 minute."
```

### Alert 4: Redis Connection Lost

```yaml
      - alert: RedisConnectionLost
        expr: redis_connection_status == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "User service lost connection to Redis"
          description: "The user-service Redis connection gauge has been 0 for 30 seconds. User data operations will fail."
```

---

## Dashboards

Grafana dashboard panels:

1. **Request Rate** — `sum(rate(http_requests_total[1m])) by (service)` — time series showing request throughput per service
2. **Error Rate %** — ratio of 5xx to total requests per service — single stat with thresholds (green < 1%, yellow < 5%, red > 5%)
3. **Latency Percentiles** — p50, p95, p99 from `http_request_duration_seconds` histogram — overlaid time series
4. **Redis Connection Status** — `redis_connection_status` gauge — state timeline (up/down)
5. **Pod CPU & Memory** — `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes` — per-pod resource usage
6. **Pod Restart Count** — `kube_pod_container_status_restarts_total` — counter to spot CrashLoopBackOff

---

## Distributed Tracing (Bonus)

Not implemented in this iteration. The recommended path:

1. Add `@opentelemetry/sdk-node` and `@opentelemetry/auto-instrumentations-node` to each service
2. Export traces via OTLP to a Tempo or Jaeger backend
3. Correlate traces with logs by injecting `traceId` into Winston log metadata
4. Grafana can link from a Loki log line → Tempo trace via the traceId field

This gives end-to-end visibility: a request enters api-gateway, proxies to user-service, hits Redis — all visible in a single trace waterfall.
