from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from kubernetes import client, config
from kubernetes.client import ApiClient
from kubernetes.client.exceptions import ApiException

from deerflow.config.app_config import AppConfig

from app.sandbox_pool.schemas import SandboxCreateRequest, SandboxSummary

DEFAULT_IMAGE = "enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest"
DEFAULT_NAMESPACE = "aio-sandbox"
DEFAULT_PORT = 8080
MANAGED_BY_LABEL = "agentic-workflow-studio"
SANDBOX_ID_LABEL = "sandbox.agentic-workflow-studio/id"
SANDBOX_IMAGE_ID_LABEL = "sandbox.agentic-workflow-studio/image-id"
SANDBOX_COMPONENT_LABEL = "sandbox"
IMAGE_CACHE_COMPONENT_LABEL = "sandbox-image-cache"
SANDBOX_TTL_SECONDS_ANNOTATION = "sandbox.agentic-workflow-studio/ttl-seconds"
SANDBOX_EXPIRES_AT_ANNOTATION = "sandbox.agentic-workflow-studio/expires-at"
DEFAULT_SANDBOX_TTL_SECONDS = 60 * 60
DEFAULT_TTL_CLEANUP_INTERVAL_SECONDS = 60


@dataclass(frozen=True)
class SandboxListResult:
    items: list[SandboxSummary]
    continue_token: str = ""
    remaining_item_count: int | None = None


@dataclass(frozen=True)
class SandboxImagePreloadStatus:
    name: str = ""
    status: str = "not_configured"
    desired: int = 0
    ready: int = 0
    message: str = ""


@dataclass(frozen=True)
class KubernetesSandboxGatewaySettings:
    enabled: bool = False
    route_mode: str = "host"
    ingress_class_name: str = "nginx"
    host_template: str = ""
    base_url: str = ""
    path_template: str = "/sandboxes/{sandbox_id}"
    scheme: str = "http"
    port: int = 0
    path: str = "/"


@dataclass(frozen=True)
class KubernetesApiConnectionSettings:
    kubeconfig: str = ""
    context: str = ""
    host: str = ""
    token: str = ""
    ca_cert_file: str = ""
    verify_ssl: bool = True


@dataclass(frozen=True)
class KubernetesApiSandboxPoolSettings:
    namespace: str = DEFAULT_NAMESPACE
    image: str = DEFAULT_IMAGE
    image_pull_policy: str = "IfNotPresent"
    service_type: str = "NodePort"
    node_host: str = ""
    port: int = DEFAULT_PORT
    cpu_request: str = "250m"
    memory_request: str = "512Mi"
    cpu_limit: str = "2"
    memory_limit: str = "4Gi"
    ttl_seconds: int = DEFAULT_SANDBOX_TTL_SECONDS
    ttl_cleanup_interval_seconds: int = DEFAULT_TTL_CLEANUP_INTERVAL_SECONDS
    connection: KubernetesApiConnectionSettings = field(default_factory=KubernetesApiConnectionSettings)
    gateway: KubernetesSandboxGatewaySettings = field(default_factory=KubernetesSandboxGatewaySettings)
    extra_labels: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_app_config(cls, app_config: AppConfig) -> "KubernetesApiSandboxPoolSettings":
        raw_pool = getattr(app_config, "sandbox_pool", {}) or {}
        if hasattr(raw_pool, "model_dump"):
            raw_pool = raw_pool.model_dump()
        raw_api = raw_pool.get("kubernetes_api", {}) if isinstance(raw_pool, dict) else {}
        if not isinstance(raw_api, dict):
            raw_api = {}
        raw_gateway = raw_api.get("gateway", {}) or {}
        if not isinstance(raw_gateway, dict):
            raw_gateway = {}
        raw_connection = raw_api.get("connection", {}) or {}
        if not isinstance(raw_connection, dict):
            raw_connection = {}

        sandbox = app_config.sandbox
        return cls(
            namespace=str(raw_api.get("namespace", DEFAULT_NAMESPACE)),
            image=str(raw_api.get("image") or sandbox.image or DEFAULT_IMAGE),
            image_pull_policy=str(raw_api.get("image_pull_policy", "IfNotPresent")),
            service_type=str(raw_api.get("service_type", "NodePort")),
            node_host=str(raw_api.get("node_host", "")),
            port=_parse_int_setting(raw_api.get("port"), DEFAULT_PORT, min_value=1),
            cpu_request=str(raw_api.get("cpu_request", "250m")),
            memory_request=str(raw_api.get("memory_request", "512Mi")),
            cpu_limit=str(raw_api.get("cpu_limit", "2")),
            memory_limit=str(raw_api.get("memory_limit", "4Gi")),
            ttl_seconds=_parse_int_setting(
                raw_api.get("ttl_seconds"),
                DEFAULT_SANDBOX_TTL_SECONDS,
                min_value=0,
            ),
            ttl_cleanup_interval_seconds=_parse_int_setting(
                raw_api.get("ttl_cleanup_interval_seconds"),
                DEFAULT_TTL_CLEANUP_INTERVAL_SECONDS,
                min_value=1,
            ),
            connection=KubernetesApiConnectionSettings(
                kubeconfig=str(raw_connection.get("kubeconfig", "")),
                context=str(raw_connection.get("context", "")),
                host=str(raw_connection.get("host", "")),
                token=str(raw_connection.get("token", "")),
                ca_cert_file=str(raw_connection.get("ca_cert_file", "")),
                verify_ssl=bool(raw_connection.get("verify_ssl", True)),
            ),
            gateway=KubernetesSandboxGatewaySettings(
                enabled=bool(raw_gateway.get("enabled", False)),
                route_mode=str(raw_gateway.get("route_mode", "host")),
                ingress_class_name=str(raw_gateway.get("ingress_class_name", "nginx")),
                host_template=str(raw_gateway.get("host_template", "")),
                base_url=str(raw_gateway.get("base_url", "")),
                path_template=str(raw_gateway.get("path_template", "/sandboxes/{sandbox_id}")),
                scheme=str(raw_gateway.get("scheme", "http")),
                port=_parse_int_setting(raw_gateway.get("port"), 0, min_value=0),
                path=str(raw_gateway.get("path", "/")),
            ),
            extra_labels=dict(raw_api.get("labels", {}) or {}),
        )


