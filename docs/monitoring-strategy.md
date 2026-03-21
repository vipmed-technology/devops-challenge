# Monitoring Strategy

## Metrics

### Application Metrics

Both services expose `/metrics` using `prom-client`.

| Metric Name | Type | Description |
|-------------|------|-------------|
| `api_gateway_http_requests_total` | Counter | Count of gateway requests by method, route, and status |
| `api_gateway_http_request_duration_seconds` | Histogram | Gateway latency distribution |
| `user_service_http_requests_total` | Counter | Count of user service requests by method, route, and status |
| `user_service_http_request_duration_seconds` | Histogram | User service latency distribution |
| `process_*`, `nodejs_*` | Mixed | Default Node.js process/runtime metrics |

### Infrastructure Metrics

| Metric Name | Source | Description |
|-------------|--------|-------------|
| `kube_deployment_status_replicas_available` | kube-state-metrics | Number of available replicas |
| `container_cpu_usage_seconds_total` | cAdvisor/kubelet | CPU consumption per container |
| `container_memory_working_set_bytes` | cAdvisor/kubelet | Memory pressure and working set |
| `kube_pod_container_status_restarts_total` | kube-state-metrics | Restart spikes and crash loops |

## Logging

### Log Format

Application logs are structured JSON via Winston.

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

### Log Aggregation Strategy

Recommended production stack:

- Fluent Bit or Vector as node-level log collector
- Loki for storage and querying
- Grafana for dashboards and log exploration

Why:

- It is lightweight for Kubernetes
- It works well with structured JSON logs
- It avoids the operational overhead of a larger Elasticsearch stack for a small service footprint

## Alerting Rules

### Alert 1: API Gateway High 5xx Rate

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

### Alert 2: User Service Has No Ready Replicas

```yaml
- alert: UserServiceNoReadyReplicas
  expr: kube_deployment_status_replicas_available{deployment="user-service"} < 1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: User service has no ready replicas
```

### Alert 3: API Gateway P95 Latency High

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

### Alert 4: Redis Dependency Failing

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

Minimum Grafana dashboards:

1. API traffic: request volume, 4xx/5xx split, p95 latency, pod count
2. User service health: request volume, Redis dependency behavior, pod readiness
3. Platform health: CPU, memory, restarts, HPA scaling decisions

## Distributed Tracing

Not implemented in this challenge.

If I extended this further, I would add OpenTelemetry SDK instrumentation and export traces to Tempo or Jaeger so proxy latency between the gateway and user service becomes easier to debug.
