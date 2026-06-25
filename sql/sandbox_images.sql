CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sandbox_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  image VARCHAR(512) NOT NULL,
  digest VARCHAR(256) NOT NULL DEFAULT '',
  source VARCHAR(32) NOT NULL DEFAULT 'custom',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  description TEXT NOT NULL DEFAULT '',
  python_version VARCHAR(64) NOT NULL DEFAULT '',
  capability_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_sandbox_images_image UNIQUE (image)
);

CREATE INDEX IF NOT EXISTS idx_sandbox_images_source_status
  ON sandbox_images (source, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_images_name
  ON sandbox_images (name);

INSERT INTO sandbox_images (
  id,
  name,
  image,
  digest,
  source,
  status,
  description,
  python_version,
  capability_manifest,
  is_default
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'AioSandbox 默认镜像',
  'enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest',
  '由后端资源池配置提供',
  'builtin',
  'active',
  '平台默认 all-in-one 沙箱镜像，面向工作流编码节点、AI 工具调用、浏览器自动化和远程调试。',
  'Python 版本待运行时探测',
  '{
    "tools": ["Shell/Bash", "文件读写", "浏览器/VNC", "VSCode Server", "WebSocket Terminal", "MCP Hub"],
    "runtimes": ["Python", "JavaScript/Node.js", "Jupyter Notebook", "Code API", "Browser CDP", "代理预览"],
    "capabilities": ["统一文件系统", "命令执行", "代码执行", "浏览器自动化", "端口代理预览", "人类接管调试"],
    "limits": ["Python 包清单需从运行中沙箱探测", "额外依赖需通过自定义镜像提供", "正式运行建议固定镜像 digest"]
  }'::jsonb,
  true
)
ON CONFLICT (image) DO UPDATE SET
  name = EXCLUDED.name,
  digest = EXCLUDED.digest,
  source = EXCLUDED.source,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  python_version = EXCLUDED.python_version,
  capability_manifest = EXCLUDED.capability_manifest,
  is_default = EXCLUDED.is_default,
  updated_at = now(),
  deleted_at = NULL;