class KubernetesApiSandboxPool:
    def __init__(self, app_config: AppConfig):
        self.settings = KubernetesApiSandboxPoolSettings.from_app_config(app_config)
        api_client = self._build_api_client()
        self.core_api = client.CoreV1Api(api_client)
        self.apps_api = client.AppsV1Api(api_client)
        self.networking_api = client.NetworkingV1Api(api_client)
        self.version_api = client.VersionApi(api_client)

    def health(self) -> dict[str, Any]:
        extra = {
            "connection": self._connection_health(),
            "gateway": self._gateway_health(),
            "error": "",
            "ttl": {
                "ttlSeconds": self.settings.ttl_seconds,
                "cleanupIntervalSeconds": self.settings.ttl_cleanup_interval_seconds,
            },
        }
        try:
            version = self.version_api.get_code()
            extra["clientVersion"] = version.to_dict() if hasattr(version, "to_dict") else {}
        except Exception as exc:
            extra["clientVersion"] = {}
            extra["error"] = str(exc)
        return {
            "backend": "kubernetes_api",
            "namespace": self.settings.namespace,
            "client": "kubernetes-python-client",
            "enabled": True,
            "extra": extra,
        }

    def list(
        self,
        *,
        limit: int | None = None,
        continue_token: str = "",
        status: str = "",
        image_id: str = "",
        sandbox_id: str = "",
    ) -> SandboxListResult:
        label_selector = (
            f"app.kubernetes.io/managed-by={MANAGED_BY_LABEL},"
            f"{SANDBOX_ID_LABEL}"
        )
        if image_id:
            label_selector = f"{label_selector},{SANDBOX_IMAGE_ID_LABEL}={image_id}"
        if sandbox_id:
            label_selector = f"{label_selector},{SANDBOX_ID_LABEL}={_normalize_name(sandbox_id)}"

        field_selector = f"status.phase={status}" if status else ""
        pods = self.core_api.list_namespaced_pod(
            namespace=self.settings.namespace,
            label_selector=label_selector,
            field_selector=field_selector or None,
            limit=limit,
            _continue=continue_token or None,
        )
        items = [
            self._summary_from_pod(item)
            for item in pods.items
            if not (item.metadata and item.metadata.deletion_timestamp)
        ]
        metadata = pods.metadata or client.V1ListMeta()
        return SandboxListResult(
            items=items,
            continue_token=getattr(metadata, "_continue", "") or "",
            remaining_item_count=getattr(metadata, "remaining_item_count", None),
        )

    def create(self, request: SandboxCreateRequest) -> SandboxSummary:
        sandbox_id = _normalize_name(request.sandbox_id)
        image = request.image or self.settings.image
        ttl_seconds = self.settings.ttl_seconds if request.ttl_seconds is None else request.ttl_seconds
        pod = self._pod_manifest(sandbox_id, image, request.env, request.labels, ttl_seconds)
        service = self._service_manifest(sandbox_id)
        ingress = self._ingress_manifest(sandbox_id) if self.settings.gateway.enabled else None

        self._create_if_missing(self.core_api.create_namespaced_pod, pod)
        self._create_if_missing(self.core_api.create_namespaced_service, service)
        if ingress is not None:
            self._create_if_missing(self.networking_api.create_namespaced_ingress, ingress)
        return self.get(sandbox_id)

    def get(self, sandbox_id: str) -> SandboxSummary:
        sandbox_id = _normalize_name(sandbox_id)
        pod = self.core_api.read_namespaced_pod(name=self._pod_name(sandbox_id), namespace=self.settings.namespace)
        return self._summary_from_pod(pod)

    def delete(self, sandbox_id: str) -> None:
        sandbox_id = _normalize_name(sandbox_id)
        resources = [
            (self.core_api.delete_namespaced_pod, self._pod_name(sandbox_id)),
            (self.core_api.delete_namespaced_service, self._service_name(sandbox_id)),
        ]
        if self.settings.gateway.enabled:
            resources.append((self.networking_api.delete_namespaced_ingress, self._ingress_name(sandbox_id)))
        for deleter, name in resources:
            try:
                deleter(name=name, namespace=self.settings.namespace)
            except ApiException as exc:
                if exc.status != 404:
                    raise

    def cleanup_expired(self) -> list[str]:
        deleted: list[str] = []
        continue_token = ""
        while True:
            result = self.list(limit=100, continue_token=continue_token)
            for sandbox in result.items:
                if sandbox.expired and sandbox.sandbox_id:
                    self.delete(sandbox.sandbox_id)
                    deleted.append(sandbox.sandbox_id)
            if not result.continue_token:
                return deleted
            continue_token = result.continue_token

    def preload_image(self, image_id: str, image: str) -> SandboxImagePreloadStatus:
        image_id = _normalize_name(image_id)
        daemonset = self._image_preload_daemonset_manifest(image_id, image)
        try:
            self.apps_api.patch_namespaced_daemon_set(
                name=daemonset.metadata.name,
                namespace=self.settings.namespace,
                body=daemonset,
            )
        except ApiException as exc:
            if exc.status != 404:
                raise
            self.apps_api.create_namespaced_daemon_set(namespace=self.settings.namespace, body=daemonset)
        return self.get_image_preload_status(image_id)

    def get_image_preload_status(self, image_id: str) -> SandboxImagePreloadStatus:
        image_id = _normalize_name(image_id)
        name = self._image_preload_daemonset_name(image_id)
        try:
            daemonset = self.apps_api.read_namespaced_daemon_set(name=name, namespace=self.settings.namespace)
        except ApiException as exc:
            if exc.status == 404:
                return SandboxImagePreloadStatus(name=name, status="not_configured", message="镜像尚未预热到集群节点")
            raise

        status = daemonset.status or client.V1DaemonSetStatus()
        desired = int(status.desired_number_scheduled or 0)
        ready = int(status.number_ready or 0)
        if desired == 0:
            preload_status = "pending"
            message = "等待 Kubernetes 调度镜像预热任务"
        elif ready >= desired:
            preload_status = "ready"
            message = "镜像已预热到当前可调度节点"
        else:
            preload_status = "warming"
            message = f"镜像预热中：{ready}/{desired} 个节点就绪"
        return SandboxImagePreloadStatus(name=name, status=preload_status, desired=desired, ready=ready, message=message)

    def delete_image_preload(self, image_id: str) -> None:
        image_id = _normalize_name(image_id)
        try:
            self.apps_api.delete_namespaced_daemon_set(
                name=self._image_preload_daemonset_name(image_id),
                namespace=self.settings.namespace,
            )
        except ApiException as exc:
            if exc.status != 404:
                raise

    def _build_api_client(self) -> ApiClient:
        connection = self.settings.connection
        if connection.kubeconfig:
            config.load_kube_config(config_file=connection.kubeconfig, context=connection.context or None)
            return client.ApiClient()

        if connection.host:
            configuration = client.Configuration()
            configuration.host = connection.host
            configuration.verify_ssl = connection.verify_ssl
            if connection.ca_cert_file:
                configuration.ssl_ca_cert = connection.ca_cert_file
            if connection.token:
                configuration.api_key = {"authorization": f"Bearer {connection.token}"}
            return client.ApiClient(configuration)

        config.load_kube_config(context=connection.context or None)
        return client.ApiClient()

    def _create_if_missing(self, create_method, body) -> None:
        try:
            create_method(namespace=self.settings.namespace, body=body)
        except ApiException as exc:
            if exc.status != 409:
                raise

    def _pod_manifest(
        self,
        sandbox_id: str,
        image: str,
        env: dict[str, str],
        labels: dict[str, str],
        ttl_seconds: int,
    ) -> client.V1Pod:
        return client.V1Pod(
            metadata=client.V1ObjectMeta(
                name=self._pod_name(sandbox_id),
                namespace=self.settings.namespace,
                labels=self._labels(sandbox_id, labels),
                annotations=self._ttl_annotations(ttl_seconds),
            ),
            spec=client.V1PodSpec(
                restart_policy="Never",
                containers=[
                    client.V1Container(
                        name="aio-sandbox",
                        image=image,
                        image_pull_policy=self.settings.image_pull_policy,
                        ports=[client.V1ContainerPort(name="http", container_port=self.settings.port)],
                        env=[client.V1EnvVar(name=key, value=value) for key, value in sorted(env.items())],
                        resources=client.V1ResourceRequirements(
                            requests={"cpu": self.settings.cpu_request, "memory": self.settings.memory_request},
                            limits={"cpu": self.settings.cpu_limit, "memory": self.settings.memory_limit},
                        ),
                    )
                ],
            ),
        )

    def _service_manifest(self, sandbox_id: str) -> client.V1Service:
        return client.V1Service(
            metadata=client.V1ObjectMeta(
                name=self._service_name(sandbox_id),
                namespace=self.settings.namespace,
                labels=self._labels(sandbox_id, {}),
            ),
            spec=client.V1ServiceSpec(
                type=self.settings.service_type,
                selector={SANDBOX_ID_LABEL: sandbox_id},
                ports=[
                    client.V1ServicePort(
                        name="http",
                        port=self.settings.port,
                        target_port=self.settings.port,
                    )
                ],
            ),
        )

    def _image_preload_daemonset_manifest(self, image_id: str, image: str) -> client.V1DaemonSet:
        labels = {
            "app.kubernetes.io/name": "aio-sandbox-image-cache",
            "app.kubernetes.io/managed-by": MANAGED_BY_LABEL,
            "app.kubernetes.io/component": IMAGE_CACHE_COMPONENT_LABEL,
            SANDBOX_IMAGE_ID_LABEL: image_id,
        }
        return client.V1DaemonSet(
            metadata=client.V1ObjectMeta(
                name=self._image_preload_daemonset_name(image_id),
                namespace=self.settings.namespace,
                labels=labels,
            ),
            spec=client.V1DaemonSetSpec(
                selector=client.V1LabelSelector(match_labels=labels),
                template=client.V1PodTemplateSpec(
                    metadata=client.V1ObjectMeta(labels=labels),
                    spec=client.V1PodSpec(
                        tolerations=[client.V1Toleration(operator="Exists")],
                        containers=[
                            client.V1Container(
                                name="image-cache",
                                image=image,
                                image_pull_policy="IfNotPresent",
                                command=["/bin/sh", "-c", "trap : TERM INT; sleep infinity & wait"],
                                resources=client.V1ResourceRequirements(
                                    requests={"cpu": "10m", "memory": "32Mi"},
                                    limits={"cpu": "100m", "memory": "128Mi"},
                                ),
                            )
                        ],
                    ),
                ),
            ),
        )

    def _ingress_manifest(self, sandbox_id: str) -> client.V1Ingress:
        path = self._gateway_ingress_path(sandbox_id)
        path_type = "ImplementationSpecific" if self._is_path_gateway() else "Prefix"
        rule = client.V1IngressRuleValue(
            http=client.V1HTTPIngressRuleValue(
                paths=[
                    client.V1HTTPIngressPath(
                        path=path,
                        path_type=path_type,
                        backend=client.V1IngressBackend(
                            service=client.V1IngressServiceBackend(
                                name=self._service_name(sandbox_id),
                                port=client.V1ServiceBackendPort(number=self.settings.port),
                            )
                        ),
                    )
                ]
            )
        )
        ingress_rule = client.V1IngressRule(
            host=None if self._is_path_gateway() else self._gateway_host(sandbox_id),
            http=rule.http,
        )
        annotations: dict[str, str] = {}
        if self._is_path_gateway():
            annotations = {
                "nginx.ingress.kubernetes.io/use-regex": "true",
                "nginx.ingress.kubernetes.io/rewrite-target": "/$2",
            }
        return client.V1Ingress(
            metadata=client.V1ObjectMeta(
                name=self._ingress_name(sandbox_id),
                namespace=self.settings.namespace,
                labels=self._labels(sandbox_id, {}),
                annotations=annotations,
            ),
            spec=client.V1IngressSpec(
                ingress_class_name=self.settings.gateway.ingress_class_name,
                rules=[ingress_rule],
            ),
        )

    def _summary_from_pod(self, pod: client.V1Pod) -> SandboxSummary:
        metadata = pod.metadata or client.V1ObjectMeta()
        status = pod.status or client.V1PodStatus()
        spec = pod.spec or client.V1PodSpec(containers=[])
        labels = metadata.labels or {}
        annotations = metadata.annotations or {}
        sandbox_id = labels.get(SANDBOX_ID_LABEL, "")
        containers = spec.containers or []
        image = containers[0].image if containers else ""
        node_name = spec.node_name or ""
        expires_at = annotations.get(SANDBOX_EXPIRES_AT_ANNOTATION, "")
        ttl_seconds = _parse_optional_int(annotations.get(SANDBOX_TTL_SECONDS_ANNOTATION))
        return SandboxSummary(
            sandbox_id=sandbox_id,
            sandbox_url=self._sandbox_url(sandbox_id, node_name),
            status=getattr(status, "phase", "Unknown") or "Unknown",
            image_id=labels.get(SANDBOX_IMAGE_ID_LABEL, ""),
            image=image or "",
            pod_name=metadata.name or "",
            service_name=self._service_name(sandbox_id) if sandbox_id else "",
            ingress_name=self._ingress_name(sandbox_id) if sandbox_id and self.settings.gateway.enabled else "",
            namespace=metadata.namespace or self.settings.namespace,
            node_name=node_name,
            pod_ip=status.pod_ip or "",
            created_at=metadata.creation_timestamp.isoformat().replace("+00:00", "Z") if metadata.creation_timestamp else "",
            ttl_seconds=ttl_seconds,
            expires_at=expires_at,
            expired=_is_expired(expires_at),
            labels=labels,
        )

    def _sandbox_url(self, sandbox_id: str, node_name: str = "") -> str:
        if not sandbox_id:
            return ""
        if self.settings.gateway.enabled:
            # Gateway mode keeps the sandbox Service internal, usually as
            # ClusterIP, and exposes it through Ingress/Gateway. Host mode is
            # preferred for aio-sandbox UI because it preserves root-relative
            # paths such as /code-server and /static.
            if self._is_path_gateway():
                base_url = self.settings.gateway.base_url.rstrip("/")
                if not base_url:
                    raise ValueError("sandbox_pool.kubernetes_api.gateway.base_url is required for path gateway mode")
                return f"{base_url}{self._gateway_public_path(sandbox_id)}"
            host = self._gateway_host(sandbox_id)
            port = f":{self.settings.gateway.port}" if self.settings.gateway.port else ""
            return f"{self.settings.gateway.scheme}://{host}{port}"
        if self.settings.service_type.lower() == "nodeport":
            # NodePort is the default browser-friendly mode: expose each
            # sandbox on the Kubernetes node IP plus the allocated nodePort.
            node_port = self._node_port(sandbox_id)
            node_host = self.settings.node_host or self._node_host(node_name)
            if node_host and node_port:
                return f"http://{node_host}:{node_port}"
        # Plain ClusterIP returns the in-cluster Service DNS. Use this when the
        # caller runs inside Kubernetes, or enable gateway mode to expose it
        # outside the cluster through Ingress/Gateway.
        return self._service_dns_url(sandbox_id)

    def _service_dns_url(self, sandbox_id: str) -> str:
        return f"http://{self._service_name(sandbox_id)}.{self.settings.namespace}.svc.cluster.local:{self.settings.port}"

    def _node_port(self, sandbox_id: str) -> int | None:
        try:
            service = self.core_api.read_namespaced_service(name=self._service_name(sandbox_id), namespace=self.settings.namespace)
        except ApiException:
            return None
        ports = service.spec.ports if service.spec and service.spec.ports else []
        return ports[0].node_port if ports and ports[0].node_port is not None else None

    def _node_host(self, node_name: str) -> str:
        if not node_name:
            return ""
        try:
            node = self.core_api.read_node(name=node_name)
        except ApiException:
            return ""
        addresses = node.status.addresses if node.status and node.status.addresses else []
        for address_type in ("ExternalIP", "InternalIP", "Hostname"):
            for address in addresses:
                if address.type == address_type and address.address:
                    return address.address
        return ""

    def _gateway_host(self, sandbox_id: str) -> str:
        template = self.settings.gateway.host_template.strip()
        if not template:
            raise ValueError("sandbox_pool.kubernetes_api.gateway.host_template is required when host gateway mode is enabled")
        return template.format(sandbox_id=sandbox_id, namespace=self.settings.namespace)

    def _gateway_public_path(self, sandbox_id: str) -> str:
        template = self.settings.gateway.path_template.strip() or "/sandboxes/{sandbox_id}"
        path = template.format(sandbox_id=sandbox_id, namespace=self.settings.namespace)
        return path if path.startswith("/") else f"/{path}"

    def _gateway_ingress_path(self, sandbox_id: str) -> str:
        if self._is_path_gateway():
            return f"{self._gateway_public_path(sandbox_id)}(/|$)(.*)"
        return self.settings.gateway.path or "/"

    def _is_path_gateway(self) -> bool:
        return self.settings.gateway.route_mode.lower() == "path"

    def _labels(self, sandbox_id: str, labels: dict[str, str]) -> dict[str, str]:
        return {
            **self.settings.extra_labels,
            **labels,
            "app.kubernetes.io/name": "aio-sandbox",
            "app.kubernetes.io/managed-by": MANAGED_BY_LABEL,
            "app.kubernetes.io/component": SANDBOX_COMPONENT_LABEL,
            SANDBOX_ID_LABEL: sandbox_id,
        }

    def _ttl_annotations(self, ttl_seconds: int) -> dict[str, str]:
        if ttl_seconds <= 0:
            return {SANDBOX_TTL_SECONDS_ANNOTATION: "0"}
        expires_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        return {
            SANDBOX_TTL_SECONDS_ANNOTATION: str(ttl_seconds),
            SANDBOX_EXPIRES_AT_ANNOTATION: _format_timestamp(expires_at),
        }

    def _pod_name(self, sandbox_id: str) -> str:
        return f"aio-sandbox-{sandbox_id}"

    def _service_name(self, sandbox_id: str) -> str:
        return f"aio-sandbox-{sandbox_id}"

    def _ingress_name(self, sandbox_id: str) -> str:
        return f"aio-sandbox-{sandbox_id}"

    def _image_preload_daemonset_name(self, image_id: str) -> str:
        return f"aio-sandbox-image-cache-{image_id[:32]}".strip("-")

    def _connection_health(self) -> dict[str, Any]:
        connection = self.settings.connection
        return {
            "mode": "kubeconfig" if connection.kubeconfig else ("direct" if connection.host else "default"),
            "kubeconfig": connection.kubeconfig,
            "context": connection.context,
            "host": connection.host,
            "verifySsl": connection.verify_ssl,
        }

    def _gateway_health(self) -> dict[str, Any]:
        return {
            "enabled": self.settings.gateway.enabled,
            "routeMode": self.settings.gateway.route_mode,
            "ingressClassName": self.settings.gateway.ingress_class_name,
            "hostTemplate": self.settings.gateway.host_template,
            "baseUrl": self.settings.gateway.base_url,
            "scheme": self.settings.gateway.scheme,
            "port": self.settings.gateway.port,
        }


def _normalize_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower()).strip("-")
    if not normalized:
        raise ValueError("sandbox_id must contain at least one DNS-compatible character")
    return normalized[:63]


def _format_timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def _parse_optional_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _parse_int_setting(value: Any, default: int, *, min_value: int) -> int:
    if value is None or value == "":
        return max(min_value, default)
    try:
        return max(min_value, int(value))
    except (TypeError, ValueError):
        return max(min_value, default)


def _is_expired(expires_at: str) -> bool:
    expires_at_dt = _parse_timestamp(expires_at)
    return expires_at_dt is not None and expires_at_dt <= datetime.now(UTC)
