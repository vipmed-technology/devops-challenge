# Monitoring Strategy

> **Note to Candidate:** Document your monitoring and observability approach here.

## Overview
To ensure the reliability and performance of our microservices, we implement an observability strategy based on the "Three Pillars": Metrics, Logs, and Traces. Our approach focuses on the **RED method** (Rate, Errors, and Duration) for services and utilization for infrastructure.

## Metrics

### Application Metrics

Collected via the `/metrics` endpoint using the `prom-client` library in Node.js.
List the metrics you would collect from the applications:

| Metric Name | Type | Description |
|-------------|------|-------------|
| `http_request_duration_ms` | Histogram | Latency of HTTP requests partitioned by method, route, and status code. |
| `nodejs_heap_size_total_bytes` | Gauge | Total size of the Node.js heap, critical for detecting memory leaks. |
| `process_cpu_usage_seconds_total` | Counter | Total user and system CPU time spent by the process. |

### Infrastructure Metrics

These would be collected via Prometheus `Kube-State-Metrics` and `Node Exporter`.

| Metric Name | Source | Description |
|-------------|--------|-------------|
| `container_memory_usage_bytes` | cAdvisor | Actual memory usage of the pod containers vs defined limits. |
| `container_cpu_usage_seconds_total` | cAdvisor | CPU usage of the container to monitor throttling. |
| `kube_pod_status_ready` | Kube-State-Metrics | Boolean flag indicating if pods are passing readiness probes. |

## Logging

### Log Format

Describe the structured logging format you implemented:
We implemented structured logging using **Pino**. This allows for consistent, machine-readable logs that can be easily indexed.

```json
{"level": "INFO",
  "time": "2026-04-16T19:42:25.042Z",
  "pid": 1,
  "hostname": "api-gateway-7d9f8c",
  "req": {
    "method": "GET",
    "url": "/api/users",
    "id": "req-123"
  },
  "res": {
    "statusCode": 200
  },
  "responseTime": 45,
  "msg": "request completed"
}
```

### Log Aggregation Strategy

How would you aggregate logs in production? Explain your choice.

## Alerting Rules

Define at least 3 alerting rules using Prometheus format:

### Alert 1:

```yaml
# Alert 1: High HTTP 5xx Error Rate
# Prometheus alerting rule
alert: HighHttpErrorRate
expr: sum(rate(http_request_duration_ms_count{code=~"5.."}[5m])) / sum(rate(http_request_duration_ms_count[5m])) > 0.05
for: 2m
labels:
  severity: critical
annotations:
  summary: "High Error Rate on {{ $labels.app }}"
  description: "Service {{ $labels.app }} is returning > 5% errors for more than 2 minutes."
```

### Alert 2:

```yaml
# Alert 2: High Request Latency
alert: HighRequestLatency
expr: histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, app)) > 1000
for: 5m
labels:
  severity: warning
annotations:
  summary: "High Latency on {{ $labels.app }}"
  description: "95% of requests are slower than 1s for the last 5 minutes."
```

### Alert 3:

```yaml
# Alert 3: Pod CrashLooping
alert: PodCrashLooping
expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
for: 5m
labels:
  severity: critical
annotations:
  summary: "Pod {{ $labels.pod }} is restarting frequently"
  description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} has restarted multiple times."
```

## Dashboards

If you created a Grafana dashboard, describe the panels and what they show:

1. Service Latency (P95): A line chart showing the 95th percentile of response times. This helps identify slow performance before it becomes an outage.
2. Error Rate vs Traffic: A combined graph showing total requests (bars) and the percentage of 4xx/5xx errors (lines) to correlate spikes.
3. Resource Saturation: Gauges showing current CPU and Memory usage as a percentage of the Kubernetes Limits defined in the manifests.

## Distributed Tracing (Bonus)

If you implemented tracing, describe your approach.

- Instrumentation: Use the OpenTelemetry SDK for Node.js to automatically instrument HTTP and Redis calls.

- Propagation: Pass traceparent headers between the API Gateway and User Service.

- Collector: Send traces to an OTel Collector which forwards them to Jaeger or Tempo for visualization. This is essential for debugging bottlenecks in microservice chains.