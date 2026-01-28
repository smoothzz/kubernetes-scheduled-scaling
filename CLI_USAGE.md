# CLI Usage (Native kubectl)

ScheduledScaling supports native kubectl commands through annotations. The controller interprets these annotations and executes actions automatically.

## Revert a ScheduledScaling

To revert an active scheduled scaling (cancels and reverts the HPA/ScaledObject immediately):

```bash
kubectl annotate scheduledscaling <name> scaling.kubernetes.io/action=revert
```

**Example:**
```bash
kubectl annotate scheduledscaling test-revert scaling.kubernetes.io/action=revert
```

**With namespace:**
```bash
kubectl annotate scheduledscaling my-scheduled-scaling scaling.kubernetes.io/action=revert -n production
```

## Cancel a ScheduledScaling

To cancel a scheduled scaling:

```bash
kubectl annotate scheduledscaling <name> scaling.kubernetes.io/action=cancel
```

**Example:**
```bash
kubectl annotate scheduledscaling test-scheduled-scaling scaling.kubernetes.io/action=cancel
```

**With namespace:**
```bash
kubectl annotate scheduledscaling my-scheduled-scaling scaling.kubernetes.io/action=cancel -n production
```

## How It Works

1. You add the annotation `scaling.kubernetes.io/action` with value `revert` or `cancel`
2. The controller detects the annotation in the next reconciliation cycle
3. The controller executes the action (reverts the HPA/ScaledObject if necessary)
4. The annotation is automatically removed after processing

## Check Status

```bash
# View scheduled scaling status
kubectl get scheduledscaling <name> -o yaml

# View only the phase
kubectl get scheduledscaling <name> -o jsonpath='{.status.phase}'

# View status message
kubectl get scheduledscaling <name> -o jsonpath='{.status.message}'
```

## Complete Examples

```bash
# 1. List active scheduled scalings
kubectl get scheduledscalings

# 2. Revert an active scheduled scaling
kubectl annotate scheduledscaling my-scheduled-scaling scaling.kubernetes.io/action=revert

# 3. Verify if it was reverted
kubectl get scheduledscaling my-scheduled-scaling -o jsonpath='{.status.phase}'
# Should return: Cancelled

# 4. View controller logs
kubectl logs -l app=scheduledscaling-controller --tail=20 | grep revert
```

## Advantages

- ✅ **Native kubectl** - no plugins or external tools required
- ✅ **Works with any Kubernetes client** - any tool that supports annotations
- ✅ **Idempotent** - can be executed multiple times without issues
- ✅ **Automatic** - the controller processes the annotation and removes it after execution

## Notes

- The annotation is processed in the next reconciliation cycle (usually within seconds)
- If the scheduled scaling is not active, revert won't do anything (but cancel will still work)
- The annotation is automatically removed after processing
- You can check the controller logs to confirm execution
