# KEDA Quick Start Guide

Quick guide to test Scheduled Scaling Manager with KEDA ScaledObjects.

## 1. Install KEDA

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda \
  --namespace keda-system \
  --create-namespace \
  --version 2.12.0
```

Wait for KEDA to be ready:
```bash
kubectl wait --for=condition=ready pod -l app=keda-operator -n keda-system --timeout=300s
```

## 2. Deploy Test Application

```bash
kubectl apply -f examples/keda-test-app.yaml
```

This creates:
- Deployment: `keda-test-app`
- Service: `keda-test-app`
- ScaledObject: `keda-test-app` (CPU-based scaling, min: 2, max: 10)

Verify:
```bash
kubectl get scaledobject
kubectl get hpa  # KEDA creates this automatically
```

## 3. Create ScheduledScaling

Update the date in `examples/keda-scheduled-scaling.yaml` to a future time, then:

```bash
kubectl apply -f examples/keda-scheduled-scaling.yaml
```

Or create with a date 5 minutes from now:
```bash
# Get current time + 5 minutes (adjust timezone as needed)
START_TIME=$(date -u -v+5M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+5 minutes" +"%Y-%m-%dT%H:%M:%SZ")
END_TIME=$(date -u -v+15M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+15 minutes" +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF | kubectl apply -f -
apiVersion: scaling.kubernetes.io/v1alpha1
kind: ScheduledScaling
metadata:
  name: scale-up-keda-test
  namespace: default
spec:
  targetRef:
    apiVersion: keda.sh/v1alpha1
    kind: ScaledObject
    name: keda-test-app
    namespace: default
  schedule:
    startTime: "${START_TIME}"
    endTime: "${END_TIME}"
  scaling:
    minReplicas: 5
    maxReplicas: 15
  revert: true
EOF
```

## 4. Monitor

```bash
# Watch ScheduledScaling
kubectl get scheduledscaling -w

# Check ScaledObject
kubectl get scaledobject keda-test-app -o yaml | grep -A 2 "replicas:"

# Check controller logs
kubectl logs -l app=scheduledscaling-controller -f
```

## 5. Verify Scaling

When the startTime is reached:
- ScaledObject `minReplicaCount` should change from 2 to 5
- ScaledObject `maxReplicaCount` should change from 10 to 15
- KEDA will respect these new bounds

When the endTime is reached (if `revert: true`):
- Values should revert to original (minReplicaCount: 2, maxReplicaCount: 10)

## Cleanup

```bash
kubectl delete scheduledscaling scale-up-keda-test
kubectl delete -f examples/keda-test-app.yaml
helm uninstall keda -n keda-system
```
