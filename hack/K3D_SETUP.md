# Using Kubernetes Scheduled Scaling with k3d

This guide will walk you through setting up and using the Kubernetes Scheduled Scaling Manager in a k3d (k3s in Docker) cluster for local development and testing.

## Prerequisites

- Docker installed and running
- k3d CLI installed ([installation guide](https://k3d.io/v5.4.6/#installation))
- kubectl installed
- Go 1.21+ (for building from source)
- Node.js 16+ (for frontend development, optional if using pre-built images)

## Step 1: Create a k3d Cluster

Create a k3d cluster with port mappings for accessing services:

```bash
k3d cluster create scaling-cluster \
  --port "8080:80@loadbalancer" \
  --port "8443:443@loadbalancer" \
  --api-port 6443 \
  --servers 1 \
  --agents 1
```

This creates a cluster with:
- Port 8080 mapped to LoadBalancer port 80 (for frontend)
- Port 8443 mapped to LoadBalancer port 443 (for HTTPS)
- API server on port 6443
- 1 control plane node and 1 worker node

Verify the cluster is running:

```bash
kubectl cluster-info
kubectl get nodes
```

## Step 2: Build Docker Images

Build all required images:

```bash
cd kubernetes-scheduled-scaling

# Build controller
docker build -f Dockerfile.controller -t scheduledscaling-controller:latest .

# Build API server
docker build -f Dockerfile.api -t scheduledscaling-api:latest .

# Build frontend
docker build -f Dockerfile.frontend -t scheduledscaling-frontend:latest .
```

## Step 3: Import Images into k3d

k3d runs in Docker, so we need to import the images into the k3d cluster:

```bash
# Import controller image
k3d image import scheduledscaling-controller:latest -c scaling-cluster

# Import API image
k3d image import scheduledscaling-api:latest -c scaling-cluster

# Import frontend image
k3d image import scheduledscaling-frontend:latest -c scaling-cluster
```

Alternatively, you can use a registry approach:

```bash
# Create a local registry
k3d registry create scaling-registry --port 5000

# Recreate cluster with registry
k3d cluster delete scaling-cluster
k3d cluster create scaling-cluster \
  --port "8080:80@loadbalancer" \
  --port "8443:443@loadbalancer" \
  --api-port 6443 \
  --registry-use k3d-scaling-registry:5000 \
  --servers 1 \
  --agents 1

# Tag and push images
docker tag scheduledscaling-controller:latest k3d-scaling-registry:5000/scheduledscaling-controller:latest
docker tag scheduledscaling-api:latest k3d-scaling-registry:5000/scheduledscaling-api:latest
docker tag scheduledscaling-frontend:latest k3d-scaling-registry:5000/scheduledscaling-frontend:latest

docker push k3d-scaling-registry:5000/scheduledscaling-controller:latest
docker push k3d-scaling-registry:5000/scheduledscaling-api:latest
docker push k3d-scaling-registry:5000/scheduledscaling-frontend:latest

# Update deployment files to use registry images
```

## Step 4: Deploy the Application

### 4.1 Install Custom Resource Definition

```bash
kubectl apply -f deploy/crd.yaml
```

Verify the CRD is installed:

```bash
kubectl get crd scheduledscalings.scaling.kubernetes.io
```

### 4.2 Install RBAC

```bash
kubectl apply -f deploy/rbac.yaml
```

### 4.3 Deploy Controller

```bash
kubectl apply -f deploy/controller-deployment.yaml
```

Wait for the controller to be ready:

```bash
kubectl wait --for=condition=available --timeout=300s deployment/scheduledscaling-controller
```

Check controller logs:

```bash
kubectl logs -f deployment/scheduledscaling-controller
```

### 4.4 Deploy API Server

```bash
kubectl apply -f deploy/api-deployment.yaml
```

Wait for the API to be ready:

```bash
kubectl wait --for=condition=available --timeout=300s deployment/scheduledscaling-api
```

Test the API:

```bash
kubectl port-forward svc/scheduledscaling-api 8081:80 &
curl http://localhost:8081/api/v1/scheduledscalings
```

### 4.5 Deploy Frontend

```bash
kubectl apply -f deploy/frontend-deployment.yaml
```

Wait for the frontend to be ready:

```bash
kubectl wait --for=condition=available --timeout=300s deployment/scheduledscaling-frontend
```

## Step 5: Access the Application

### Option 1: Using LoadBalancer (k3d default)

k3d automatically creates a LoadBalancer. Access the frontend at:

```
http://localhost:8080
```

### Option 2: Using Port Forward

If LoadBalancer doesn't work, use port-forward:

```bash
kubectl port-forward svc/scheduledscaling-frontend 8080:80
```

Then access at: `http://localhost:8080`

### Option 3: Using NodePort

Check the NodePort service:

```bash
kubectl get svc scheduledscaling-frontend
```

Access via the node IP and NodePort.

## Step 6: Create a Test HPA

Before creating scheduled scalings, you need an HPA to target. Create a test deployment and HPA:

```bash
# Create a test deployment
kubectl create deployment test-app --image=nginx:latest --replicas=2

# Expose the deployment
kubectl expose deployment test-app --port=80 --type=ClusterIP

# Create an HPA
kubectl autoscale deployment test-app --cpu-percent=50 --min=2 --max=10

# Verify HPA
kubectl get hpa test-app
```

## Step 7: Create Your First ScheduledScaling

### Via Web UI

1. Open `http://localhost:8080` in your browser
2. Click "New ScheduledScaling"
3. Fill in the form:
   - **Namespace**: `default`
   - **Target Type**: `HorizontalPodAutoscaler`
   - **Target Name**: `test-app`
   - **Start Time**: Set to a few minutes from now
   - **End Time**: Set to 1 hour later
   - **Min Replicas**: `5`
   - **Max Replicas**: `10`
   - **Auto-revert**: Checked
4. Click "Create ScheduledScaling"

### Via kubectl

Create a ScheduledScaling YAML file:

```yaml
# test-scheduledscaling.yaml
apiVersion: scaling.kubernetes.io/v1alpha1
kind: ScheduledScaling
metadata:
  name: test-scale-up
  namespace: default
spec:
  targetRef:
    apiVersion: autoscaling/v2
    kind: HorizontalPodAutoscaler
    name: test-app
    namespace: default
  schedule:
    startTime: "2024-01-15T10:00:00Z"
    endTime: "2024-01-15T11:00:00Z"
  scaling:
    minReplicas: 5
    maxReplicas: 10
  revert: true
```

Apply it:

```bash
kubectl apply -f test-scheduledscaling.yaml
```

### Via API

```bash
curl -X POST http://localhost:8081/api/v1/scheduledscalings \
  -H "Content-Type: application/json" \
  -d '{
    "apiVersion": "scaling.kubernetes.io/v1alpha1",
    "kind": "ScheduledScaling",
    "metadata": {
      "name": "api-test-scheduledscaling",
      "namespace": "default"
    },
    "spec": {
      "targetRef": {
        "kind": "HorizontalPodAutoscaler",
        "name": "test-app",
        "namespace": "default"
      },
      "schedule": {
        "startTime": "2024-01-15T10:00:00Z",
        "endTime": "2024-01-15T11:00:00Z"
      },
      "scaling": {
        "minReplicas": 5,
        "maxReplicas": 10
      },
      "revert": true
    }
  }'
```

## Step 8: Monitor ScheduledScalings

### Check ScheduledScaling status

```bash
# List all scheduledscalings
kubectl get scheduledscalings

# Or use short name
kubectl get ss

# Get detailed information
kubectl get scheduledscalings test-scale-up -o yaml

# Watch scheduledscalings
kubectl get scheduledscalings -w
```

### Check HPA changes

```bash
# Watch HPA
kubectl get hpa test-app -w

# Check HPA details
kubectl describe hpa test-app
```

### View controller logs

```bash
kubectl logs -f deployment/scheduledscaling-controller
```

## Troubleshooting

### Images not found

If pods show `ImagePullBackOff`:

1. Verify images are imported:
```bash
k3d image list -c scaling-cluster
```

2. Re-import images:
```bash
k3d image import scheduledscaling-controller:latest -c scaling-cluster
k3d image import scheduledscaling-api:latest -c scaling-cluster
k3d image import scheduledscaling-frontend:latest -c scaling-cluster
```

### Controller not starting

Check logs:
```bash
kubectl logs deployment/scheduledscaling-controller
```

Check RBAC:
```bash
kubectl auth can-i update horizontalpodautoscalers \
  --as=system:serviceaccount:default:scheduledscaling-controller
```

### Frontend can't connect to API

1. Check API service:
```bash
kubectl get svc scheduledscaling-api
```

2. Test API directly:
```bash
kubectl port-forward svc/scheduledscaling-api 8081:80
curl http://localhost:8081/health
```

3. Update frontend environment variable if needed:
```bash
kubectl set env deployment/scheduledscaling-frontend \
  REACT_APP_API_URL=http://scheduledscaling-api:80
```

### ScheduledScaling not executing

1. Check controller logs for errors
2. Verify startTime is in the future and correctly formatted (RFC3339)
3. Verify HPA exists:
```bash
kubectl get hpa test-app
```

4. Check ScheduledScaling status:
```bash
kubectl describe scheduledscaling <scheduledscaling-name>
```

## Development Workflow

### Rebuild and Redeploy

When making code changes:

```bash
# Rebuild images
docker build -f Dockerfile.controller -t scheduledscaling-controller:latest .
docker build -f Dockerfile.api -t scheduledscaling-api:latest .
docker build -f Dockerfile.frontend -t scheduledscaling-frontend:latest .

# Re-import into k3d
k3d image import scheduledscaling-controller:latest -c scaling-cluster
k3d image import scheduledscaling-api:latest -c scaling-cluster
k3d image import scheduledscaling-frontend:latest -c scaling-cluster

# Restart deployments
kubectl rollout restart deployment/scheduledscaling-controller
kubectl rollout restart deployment/scheduledscaling-api
kubectl rollout restart deployment/scheduledscaling-frontend
```

### Local Development with Hot Reload

For faster development, run components locally and connect to k3d:

```bash
# Set kubeconfig to use k3d
export KUBECONFIG=$(k3d kubeconfig write scaling-cluster)

# Run controller locally
go run cmd/controller/main.go

# Run API locally (in another terminal)
go run cmd/api/main.go

# Run frontend locally (in another terminal)
cd frontend
REACT_APP_API_URL=http://localhost:8080 npm start
```

## Cleanup

### Delete the Application

```bash
# Delete deployments
kubectl delete -f deploy/frontend-deployment.yaml
kubectl delete -f deploy/api-deployment.yaml
kubectl delete -f deploy/controller-deployment.yaml
kubectl delete -f deploy/rbac.yaml
kubectl delete -f deploy/crd.yaml

# Delete test resources
kubectl delete hpa test-app
kubectl delete svc test-app
kubectl delete deployment test-app
```

### Delete the k3d Cluster

```bash
# Delete the cluster
k3d cluster delete scaling-cluster

# Optional: Delete registry if created
k3d registry delete scaling-registry
```

## Useful k3d Commands

```bash
# List clusters
k3d cluster list

# Get kubeconfig
k3d kubeconfig merge scaling-cluster --kubeconfig-switch-context

# View cluster info
k3d cluster list scaling-cluster

# Stop/start cluster (pause/resume containers)
docker stop k3d-scaling-cluster-server-0
docker start k3d-scaling-cluster-server-0

# View cluster logs
k3d cluster logs scaling-cluster
```

## Next Steps

- Create more complex scheduled scaling scenarios
- Test with multiple HPAs
- Experiment with different scheduling patterns
- Test recurring schedules with cron expressions
- Integrate with CI/CD pipelines
- Monitor with Prometheus/Grafana (if installed)

## Additional Resources

- [k3d Documentation](https://k3d.io/)
- [k3s Documentation](https://k3s.io/)
- [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
