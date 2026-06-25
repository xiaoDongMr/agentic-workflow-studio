# aio-sandbox Kubernetes 接入

本文档说明如何把 `aio-sandbox` 接入本项目的沙箱资源池。后端通过 Kubernetes API 创建 Pod 和 Service，为工作流代码节点提供隔离运行环境。

## 适用范围

当前项目使用 `kubernetes_api` 接入方式：

- 不需要把本项目后端部署到 Kubernetes 集群内。
- 后端运行时不依赖 `kubectl`。
- 后端通过 Kubernetes Python Client 直接调用 Kubernetes API Server。
- 沙箱实例由后端创建为 Kubernetes Pod 和 Service。

## 暴露方式选择

| 方式 | 适用场景 | 是否需要网关 | 返回地址 |
| --- | --- | --- | --- |
| `NodePort` | 开发环境、内网环境、无需域名的快速接入 | 否 | `http://<node-ip>:<node-port>` |
| `ClusterIP` | 调用方也运行在 Kubernetes 集群内 | 否 | `http://<service>.<namespace>.svc.cluster.local:8080` |
| `ClusterIP + Gateway/Ingress` | 集群外访问、统一入口、HTTPS、生产化治理 | 是 | `https://<sandbox-host>` |

默认使用 `NodePort`。如果后续需要统一域名、HTTPS、鉴权、审计或多租户治理，再切换到 `ClusterIP + Gateway/Ingress`。

## 架构

```text
Workflow / Sandbox Pool Page
  -> Local Backend
  -> Kubernetes Python Client
  -> Kubernetes API Server
  -> Pod + Service
  -> Sandbox URL
```

资源池 API：

```text
GET    /api/sandbox-pool/health
GET    /api/sandboxes
POST   /api/sandboxes
GET    /api/sandboxes/{sandbox_id}
DELETE /api/sandboxes/{sandbox_id}
```

## 前置条件

- 已有可访问的 Kubernetes 集群。
- 本地后端机器可以访问 Kubernetes API Server。
- 集群可以拉取所配置的沙箱镜像。
- 本地后端已安装 Python 依赖中的 `kubernetes` client。

## 镜像选择

项目默认使用官方 `aio-sandbox` 镜像：

```text
enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
```

如果代码节点需要 Python Playwright 依赖，可以直接使用已发布的公共镜像：

```text
ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest
```

## 集群准备

由集群管理员创建命名空间，并给资源池控制逻辑准备最小权限：

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sandbox-pool-manager
  namespace: aio-sandbox
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: sandbox-pool-manager
  namespace: aio-sandbox
rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: sandbox-pool-manager
  namespace: aio-sandbox
subjects:
  - kind: ServiceAccount
    name: sandbox-pool-manager
    namespace: aio-sandbox
roleRef:
  kind: Role
  name: sandbox-pool-manager
  apiGroup: rbac.authorization.k8s.io
```

如果启用 `ClusterIP + Gateway/Ingress`，还需要允许管理 Ingress：

```yaml
rules:
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
```

## 连接 Kubernetes API

推荐使用 kubeconfig。项目根目录提供了 `kubeconfig.example.yaml` 示例：

```bash
cp kubeconfig.example.yaml kubeconfig.yaml
```

然后把 `kubeconfig.yaml` 中的 API Server、CA 和 token 替换为集群管理员提供的真实值。`kubeconfig.yaml` 已加入 `.gitignore`，不要提交到仓库。

`config.yaml` 中引用本地 kubeconfig：

```yaml
sandbox_pool:
  provider: kubernetes_api
  kubernetes_api:
    connection:
      kubeconfig: ./kubeconfig.yaml
      context: default
      verify_ssl: true
```

也可以使用 API Server 地址和 token：

```yaml
sandbox_pool:
  provider: kubernetes_api
  kubernetes_api:
    connection:
      host: https://<kubernetes-api-server>
      token: <service-account-token>
      ca_cert_file: /path/to/ca.crt
      verify_ssl: true
```

注意：

- kubeconfig 或 token 由集群管理员提供。
- 不要把真实 token、内网地址、个人用户名提交到仓库。
- 生产环境建议使用最小权限 ServiceAccount。

## 快速开始

1. 准备 kubeconfig：

```bash
cp kubeconfig.example.yaml kubeconfig.yaml
```

2. 将 `kubeconfig.yaml` 中的 API Server、CA 和 token 替换为真实值。

3. 在 `config.yaml` 中启用默认 `NodePort` 模式：

```yaml
sandbox_pool:
  provider: kubernetes_api
  kubernetes_api:
    namespace: aio-sandbox
    image: ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest
    service_type: NodePort
    connection:
      kubeconfig: ./kubeconfig.yaml
      context: default
      verify_ssl: true
```

4. 启动本项目后端：

```bash
uvicorn app.main:app --reload
```

5. 创建并查看沙箱：

```bash
curl -X POST http://127.0.0.1:8000/api/sandboxes \
  -H 'Content-Type: application/json' \
  -d '{"sandbox_id":"demo-001"}'

curl http://127.0.0.1:8000/api/sandboxes
```

## 配置资源池

在 `config.yaml` 中配置沙箱资源池。`image` 可以替换为任意兼容 `aio-sandbox` 的公共镜像或集群可拉取的私有镜像：

```yaml
sandbox_pool:
  provider: kubernetes_api
  kubernetes_api:
    namespace: aio-sandbox
    image: ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest
    image_pull_policy: IfNotPresent
    service_type: NodePort
    cpu_request: 250m
    memory_request: 512Mi
    cpu_limit: "2"
    memory_limit: 4Gi
    connection:
      kubeconfig: ./kubeconfig.yaml
      context: default
      verify_ssl: true
