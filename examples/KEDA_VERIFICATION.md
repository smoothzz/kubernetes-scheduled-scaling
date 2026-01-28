# How to Verify if ScheduledScaling with KEDA Worked

## 1. Check ScheduledScaling Status

```bash
# View current status
kubectl get scheduledscaling scale-up-keda-test

# View full details
kubectl describe scheduledscaling scale-up-keda-test

# View in YAML format (check status.phase)
kubectl get scheduledscaling scale-up-keda-test -o yaml | grep -A 10 "status:"
```

**Expected statuses:**
- `Pending` - Waiting for startTime
- `Active` - Scaling applied
- `Completed` - Reverted (if revert: true)
- `Failed` - Error applying

## 2. Check ScaledObject Values

```bash
# View current minReplicaCount and maxReplicaCount
kubectl get scaledobject keda-test-app -o jsonpath='{.spec.minReplicaCount}{"\n"}{.spec.maxReplicaCount}{"\n"}'

# View original vs current values
echo "=== Current Values ==="
kubectl get scaledobject keda-test-app -o jsonpath='Min: {.spec.minReplicaCount} | Max: {.spec.maxReplicaCount}{"\n"}'

# View full history
kubectl get scaledobject keda-test-app -o yaml | grep -A 2 "replicaCount"
```

**Expected values:**
- **Before startTime**: minReplicaCount: 2, maxReplicaCount: 10 (original)
- **After startTime**: minReplicaCount: 5, maxReplicaCount: 15 (from ScheduledScaling)
- **After endTime (if revert: true)**: minReplicaCount: 2, maxReplicaCount: 10 (reverted)

## 3. Check Controller Logs

```bash
# View controller logs
kubectl logs -l app=scheduledscaling-controller --tail=50

# Follow logs in real-time
kubectl logs -l app=scheduledscaling-controller -f

# Filter logs related to KEDA
kubectl logs -l app=scheduledscaling-controller | grep -i "scaledobject\|keda"
```

**Expected logs:**
- `Applied scaling to ScaledObject` - When scaling is applied
- `Revert: Reverted ScaledObject to original values` - When reverting

## 4. Check HPA Created by KEDA

```bash
# KEDA automatically creates an HPA based on the ScaledObject
kubectl get hpa

# View HPA details
kubectl describe hpa keda-hpa-keda-test-app

# View min/max replicas of the HPA
kubectl get hpa keda-hpa-keda-test-app -o jsonpath='Min: {.spec.minReplicas} | Max: {.spec.maxReplicas}{"\n"}'
```

## 5. Check Deployment Replicas

```bash
# View how many replicas are running
kubectl get deployment keda-test-app

# View pods
kubectl get pods -l app=keda-test-app

# View scaling history
kubectl get hpa keda-hpa-keda-test-app -o yaml | grep -A 5 "currentReplicas"
```

## 6. Real-Time Monitoring

Create a script to monitor everything:

```bash
#!/bin/bash
# monitor-keda.sh

echo "=== ScheduledScaling Status ==="
kubectl get scheduledscaling scale-up-keda-test -o custom-columns=NAME:.metadata.name,PHASE:.status.phase,APPLIED:.status.appliedAt,REVERTED:.status.revertedAt

echo -e "\n=== ScaledObject Values ==="
kubectl get scaledobject keda-test-app -o jsonpath='MinReplicaCount: {.spec.minReplicaCount} | MaxReplicaCount: {.spec.maxReplicaCount}{"\n"}'

echo -e "\n=== HPA Values ==="
kubectl get hpa keda-hpa-keda-test-app -o jsonpath='MinReplicas: {.spec.minReplicas} | MaxReplicas: {.spec.maxReplicas} | Current: {.status.currentReplicas}{"\n"}' 2>/dev/null || echo "HPA not created yet"

echo -e "\n=== Deployment Replicas ==="
kubectl get deployment keda-test-app -o jsonpath='Desired: {.spec.replicas} | Ready: {.status.readyReplicas}{"\n"}'

echo -e "\n=== Recent Controller Logs ==="
kubectl logs -l app=scheduledscaling-controller --tail=5 | grep -i "scaledobject\|keda" || echo "No related logs"
```

Execute:
```bash
chmod +x monitor-keda.sh
watch -n 2 ./monitor-keda.sh
```

## 7. Check Events

```bash
# ScheduledScaling events
kubectl get events --field-selector involvedObject.name=scale-up-keda-test --sort-by='.lastTimestamp'

# ScaledObject events
kubectl get events --field-selector involvedObject.name=keda-test-app --sort-by='.lastTimestamp'

# All recent events
kubectl get events --sort-by='.lastTimestamp' | tail -20
```

## 8. Verification Checklist

### Before startTime:
- [ ] ScheduledScaling status = `Pending`
- [ ] ScaledObject minReplicaCount = 2, maxReplicaCount = 10
- [ ] Controller logs show "Scheduled for [startTime]"

### After startTime (when Active):
- [ ] ScheduledScaling status = `Active`
- [ ] ScheduledScaling status.appliedAt is filled
- [ ] ScaledObject minReplicaCount = 5, maxReplicaCount = 15
- [ ] Controller logs show "Applied scaling to ScaledObject"
- [ ] HPA reflects new values (if already created by KEDA)

### After endTime (if revert: true):
- [ ] ScheduledScaling status = `Completed`
- [ ] ScheduledScaling status.revertedAt is filled
- [ ] ScaledObject minReplicaCount = 2, maxReplicaCount = 10 (original values)
- [ ] Controller logs show "Reverted ScaledObject to original values"

## 9. Troubleshooting

### If status doesn't change to Active:

```bash
# Check if startTime has passed
kubectl get scheduledscaling scale-up-keda-test -o jsonpath='{.spec.schedule.startTime}{"\n"}'
date -u

# Check error logs
kubectl logs -l app=scheduledscaling-controller | grep -i error
```

### If ScaledObject doesn't change:

```bash
# Verify ScaledObject exists
kubectl get scaledobject keda-test-app

# Check RBAC permissions
kubectl auth can-i update scaledobjects --as=system:serviceaccount:default:scheduledscaling-controller

# Check if controller is running
kubectl get pods -l app=scheduledscaling-controller
```

### If HPA doesn't reflect changes:

```bash
# KEDA may take a few seconds to update the HPA
# Wait and check again
sleep 10
kubectl get hpa keda-hpa-keda-test-app -o yaml
```

## 10. Quick Test

To test immediately (without waiting for startTime):

```bash
# Create ScheduledScaling with startTime in the past (will be applied immediately)
cat <<EOF | kubectl apply -f -
apiVersion: scaling.kubernetes.io/v1alpha1
kind: ScheduledScaling
metadata:
  name: scale-up-keda-test-now
  namespace: default
spec:
  targetRef:
    apiVersion: keda.sh/v1alpha1
    kind: ScaledObject
    name: keda-test-app
    namespace: default
  schedule:
    startTime: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    endTime: "$(date -u -v+10M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+10 minutes" +"%Y-%m-%dT%H:%M:%SZ")"
  scaling:
    minReplicas: 5
    maxReplicas: 15
  revert: true
EOF

# Wait a few seconds and verify
sleep 5
kubectl get scheduledscaling scale-up-keda-test-now
kubectl get scaledobject keda-test-app -o jsonpath='Min: {.spec.minReplicaCount} | Max: {.spec.maxReplicaCount}{"\n"}'
```
