# Monitoring Strategy

## Metrics

Both services expose `/metrics` using `prom-client`.

The main application metrics are:

| Metric Name | Type | Description |
|-------------|------|-------------|
| `api_gateway_http_requests_total` | Counter | Total gateway requests by method, route, and status |
| `api_gateway_http_request_duration_seconds` | Histogram | Gateway latency distribution |
| `user_service_http_requests_total` | Counter | Total user-service requests by method, route, and status |
| `user_service_http_request_duration_seconds` | Histogram | User-service latency distribution |
| `process_*`, `nodejs_*` | Mixed | Default runtime and process metrics from Node.js |

For infrastructure-level visibility I would also scrape:

| Metric Name | Source | Description |
|-------------|--------|-------------|
| `kube_deployment_status_replicas_available` | kube-state-metrics | Available replicas |
| `container_cpu_usage_seconds_total` | cAdvisor/kubelet | CPU usage |
| `container_memory_working_set_bytes` | cAdvisor/kubelet | Memory pressure |
| `kube_pod_container_status_restarts_total` | kube-state-metrics | Restart spikes and crash loops |

## Logging

Application logs are structured JSON through Winston. I kept them simple and request-focused so they are easy to ingest into a central logging stack.

Example:

```json
{
  "timestamp": "2026-03-20T19:00:00.000Z",
  "level": "info",
  "service": "api-gateway",
  "message": "request completed",
  "method": "GET",
  "path": "/api/users",
  "statusCode": 200,
  "durationSeconds": 0.012
}
```

For production log aggregation, I would use:

- Fluent Bit or Vector
- Loki
- Grafana

I picked that stack because it is lightweight, works well with JSON logs, and feels like a good fit for a small Kubernetes-based service set.

## Alerting Rules

These are the first alerts I would want in place.

### API gateway high 5xx rate

```yaml
- alert: ApiGatewayHigh5xxRate
  expr: |
    (
      sum(rate(api_gateway_http_requests_total{status_code=~"5.."}[5m])) /
      sum(rate(api_gateway_http_requests_total[5m]))
    ) > 0.05
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: API gateway 5xx rate is above 5%
```

### User service has no ready replicas

```yaml
- alert: UserServiceNoReadyReplicas
  expr: kube_deployment_status_replicas_available{deployment="user-service"} < 1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: User service has no ready replicas
```

### API gateway p95 latency is high

```yaml
- alert: ApiGatewayP95LatencyHigh
  expr: |
    histogram_quantile(
      0.95,
      sum(rate(api_gateway_http_request_duration_seconds_bucket[5m])) by (le)
    ) > 0.75
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: API gateway p95 latency is above 750ms
```

### User service restart spike

```yaml
- alert: UserServiceRedisDependencyFailing
  expr: increase(kube_pod_container_status_restarts_total{container="user-service"}[10m]) > 2
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: User service is restarting repeatedly, likely due to Redis dependency issues
```

## Dashboards

At minimum I would build three dashboards:

1. Gateway traffic, error rate, latency, and pod count
2. User service traffic, readiness, and restart behavior
3. Cluster resource usage for CPU, memory, and scaling activity

## Distributed Tracing

I did not implement tracing in this challenge.

If I had more time, I would add OpenTelemetry instrumentation and export traces to Tempo or Jaeger so it is easier to follow a request from the gateway into the user service and separate app latency from dependency latency.
