# Monitoring Strategy

## Metrics

### Application Metrics

List the metrics you would collect from the applications:

| Metric Name | Type | Description |
|-------------|------|-------------|
| `http_request_duration_ms` | Histogram | Request latency by route/method/status. |
| `process_cpu_seconds_total` | Counter | CPU usage from Node.js process. |
| `process_resident_memory_bytes` | Gauge | Memory usage from Node.js process. |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag (performance signal). |

### Infrastructure Metrics

| Metric Name | Source | Description |
|-------------|--------|-------------|
| `kube_pod_status_ready` | kube-state-metrics | Pod readiness for services. |
| `container_cpu_usage_seconds_total` | cAdvisor | Container CPU usage. |
| `container_memory_working_set_bytes` | cAdvisor | Container memory usage. |

## Logging

### Log Format

Describe the structured logging format you implemented:

```json
{"timestamp":"2026-02-09T00:00:00.000Z","level":"info","message":"request","method":"GET","path":"/health","route":"/health","statusCode":200,"durationMs":3.2}
```

### Log Aggregation Strategy

Send JSON logs to stdout and collect them with a cluster-level log agent (e.g., Fluent Bit) into a central store (e.g., Loki or Elasticsearch) for search and retention.

## Alerting Rules

Define at least 3 alerting rules using Prometheus format:

### Alert 1:

```yaml
alert: ApiGatewayHighErrorRate
expr: sum(rate(http_request_duration_ms_count{route=~"/api/.*",status_code=~"5.."}[5m])) / sum(rate(http_request_duration_ms_count{route=~"/api/.*"}[5m])) > 0.05
for: 5m
labels:
  severity: warning
annotations:
  summary: "High 5xx error rate in api-gateway"
```

### Alert 2:

```yaml
alert: UserServiceHighLatency
expr: histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket{route=~"/users.*"}[5m])) by (le)) > 1
for: 5m
labels:
  severity: warning
annotations:
  summary: "User-service p95 latency > 1s"
```

### Alert 3:

```yaml
alert: RedisDown
expr: up{job="redis"} == 0
for: 2m
labels:
  severity: critical
annotations:
  summary: "Redis is down"
```