```

字段说明：

- `namespace`：沙箱资源所在命名空间。
- `image`：沙箱镜像。默认官方镜像可用 `enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest`；需要 Python Playwright 时可用 `ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest`。
- `service_type`：当前默认推荐 `NodePort`，不需要网关，沙箱 URL 会自动生成为 `http://<node-ip>:<node-port>`。
- `port`：可选，默认 `8080`，只有 aio-sandbox 镜像监听端口变化时才需要配置。
- `connection`：本地后端连接 Kubernetes API 的认证配置。

如果使用私有镜像，需要确保 Kubernetes 命名空间中的 Pod 可以拉取该镜像，例如为默认 ServiceAccount 配置 `imagePullSecret`。公共 GHCR 镜像不需要这一步。

## NodePort 访问地址

使用 `NodePort` 时，每个沙箱会创建：

```text
Pod      aio-sandbox-<sandbox-id>
Service  aio-sandbox-<sandbox-id>
```

后端会读取 Service 的 `nodePort`，并自动读取 Pod 所在 Node 的地址：

```text
Pod -> node_name -> Node ExternalIP/InternalIP -> http://<node-ip>:<node-port>
```

返回地址示例：

```text
http://<node-ip>:<node-port>
```

如果配置了 `node_host`，会优先使用 `node_host`；如果不配置，则自动从 Kubernetes Node 信息中推导。

## ClusterIP 访问地址

`ClusterIP` 本身只在 Kubernetes 集群内可访问。它适合两类场景：

- 调用方也运行在 Kubernetes 集群内，可以直接访问 Service DNS。
- 调用方在集群外，但通过 Ingress/Gateway/反向代理访问沙箱。

集群内访问配置：

```yaml
sandbox_pool:
  provider: kubernetes_api
  kubernetes_api:
    namespace: aio-sandbox
    image: ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest
    service_type: ClusterIP
    connection:
      kubeconfig: ./kubeconfig.yaml
      context: default
      verify_ssl: true
```

此时每个沙箱仍会创建 Pod 和 Service，但 `sandbox_url` 会返回集群内 DNS：

```text
http://aio-sandbox-<sandbox-id>.aio-sandbox.svc.cluster.local:8080
```

该地址通常只能被集群内服务访问，本地浏览器无法直接打开。

## ClusterIP + Gateway

如果工作流后端或浏览器在集群外，但希望通过统一入口访问沙箱，可以使用 `ClusterIP + Gateway/Ingress`：

```text
External Caller
  -> https://<sandbox-host>
  -> Ingress/Gateway
  -> Service(ClusterIP)
  -> aio-sandbox Pod
```

推荐使用 host/subdomain 路由：

```yaml
sandbox_pool:
  provider: kubernetes_api
  kubernetes_api:
    namespace: aio-sandbox
    image: ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest
    service_type: ClusterIP
    connection:
      kubeconfig: ./kubeconfig.yaml
      context: default
      verify_ssl: true
    gateway:
      enabled: true
      route_mode: host
      ingress_class_name: nginx
      host_template: "{sandbox_id}.sandbox.example.com"
      scheme: https
      port: 443
```

返回地址示例：

```text
https://demo-001.sandbox.example.com
```

需要提前配置：

- Ingress Controller 或 Gateway Controller。
- wildcard DNS，例如 `*.sandbox.example.com` 指向入口负载均衡。
- 如使用 HTTPS，需要配置证书管理。
- RBAC 需要包含 `networking.k8s.io/ingresses` 权限。

`aio-sandbox` UI 会访问 `/code-server`、`/terminal`、`/static` 等根路径资源，因此推荐 host/subdomain 模式。Path 前缀模式只适合 API 转发，不推荐用于完整 Web UI。

## 启动与验证

启动后端：

```bash
uvicorn app.main:app --reload
```

检查资源池健康状态：

```bash
curl http://127.0.0.1:8000/api/sandbox-pool/health
```

创建沙箱：

```bash
curl -X POST http://127.0.0.1:8000/api/sandboxes \
  -H 'Content-Type: application/json' \
  -d '{
    "sandbox_id": "demo-001",
    "thread_id": "workflow-demo"
  }'
```

列出沙箱：

```bash
curl http://127.0.0.1:8000/api/sandboxes
```

删除沙箱：

```bash
curl -X DELETE http://127.0.0.1:8000/api/sandboxes/demo-001
```

## 返回示例

```json
{
  "sandbox_id": "demo-001",
  "sandbox_url": "http://<node-ip>:<node-port>",
  "status": "Pending",
  "pod_name": "aio-sandbox-demo-001",
  "service_name": "aio-sandbox-demo-001",
  "ingress_name": "",
  "namespace": "aio-sandbox"
}
```

## 故障排查

- `health` 返回连接错误：检查 kubeconfig、API Server 地址、证书和网络连通性。
- 创建沙箱失败：检查 ServiceAccount 是否具备 Pod、Service 权限；启用 Gateway 时还需检查 Ingress 权限。
- Pod 一直 `Pending`：检查集群资源、镜像拉取和节点调度状态。
- `sandbox_url` 无法访问：检查 NodePort 端口、防火墙、节点 IP 是否可从本地访问。
- 如果使用纯 `ClusterIP`，集群外无法直接访问，这是预期行为；集群外访问需要 Ingress/Gateway。

## 注意事项

- 当前项目只保留 `kubernetes_api` 资源池方式。
- 本地后端不需要登录集群机器，也不需要通过命令行工具管理沙箱。
- `sandbox_id` 会被规范化为 Kubernetes DNS 名称，仅保留小写字母、数字和 `-`。
- 生产环境应补齐鉴权、租户隔离、配额、审计和资源回收策略。
