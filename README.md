# Kubernetes Scheduled Scaling Manager

> 💡 **Early Development**  
> This project is in active development. We welcome feedback and contributions! Please note that features and APIs are subject to change.

A Kubernetes-native solution for scheduling and managing scheduled scale-up/scale-down operations for applications using HPA (Horizontal Pod Autoscaler) or KEDA.

## Features

- 📅 **Schedule Scale Operations**: Schedule scale-up or scale-down operations at specific times
- 🔄 **Automatic Reversion**: Automatically revert HPA min/max settings after scheduled period
- 🎯 **HPA/KEDA Support**: Works with both native HPA and KEDA ScaledObjects
- 🔁 **Recurring Schedules**: Support for recurring schedules using Kubernetes CronJobs
- 📊 **Visual Dashboard**: Web UI for viewing, creating, updating, and canceling scheduled scalings
- ☸️ **Kubernetes Native**: Uses Custom Resources and Kubernetes API for all operations

## Architecture

- **Backend Controller**: Go-based Kubernetes controller that watches ScheduledScaling CRDs and manages HPA/KEDA resources
- **REST API**: RESTful API for scheduled scaling management operations
- **Frontend**: React-based web dashboard for user interaction
- **Custom Resources**: Kubernetes CRDs for storing scheduled scaling schedules

## Quick Start

### Prerequisites

- Kubernetes cluster (1.20+)
- kubectl configured
- Go 1.21+ (for building)
- Node.js 16+ (for frontend)

### Installation

1. Install the Custom Resource Definition:
```bash
kubectl apply -f deploy/crd.yaml
```

2. Deploy RBAC:
```bash
kubectl apply -f deploy/rbac.yaml
```

3. Deploy the controller:
```bash
kubectl apply -f deploy/controller-deployment.yaml
```

4. Deploy the API service:
```bash
kubectl apply -f deploy/api-deployment.yaml
```

5. Deploy the frontend:
```bash
kubectl apply -f deploy/frontend-deployment.yaml
```

## Usage

### Create a ScheduledScaling

```yaml
apiVersion: scaling.kubernetes.io/v1alpha1
kind: ScheduledScaling
metadata:
  name: scale-up-production
  namespace: default
spec:
  targetRef:
    apiVersion: autoscaling/v2
    kind: HorizontalPodAutoscaler
    name: my-app-hpa
    namespace: default
  schedule:
    startTime: "2024-01-15T10:00:00Z"
    endTime: "2024-01-15T18:00:00Z"
  scaling:
    minReplicas: 5
    maxReplicas: 10
  revert: true
```

### Via API

```bash
curl -X POST http://scheduledscaling-api/api/v1/scheduledscalings \
  -H "Content-Type: application/json" \
  -d '{
    "apiVersion": "scaling.kubernetes.io/v1alpha1",
    "kind": "ScheduledScaling",
    "metadata": {
      "name": "scale-up-production",
      "namespace": "default"
    },
    "spec": {
      "targetRef": {
        "apiVersion": "autoscaling/v2",
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

## Components

- **Controller**: Watches ScheduledScaling resources and executes scheduled scaling
- **API Server**: REST API for managing scheduled scalings
- **Frontend**: Web UI dashboard
- **CRD**: ScheduledScaling custom resource definition

## Development

### Local Development

1. Start the controller:
```bash
make run-controller
```

2. Start the API server:
```bash
make run-api
```

3. Start the frontend:
```bash
make run-frontend
```

### Building

Build all Docker images:
```bash
make build
```

## Architecture Details

### Controller
- Watches `ScheduledScaling` Custom Resources
- Manages HPA min/max replica settings
- Handles scheduled scaling and automatic reversion
- Supports recurring schedules using Kubernetes CronJobs
- Uses Kubernetes controller-runtime

### API Server
- RESTful API for CRUD operations on scheduled scalings
- Uses Kubernetes dynamic client
- Provides CORS support for frontend

### Frontend
- React-based single-page application
- Real-time scheduled scaling management
- Responsive design with sortable columns
- Auto-refreshes scheduled scaling status

## Example Use Cases

1. **Scheduled Scale-Up for Peak Hours**
   - Scale up before business hours
   - Scale down after hours
   - Automatic reversion

2. **Maintenance Windows**
   - Scale down for maintenance
   - Scale back up after completion

3. **Event-Based Scaling**
   - Scale up for known traffic spikes
   - Pre-scheduled scaling for events

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
