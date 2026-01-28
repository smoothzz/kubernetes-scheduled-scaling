# KEDA Setup and Testing Guide

This guide will help you install KEDA and test the Scheduled Scaling Manager with KEDA ScaledObjects.

## Prerequisites

- Kubernetes cluster (1.20+)
- kubectl configured
- Helm 3.x (for KEDA installation)

## Step 1: Install KEDA

### Using Helm (Recommended)

```bash
# Add KEDA Helm repository
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

# Install KEDA
helm install keda kedacore/keda \
  --namespace keda-system \
  --create-namespace \
  --version 2.12.0
```

### Verify KEDA Installation

```bash
# Check KEDA pods
kubectl get pods -n keda-system

# Check KEDA CRDs
kubectl get crd | grep keda
```

You should see:
- `scaledobjects.keda.sh`
- `scaledjobs.keda.sh`
- `triggerauthentications.keda.sh`

## Step 2: Deploy Test Application

Deploy a simple application that will be scaled by KEDA:

```bash
kubectl apply -f examples/keda-test-app.yaml
```

This creates:
- A simple Nginx deployment
- A service
- A KEDA ScaledObject (CPU-based scaling)

## Step 3: Verify ScaledObject

```bash
# Check the ScaledObject
kubectl get scaledobject -n default

# Describe it
kubectl describe scaledobject keda-test-app -n default

# Check the HPA created by KEDA
kubectl get hpa -n default
```

KEDA automatically creates an HPA based on the ScaledObject.

## Step 4: Create ScheduledScaling for KEDA ScaledObject

Now create a ScheduledScaling that targets the KEDA ScaledObject:

```bash
kubectl apply -f examples/keda-scheduled-scaling.yaml
```

Or create it manually:

```yaml
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
    startTime: "2024-01-15T10:00:00Z"
    endTime: "2024-01-15T18:00:00Z"
  scaling:
    minReplicas: 5
    maxReplicas: 10
  revert: true
```

## Step 5: Monitor the Scheduled Scaling

```bash
# Watch the ScheduledScaling status
kubectl get scheduledscaling -w

# Check controller logs
kubectl logs -l app=scheduledscaling-controller -f

# Check ScaledObject
kubectl get scaledobject keda-test-app -o yaml
```

## How It Works

1. **KEDA ScaledObject**: Defines scaling rules based on external metrics (CPU, memory, custom metrics, etc.)
2. **KEDA creates HPA**: KEDA automatically creates and manages an HPA based on the ScaledObject
3. **ScheduledScaling**: Our controller modifies the `minReplicaCount` and `maxReplicaCount` in the ScaledObject
4. **KEDA respects changes**: KEDA will use the updated min/max values when scaling

## Important Notes

- The ScheduledScaling controller modifies the ScaledObject's `minReplicaCount` and `maxReplicaCount` fields (note: KEDA uses `minReplicaCount`/`maxReplicaCount`, not `minReplicas`/`maxReplicas`)
- KEDA will continue to manage scaling based on metrics, but within the bounds set by ScheduledScaling
- When `revert: true`, the original values are restored after the scheduled period
- The ScaledObject's `minReplicaCount` and `maxReplicaCount` are the values that get modified, not the underlying HPA

## Troubleshooting

### ScaledObject not found

```bash
# Verify ScaledObject exists
kubectl get scaledobject -A

# Check if KEDA is running
kubectl get pods -n keda-system
```

### ScheduledScaling not applying changes

```bash
# Check controller logs
kubectl logs -l app=scheduledscaling-controller

# Verify RBAC permissions
kubectl auth can-i update scaledobjects --as=system:serviceaccount:default:scheduledscaling-controller
```

### KEDA not scaling

```bash
# Check KEDA operator logs
kubectl logs -n keda-system -l app=keda-operator

# Check ScaledObject status
kubectl describe scaledobject keda-test-app
```

## Cleanup

```bash
# Remove ScheduledScaling
kubectl delete scheduledscaling scale-up-keda-test

# Remove test application
kubectl delete -f examples/keda-test-app.yaml

# Remove KEDA (optional)
helm uninstall keda -n keda-system
kubectl delete namespace keda-system
```
