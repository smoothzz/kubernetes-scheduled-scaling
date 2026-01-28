.PHONY: build push deploy clean

# Build Docker images
build:
	docker build -f Dockerfile.controller -t scheduledscaling-controller:latest .
	docker build -f Dockerfile.api -t scheduledscaling-api:latest .
	docker build -f Dockerfile.frontend -t scheduledscaling-frontend:latest .

# Deploy to Kubernetes
deploy:
	kubectl apply -f deploy/crd.yaml
	kubectl apply -f deploy/rbac.yaml
	kubectl apply -f deploy/controller-deployment.yaml
	kubectl apply -f deploy/api-deployment.yaml
	kubectl apply -f deploy/frontend-deployment.yaml

# Clean up
clean:
	kubectl delete -f deploy/frontend-deployment.yaml || true
	kubectl delete -f deploy/api-deployment.yaml || true
	kubectl delete -f deploy/controller-deployment.yaml || true
	kubectl delete -f deploy/rbac.yaml || true
	kubectl delete -f deploy/crd.yaml || true

# Install dependencies
deps:
	go mod download
	cd frontend && npm install

# Run locally (development)
run-controller:
	go run cmd/controller/main.go

run-api:
	go run cmd/api/main.go

run-frontend:
	cd frontend && npm start
