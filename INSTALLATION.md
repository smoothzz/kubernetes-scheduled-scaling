# Installation Guide

## Prerequisites

- Kubernetes cluster (version 1.20 or higher)
- `kubectl` configured to access your cluster
- Docker (for building images)
- Go 1.21+ (for building from source)
- Node.js 16+ and npm (for frontend development)

## Quick Installation

### 1. Install the Custom Resource Definition

```bash
kubectl apply -f deploy/crd.yaml
```

Verify the CRD is installed:
```bash
kubectl get crd scheduledscalings.scaling.kubernetes.io
```

### 2. Install RBAC

```bash
kubectl apply -f deploy/rbac.yaml
```

### 3. Build and Push Docker Images

Build the images:
```bash
make build
```

Or manually:
```bash
docker build -f Dockerfile.controller -t scheduledscaling-controller:latest .
docker build -f Dockerfile.api -t scheduledscaling-api:latest .
docker build -f Dockerfile.frontend -t scheduledscaling-frontend:latest .
```

If using a container registry, tag and push:
```bash
docker tag scheduledscaling-controller:latest your-registry/scheduledscaling-controller:latest
docker tag scheduledscaling-api:latest your-registry/scheduledscaling-api:latest
docker tag scheduledscaling-frontend:latest your-registry/scheduledscaling-frontend:latest

docker push your-registry/scheduledscaling-controller:latest
docker push your-registry/scheduledscaling-api:latest
docker push your-registry/scheduledscaling-frontend:latest
```

Then update the image references in the deployment files.

### 4. Deploy Components

Deploy all components:
```bash
make deploy
```

Or deploy individually:
```bash
kubectl apply -f deploy/controller-deployment.yaml
kubectl apply -f deploy/api-deployment.yaml
kubectl apply -f deploy/frontend-deployment.yaml
```

### 5. Verify Installation

Check that all pods are running:
```bash
kubectl get pods -l app=scheduledscaling-controller
kubectl get pods -l app=scheduledscaling-api
kubectl get pods -l app=scheduledscaling-frontend
```

Check controller logs:
```bash
kubectl logs -l app=scheduledscaling-controller
```

### 6. Access the Frontend

Get the frontend service URL:
```bash
kubectl get svc scheduledscaling-frontend
```

If using LoadBalancer, wait for the external IP. If using NodePort or port-forward:
```bash
kubectl port-forward svc/scheduledscaling-frontend 8080:80
```

Then access at http://localhost:8080

## Development Setup

### Running Locally

1. **Controller** (requires cluster access):
```bash
go run cmd/controller/main.go
```

2. **API Server**:
```bash
go run cmd/api/main.go
```

3. **Frontend**:
```bash
cd frontend
npm install
npm start
```

The frontend will run on http://localhost:3000

### Building from Source

```bash
# Install Go dependencies
go mod download

# Build controller
go build -o bin/controller cmd/controller/main.go

# Build API
go build -o bin/api cmd/api/main.go

# Build frontend
cd frontend
npm install
npm run build
```

## Troubleshooting

### Controller not starting

Check logs:
```bash
kubectl logs -l app=scheduledscaling-controller
```

Verify RBAC permissions:
```bash
kubectl auth can-i update horizontalpodautoscalers --as=system:serviceaccount:default:scheduledscaling-controller
```

### API not accessible

Check service:
```bash
kubectl get svc scheduledscaling-api
kubectl describe svc scheduledscaling-api
```

Test API directly:
```bash
kubectl port-forward svc/scheduledscaling-api 8081:80
curl http://localhost:8081/api/v1/scheduledscalings
```

### Frontend can't connect to API

Update the API URL in `frontend/src/App.js` or set environment variable:
```bash
REACT_APP_API_URL=http://your-api-url npm start
```

## Uninstallation

Remove all components:
```bash
make clean
```

Or manually:
```bash
kubectl delete -f deploy/frontend-deployment.yaml
kubectl delete -f deploy/api-deployment.yaml
kubectl delete -f deploy/controller-deployment.yaml
kubectl delete -f deploy/rbac.yaml
kubectl delete -f deploy/crd.yaml
```

Note: This will NOT delete existing ScheduledScaling resources. Delete them manually if needed:
```bash
kubectl delete scheduledscalings --all --all-namespaces
```
