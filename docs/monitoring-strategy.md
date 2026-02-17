# Monitoring Strategy

## Metrics

* Application Metrics

Metrics exposed via `/metrics` endpoint in Prometheus format on both services:

| Metric Name | Type | Description | Labels |
|-------------|------|-------------|--------|
| `http_request_duration_seconds` | Histogram | HTTP request latency in seconds | method, route, status_code |
| `http_requests_total` | Counter | Total HTTP requests | method, route, status_code |
| `redis_operations_total` | Counter | Total Redis operations (user-service) | operation (get/set/connect), status (success/error) |
| `nodejs_heap_size_total_bytes` | Gauge | Total heap size | - |
| `nodejs_heap_size_used_bytes` | Gauge | Heap memory used | - |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag | - |
| `process_cpu_user_seconds_total` | Counter | User CPU time | - |
| `process_cpu_system_seconds_total` | Counter | System CPU time | - |
| `process_open_fds` | Gauge | Open file descriptors | - |

* Infrastructure Metrics

| Metric Name | Source | Description |
|-------------|--------|-------------|
| `container_memory_usage_bytes` | Kubelet cAdvisor | Container memory usage |
| `container_memory_working_set_bytes` | Kubelet cAdvisor | Working set memory (used for OOM decisions) |
| `container_cpu_usage_seconds_total` | Kubelet cAdvisor | CPU usage per container |
| `kube_pod_container_status_restarts_total` | kube-state-metrics | Pod restart count |
| `kube_pod_status_phase` | kube-state-metrics | Current pod phase (Running, Pending, Failed) |
| `kube_deployment_status_replicas_available` | kube-state-metrics | Available replicas |
| `kube_horizontalpodautoscaler_status_current_replicas` | kube-state-metrics | Current HPA replica count |

## Logging

* Log Format

Structured JSON logging implemented with Winston:

```json
{
  "level": "info",
  "message": "Request completed",
  "service": "api-gateway",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "method": "GET",
  "path": "/users",
  "statusCode": 200,
  "duration": "0.045s"
}
```

Error log example:
```json
{
  "level": "error",
  "message": "Failed to fetch users",
  "service": "user-service",
  "timestamp": "2024-01-15T10:31:12.456Z",
  "error": "Connection timeout",
  "stack": "Error: Connection timeout\n    at RedisClient.connect ...",
  "userId": "123e4567-e89b-12d3-a456-426614174000"
}
```

Key fields:
- `timestamp`: ISO 8601 format for consistent sorting
- `level`: info, warn, error for filtering
- `service`: Identifies source service in multi-service logs
- `message`: Human-readable description
- Contextual fields: error, stack, userId, method, path (varies by event)

* Log Aggregation Strategy

Recommended Production Setup:

1. Ship logs to centralized system via one of:
   - Fluentd/Fluent Bit (sidecar or DaemonSet): Parse JSON, forward to Elasticsearch or Loki
   - Promtail (DaemonSet): Lightweight, native integration with Grafana Loki
   - Cloud-native: AWS CloudWatch Logs, Azure Monitor, GCP Cloud Logging

2. Storage & Query:
   - Grafana Loki:
     - Low cost (indexes only labels, not full text)
     - Native Grafana integration for unified dashboards
     - LogQL for powerful queries
   - Elasticsearch + Kibana (ELK):
     - Full-text search capabilities
     - Rich visualization options
     - Higher resource requirements and cost

3. Log Retention:
   - Hot storage (7 days): Fast queries for recent issues
   - Warm storage (30 days): Historical analysis
   - Cold storage (90+ days): Compliance/audit (S3/Glacier)

**Query examples:**
```logql
# Grafana Loki query: All errors in last hour
{service="user-service"} | json | level="error" | __timestamp__ > 1h ago

# Filter by specific user
{service="api-gateway"} | json | userId="123e4567-e89b-12d3-a456-426614174000"

# High latency requests
{service=~".+"} | json | duration > 1.0
```

## Alerting Rules

