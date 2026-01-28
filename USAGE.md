# Usage Guide

## Creating a ScheduledScaling

### Via Web UI

1. Open the frontend dashboard
2. Click "New ScheduledScaling"
3. Fill in the form:
   - **ScheduledScaling Name**: Optional (auto-generated if empty)
   - **Namespace**: Kubernetes namespace
   - **Target Type**: HPA or KEDA ScaledObject
   - **Target Name**: Name of the HPA/ScaledObject
   - **Schedule Type**: One-time or Recurring (Cron)
   - **Start Time**: When to apply scaling (for one-time)
   - **End Time**: When to revert (optional, for one-time)
   - **Cron Schedule**: Cron expression (for recurring)
   - **Duration**: How long scaling remains active (for recurring)
   - **Min/Max Replicas**: Desired scaling values
   - **Auto-revert**: Whether to revert after end time
4. Click "Create ScheduledScaling"

### Via kubectl

```bash
kubectl apply -f examples/example-schedulingscaling.yaml
```

Or use the test app example:
```bash
kubectl apply -f examples/test-app.yaml
kubectl apply -f examples/example-schedulingscaling.yaml
```

### Via API

```bash
curl -X POST http://scheduledscaling-api/api/v1/scheduledscalings \
  -H "Content-Type: application/json" \
  -d '{
    "apiVersion": "scaling.kubernetes.io/v1alpha1",
    "kind": "ScheduledScaling",
    "metadata": {
      "name": "my-scheduledscaling",
      "namespace": "default"
    },
    "spec": {
      "targetRef": {
        "kind": "HorizontalPodAutoscaler",
        "name": "my-app-hpa",
        "namespace": "default"
      },
      "schedule": {
        "startTime": "2024-01-15T10:00:00Z",
        "endTime": "2024-01-15T18:00:00Z"
      },
      "scaling": {
        "minReplicas": 5,
        "maxReplicas": 10
      },
      "revert": true
    }
  }'
```

## Viewing ScheduledScalings

### Via Web UI

All scheduled scalings are displayed in the dashboard table with:
- Name and target
- Schedule (start time or cron expression)
- End time or duration
- Min/max replicas
- Current status
- Action buttons (sortable columns)

### Via kubectl

```bash
# List all scheduledscalings
kubectl get scheduledscalings

# Or use short name
kubectl get ss

# List in specific namespace
kubectl get scheduledscalings -n production

# Get details
kubectl get scheduledscaling my-scheduledscaling -o yaml
```

### Via API

```bash
# List all scheduledscalings
curl http://scheduledscaling-api/api/v1/scheduledscalings?namespace=default

# Get specific scheduledscaling
curl http://scheduledscaling-api/api/v1/scheduledscalings/my-scheduledscaling?namespace=default
```

## Updating a ScheduledScaling

### Via Web UI

1. Find the scheduled scaling in the table
2. Click "Edit"
3. Modify the fields
4. Click "Update ScheduledScaling"

### Via kubectl

Edit the scheduled scaling:
```bash
kubectl edit scheduledscaling my-scheduledscaling
```

### Via API

```bash
curl -X PUT http://scheduledscaling-api/api/v1/scheduledscalings/my-scheduledscaling?namespace=default \
  -H "Content-Type: application/json" \
  -d '{
    "spec": {
      "scaling": {
        "minReplicas": 10,
        "maxReplicas": 20
      }
    }
  }'
```

## Canceling a ScheduledScaling

### Via Web UI

1. Find the active scheduled scaling
2. Click "Cancel"
3. Confirm cancellation

### Via kubectl

Use annotation to trigger cancel:
```bash
kubectl annotate scheduledscaling my-scheduledscaling scaling.kubernetes.io/action=cancel
```

Or patch directly:
```bash
kubectl patch scheduledscaling my-scheduledscaling --type=merge -p '{"status":{"phase":"Cancelled"}}'
```

### Via API

```bash
curl -X PATCH http://scheduledscaling-api/api/v1/scheduledscalings/my-scheduledscaling?namespace=default \
  -H "Content-Type: application/json" \
  -d '{
    "action": "cancel"
  }'
```

## Reverting a ScheduledScaling

### Via Web UI

1. Find the active scheduled scaling
2. Click "Revert"
3. Confirm revert

### Via kubectl

Use annotation to trigger revert:
```bash
kubectl annotate scheduledscaling my-scheduledscaling scaling.kubernetes.io/action=revert
```

### Via API

```bash
curl -X PATCH http://scheduledscaling-api/api/v1/scheduledscalings/my-scheduledscaling?namespace=default \
  -H "Content-Type: application/json" \
  -d '{
    "action": "revert"
  }'
```

## Deleting a ScheduledScaling

### Via Web UI

1. Find the scheduled scaling
2. Click "Delete"
3. Confirm deletion

### Via kubectl

```bash
kubectl delete scheduledscaling my-scheduledscaling
```

### Via API

```bash
curl -X DELETE http://scheduledscaling-api/api/v1/scheduledscalings/my-scheduledscaling?namespace=default
```

## ScheduledScaling Statuses

- **Pending**: Scheduled but not yet applied
- **Active**: Scaling has been applied
- **Completed**: Scaling was reverted successfully
- **Failed**: An error occurred
- **Cancelled**: Manually cancelled by user
- **Recurring**: Recurring schedule active (managed by CronJob)

## Recurring Schedules

You can create recurring scheduled scalings using cron expressions:

```yaml
apiVersion: scaling.kubernetes.io/v1alpha1
kind: ScheduledScaling
metadata:
  name: daily-scale-up
  namespace: default
spec:
  targetRef:
    apiVersion: autoscaling/v2
    kind: HorizontalPodAutoscaler
    name: my-app-hpa
    namespace: default
  schedule:
    recurrence:
      schedule: "0 9 * * 1-5"
      duration: "8h"
      timezone: "America/New_York"
  scaling:
    minReplicas: 10
    maxReplicas: 20
  revert: true
```

This creates a CronJob that generates ScheduledScaling instances every weekday at 9 AM.

## Best Practices

1. **Always set endTime or duration** for temporary scaling to ensure reversion
2. **Use descriptive names** for scheduled scalings to track their purpose
3. **Monitor scheduled scalings** to ensure they execute as expected
4. **Test in non-production** first
5. **Set appropriate min/max** values based on your application needs
6. **Cancel or delete** old scheduled scalings to keep the system clean
7. **Use recurring schedules** for predictable patterns (e.g., business hours)

## Troubleshooting

### ScheduledScaling stuck in Pending

Check controller logs:
```bash
kubectl logs -l app=scheduledscaling-controller
```

Verify the startTime is in the future and correctly formatted (RFC3339).

### ScheduledScaling failed to apply

Check:
1. HPA/ScaledObject exists
2. RBAC permissions are correct
3. Target namespace is correct
4. Controller logs for errors

### Scaling not reverted

If `revert: true` and endTime is set, check:
1. Controller is running
2. EndTime is correctly formatted
3. Controller logs for errors

### Recurring schedule not working

Check:
1. CronJob was created: `kubectl get cronjob`
2. CronJob schedule is valid
3. Jobs are being created: `kubectl get jobs`
4. Controller logs for errors

### View ScheduledScaling events

```bash
kubectl describe scheduledscaling my-scheduledscaling
```
