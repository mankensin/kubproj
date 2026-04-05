# Local Kubernetes + Helm Learning Path

A hands-on guide to learning Kubernetes and Helm using a React frontend + PostgreSQL backend, running locally in a Dev Container (WSL) with Kind.

---

## Phase 1: Environment Setup (Dev Container + WSL)

### 1. Prerequisites on Windows

- Install **WSL 2** (Ubuntu distro)
- Install **Docker Desktop** → enable WSL 2 integration
- Install **VS Code** + **Dev Containers** extension

### 2. Create your project structure

```
my-k8s-project/
├── .devcontainer/
│   └── devcontainer.json
├── frontend/          # React app
├── backend/           # Node/Express + PostgreSQL API
└── helm-charts/       # Your Helm charts
```

### 3. Create `.devcontainer/devcontainer.json`

```jsonc
{
  "name": "K8s Dev Environment",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/kubectl-helm-minikube:1": {
      "helm": "latest",
      "kubectl": "latest",
      "minikube": "none"
    },
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers-extra/features/kind:1": {}
  },
  "remoteUser": "vscode"
}
```

### 4. Open in Dev Container

- Open the project folder in VS Code
- `Ctrl+Shift+P` → **Dev Containers: Reopen in Container**
- Wait for the container to build

### 5. Verify tools

```bash
docker --version
kubectl version --client
helm version
kind version
```

---

## Phase 2: Create the Applications

### 6. Scaffold the React frontend

```bash
cd frontend
npx create-react-app . --template typescript
# Or use Vite: npm create vite@latest . -- --template react-ts
```

### 7. Create a simple backend API

```bash
cd backend
npm init -y
npm install express pg cors
```

Create `backend/index.js`:

```js
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "appdb",
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.get("/api/items", async (req, res) => {
  const result = await pool.query("SELECT * FROM items");
  res.json(result.rows);
});

app.listen(3001, () => console.log("Backend running on :3001"));
```

### 8. Dockerize both apps

**`frontend/Dockerfile`**:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**`frontend/nginx.conf`**:

```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
    }
    location /api/ {
        proxy_pass http://backend-service:3001;
    }
}
```

**`backend/Dockerfile`**:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
```

### 9. Build and test images locally

```bash
cd frontend && docker build -t my-frontend:latest .
cd ../backend && docker build -t my-backend:latest .
```

---

## Phase 3: Create the Kind Cluster

### 10. Create a Kind cluster config

Create `kind-config.yaml` at the project root:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080   # NodePort for frontend
        hostPort: 8080
      - containerPort: 30081   # NodePort for backend
        hostPort: 8081
```

### 11. Create the cluster

```bash
kind create cluster --name my-app --config kind-config.yaml
```

### 12. Load your Docker images into Kind

```bash
kind load docker-image my-frontend:latest --name my-app
kind load docker-image my-backend:latest --name my-app
```

> Kind runs its own container registry. You must load images explicitly.

### 13. Verify the cluster

```bash
kubectl cluster-info --context kind-my-app
kubectl get nodes
```

---

## Phase 4: Learn Plain Kubernetes Manifests First

> **Do this before Helm** so you understand what Helm abstracts.

### 14. Create raw manifests in `k8s-manifests/`

Write these files yourself:

- `namespace.yaml` — create a namespace `my-app`
- `postgres-secret.yaml` — store DB credentials in a Secret
- `postgres-pvc.yaml` — PersistentVolumeClaim for data
- `postgres-deployment.yaml` — PostgreSQL Deployment + Service
- `backend-deployment.yaml` — Backend Deployment + Service
- `frontend-deployment.yaml` — Frontend Deployment + Service (NodePort)

**Key concepts to practice:**

```bash
kubectl apply -f k8s-manifests/namespace.yaml
kubectl apply -f k8s-manifests/ -n my-app
kubectl get pods -n my-app
kubectl logs <pod-name> -n my-app
kubectl describe pod <pod-name> -n my-app
kubectl port-forward svc/frontend-service 8080:80 -n my-app
```

### 15. Debug and iterate

```bash
kubectl get events -n my-app --sort-by='.lastTimestamp'
kubectl exec -it <pod-name> -n my-app -- sh
```

Once this works, **delete everything** and redo it with Helm:

```bash
kubectl delete namespace my-app
```

---

## Phase 5: Helm Charts (The Main Goal)

### 16. Create your first Helm chart

```bash
cd helm-charts
helm create my-app
```

This generates:

```
my-app/
├── Chart.yaml           # Chart metadata
├── values.yaml          # Default configuration values
├── charts/              # Sub-chart dependencies
└── templates/
    ├── _helpers.tpl     # Template helpers
    ├── deployment.yaml  # Deployment template
    ├── service.yaml     # Service template
    ├── ingress.yaml     # Ingress template
    └── ...
```

### 17. Study the generated files

