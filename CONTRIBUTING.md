# Contributing to Kubernetes Scheduled Scaling Manager

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/kubernetes-scheduled-scaling.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Commit your changes: `git commit -m "Add your feature description"`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Open a Pull Request

## Development Setup

See [INSTALLATION.md](INSTALLATION.md) and [hack/K3D_SETUP.md](hack/K3D_SETUP.md) for detailed setup instructions.

### Quick Start

```bash
# Install dependencies
make deps

# Run locally
make run-controller  # Terminal 1
make run-api         # Terminal 2
cd frontend && npm start  # Terminal 3
```

## Code Style

### Go

- Follow standard Go formatting: `go fmt ./...`
- Run linters: `golangci-lint run`
- Add comments for exported functions and types
- Keep functions focused and small

### JavaScript/React

- Follow ESLint rules (already configured)
- Use functional components with hooks
- Keep components small and focused

## Testing

Before submitting a PR:

1. Test your changes locally
2. Ensure all existing tests pass
3. Add tests for new features if applicable
4. Test with a real Kubernetes cluster (k3d, minikube, etc.)

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add support for KEDA ScaledObjects`
- `fix: correct timezone handling in scheduler`
- `docs: update installation instructions`
- `refactor: simplify controller reconciliation logic`

## Pull Request Process

1. Update documentation if needed
2. Add/update tests if applicable
3. Ensure code follows project style
4. Update CHANGELOG.md if applicable
5. Request review from maintainers

## Questions?

Open an issue for questions, bug reports, or feature requests.
