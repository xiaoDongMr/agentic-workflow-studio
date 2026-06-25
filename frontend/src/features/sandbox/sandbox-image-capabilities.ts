export type SandboxImageSource = 'builtin' | 'custom'

export interface SandboxImageCapability {
  id: string
  name: string
  image: string
  digest: string
  source: SandboxImageSource
  default: boolean
  description: string
  pythonVersion: string
  tools: string[]
  runtimes: string[]
  capabilities: string[]
  limits: string[]
  preloadStatus: string
  preloadReady: number
  preloadDesired: number
  preloadMessage: string
}

export const sandboxImageCapabilities: SandboxImageCapability[] = [
  {
    id: 'aio-sandbox-default',
    name: 'AioSandbox 默认镜像',
    image: 'enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest',
    digest: '由后端资源池配置提供',
    source: 'builtin',
    default: true,
    description: '平台默认 all-in-one 沙箱镜像，面向工作流编码节点、AI 工具调用、浏览器自动化和远程调试。',
    pythonVersion: 'Python 版本待运行时探测',
    tools: ['Shell/Bash', '文件读写', '浏览器/VNC', 'VSCode Server', 'WebSocket Terminal', 'MCP Hub'],
    runtimes: ['Python', 'JavaScript/Node.js', 'Jupyter Notebook', 'Code API', 'Browser CDP', '代理预览'],
    capabilities: ['统一文件系统', '命令执行', '代码执行', '浏览器自动化', '端口代理预览', '人类接管调试'],
    limits: ['Python 包清单需从运行中沙箱探测', '额外依赖需通过自定义镜像提供', '终端内手动安装仅对当前沙箱临时生效', '正式运行会固定镜像 digest'],
    preloadStatus: 'builtin',
    preloadReady: 0,
    preloadDesired: 0,
    preloadMessage: '默认镜像由资源池配置提供，通常已在集群节点缓存',
  },
]