- Read every file in `templates/`
- Understand `{{ .Values.x }}`, `{{ .Release.Name }}`, `{{ include }}`
- Read `_helpers.tpl` to see how named templates work

### 18. Restructure for your 3-tier app

Delete the generated templates and create your own structure:

```
helm-charts/my-app/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── _helpers.tpl
    ├── namespace.yaml
    ├── postgres-secret.yaml
    ├── postgres-pvc.yaml
    ├── postgres-deployment.yaml
    ├── postgres-service.yaml
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── frontend-deployment.yaml
    └── frontend-service.yaml
```

### 19. Parameterize with `values.yaml`

```yaml
namespace: my-app

frontend:
  image: my-frontend:latest
  replicaCount: 1
  service:
    type: NodePort
    port: 80
    nodePort: 30080

backend:
  image: my-backend:latest
  replicaCount: 1
  service:
    port: 3001

postgresql:
  image: postgres:16-alpine
  auth:
    username: postgres
    password: postgres     # override in production!
    database: appdb
  storage:
    size: 1Gi
```

### 20. Template example — `templates/backend-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}-backend
  namespace: {{ .Values.namespace }}
spec:
  replicas: {{ .Values.backend.replicaCount }}
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: {{ .Values.backend.image }}
          imagePullPolicy: Never    # using kind-loaded images
          ports:
            - containerPort: 3001
          env:
            - name: DB_HOST
              value: {{ include "my-app.fullname" . }}-postgres
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: {{ include "my-app.fullname" . }}-postgres-secret
                  key: username
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ include "my-app.fullname" . }}-postgres-secret
                  key: password
            - name: DB_NAME
              value: {{ .Values.postgresql.auth.database }}
```

### 21. Validate before installing

```bash
# Check for syntax errors
helm lint helm-charts/my-app

# See what would be generated (DRY RUN)
helm template my-release helm-charts/my-app

# Dry-run against the cluster
helm install my-release helm-charts/my-app --dry-run --debug
```

### 22. Install the chart

```bash
helm install my-release helm-charts/my-app
```

### 23. Essential Helm commands to practice

```bash
# List releases
helm list

# Check status
helm status my-release

# Upgrade (after changing values or templates)
helm upgrade my-release helm-charts/my-app

# Override values at install time
helm upgrade my-release helm-charts/my-app --set backend.replicaCount=3

# Use a separate values file for environments
helm upgrade my-release helm-charts/my-app -f values-dev.yaml

# Rollback
helm rollback my-release 1

# View release history
helm history my-release

# Uninstall
helm uninstall my-release
```

---

## Phase 6: Advanced Helm Exercises

### 24. Use a sub-chart for PostgreSQL

Instead of writing your own PostgreSQL templates, use the Bitnami chart:

```bash
# Add the Bitnami repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

In `Chart.yaml`, add:

```yaml
dependencies:
  - name: postgresql
    version: "~16.0"
    repository: https://charts.bitnami.com/bitnami
```

Then:

```bash
helm dependency update helm-charts/my-app
helm install my-release helm-charts/my-app
```

Override sub-chart values in your `values.yaml`:

```yaml
postgresql:
  auth:
    postgresPassword: postgres
    database: appdb
  primary:
    persistence:
      size: 1Gi
```

### 25. Add an Ingress controller (optional but valuable)

```bash
# Install NGINX Ingress via Helm
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx
```

Then add an `ingress.yaml` template that routes `/` → frontend, `/api` → backend.

### 26. Create multiple values files

```
values-dev.yaml    # 1 replica, debug logging
values-staging.yaml # 2 replicas
values-prod.yaml   # 3 replicas, resource limits
```

```bash
helm upgrade my-release helm-charts/my-app -f values-dev.yaml
```

---

## Learning Checkpoints

| # | Milestone | You should be able to... |
|---|-----------|--------------------------|
| 1 | Dev Container | Open terminal, run docker/kubectl/helm/kind |
| 2 | Docker | Build images, run containers, debug with logs |
| 3 | Kind cluster | Create/delete clusters, load images |
| 4 | Raw K8s | Write Deployments, Services, Secrets, PVCs by hand |
| 5 | kubectl | Debug pods, port-forward, exec into containers |
| 6 | Helm basics | `create`, `lint`, `template`, `install`, `upgrade` |
| 7 | Helm values | Parameterize everything, use multiple values files |
| 8 | Sub-charts | Use Bitnami PostgreSQL as a dependency |
| 9 | Rollbacks | `helm rollback`, understand revision history |

---

## Recommended Learning Order

1. **Get the Dev Container running** with all tools installed
2. **Dockerize both apps** and verify they run with `docker compose` first
3. **Create a Kind cluster** and deploy **raw manifests** — struggle with this, it's where the real learning happens
4. **Tear it down** and rebuild with **Helm** — you'll immediately see the value of templating
5. **Refactor** to use Bitnami PostgreSQL sub-chart
6. **Practice upgrades, rollbacks, and multi-environment values**