Define at least 3 alerting rules using Prometheus format:

* Alert 1: High Error Rate

```yaml
groups:
  - name: application_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (service)
            /
            sum(rate(http_requests_total[5m])) by (service)
          ) > 0.05
        for: 2m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "High error rate detected"
          description: "{{ $labels.service }} has {{ $value | humanizePercentage }} error rate (threshold: 5%)"
```

Rationale: 5% error rate sustained for 2 minutes indicates serious issue. Fires before all users affected.

* Alert 2: Pod Restart Loop

```yaml
      - alert: PodRestartLoop
        expr: |
          rate(kube_pod_container_status_restarts_total{namespace="devops-challenge"}[15m]) > 0
        for: 5m
        labels:
          severity: critical
          team: sre
        annotations:
          summary: "Pod is crash looping"
          description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} has restarted {{ $value }} times in the last 15 minutes"
```

Rationale: Detects OOMKills, application crashes, or failing liveness probes. Requires immediate investigation.

* Alert 3: High Memory Usage

```yaml
      - alert: HighMemoryUsage
        expr: |
          (
            container_memory_working_set_bytes{namespace="devops-challenge", container!=""}
            /
            container_spec_memory_limit_bytes{namespace="devops-challenge", container!=""}
          ) > 0.9
        for: 5m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Container memory usage is high"
          description: "{{ $labels.pod }}/{{ $labels.container }} is using {{ $value | humanizePercentage }} of memory limit"
```

Rationale: 90% memory usage for 5 minutes indicates approaching OOM. Allows time to scale or investigate memory leak.

* Alert 4: API Latency High

```yaml
      - alert: HighAPILatency
        expr: |
          histogram_quantile(0.95, 
            rate(http_request_duration_seconds_bucket[5m])
          ) > 1.0
        for: 3m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "API response time is high"
          description: "95th percentile latency for {{ $labels.service }} is {{ $value }}s (threshold: 1s)"
```

Rationale: P95 latency over 1 second degrades user experience. May indicate database slowness or resource contention.

* Alert 5: Service Down

```yaml
      - alert: ServiceDown
        expr: |
          up{job=~"api-gateway|user-service"} == 0
        for: 1m
        labels:
          severity: critical
          team: sre
        annotations:
          summary: "Service is down"
          description: "{{ $labels.job }} has been down for more than 1 minute"
```

Rationale: Service unreachable by Prometheus scraper. Could be pod crash, network issue, or metrics endpoint failure.

## Dashboards

**Proposed Grafana Dashboard Panels:**

* 1. Service Health Overview
- Request Rate: Requests per second (by service, method)
- Error Rate: 5xx responses as percentage of total
- Latency (P50, P95, P99): Response time distribution
- Uptime: Service availability percentage

* 2. Resource Utilization
- CPU Usage: Current vs requests vs limits (by pod)
- Memory Usage: Working set vs limits (by pod)
- Pod Count: Current replicas vs desired replicas
- HPA Status: Target vs current CPU/memory percentage

* 3. Redis Operations (User Service)
- Operation Rate: get/set operations per second
- Error Rate: Failed Redis operations
- Connection Status: Redis connectivity health

* 4. HTTP Traffic Breakdown
- Status Code Distribution: 2xx, 3xx, 4xx, 5xx pie chart
- Top Endpoints: Most frequently called routes
- Slowest Endpoints: Highest P95 latency by route

* 5. Node.js Runtime Metrics
- Heap Usage: Used vs total heap size
- GC Duration: Garbage collection pause time
- Event Loop Lag: Event loop blocked time
- Open File Descriptors: FD usage vs limits

* 6. Logs Panel
- Integrated log stream filtered by selected service/pod
- Real-time error log stream
- Log volume by level (info/warn/error)

**Dashboard organization:**
- Single pane of glass: All services on one dashboard
- Time range selector: Last 1h, 6h, 24h, 7d
- Template variables: Environment (dev/prod), Service, Pod
- Annotations: Deployment events marked on timeline
