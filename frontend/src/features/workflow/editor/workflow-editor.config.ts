import {
  Bot,
  BrainCircuit,
  Braces,
  Cable,
  CheckCircle2,
  ChevronDown,
  Circle,
  Database,
  DatabaseZap,
  FileCode2,
  Flag,
  Globe,
  GitBranch,
  LibraryBig,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Waypoints,
  Workflow,
  Wrench,
} from 'lucide-react'
import type { WorkflowNodeRegistry } from '@flowgram.ai/free-layout-editor'

import type { WorkflowNode } from '@/types/workflow'

export const CANVAS_OFFSET_X = 420
export const CANVAS_OFFSET_Y = 90
export const NODE_GAP_X = 264
export const NODE_GAP_Y = 142

export const paletteToNodeType: Record<string, WorkflowNode['type']> = {
  ai: 'intent',
  knowledge: 'knowledge',
  skill: 'skill',
  condition: 'condition',
  http: 'http',
  custom: 'response',
}

export const bottomLibrarySections = [
  {
    title: '基础能力',
    items: [
      { title: '大模型', icon: Bot, nodeKey: 'ai' as const },
      { title: '插件', icon: Wrench, nodeKey: 'skill' as const },
      { title: '工作流', icon: Workflow, nodeKey: 'custom' as const },
    ],
  },
  {
    title: '业务逻辑',
    items: [
      { title: '代码', icon: FileCode2, nodeKey: 'custom' as const },
      { title: '意图识别', icon: BrainCircuit, nodeKey: 'ai' as const },
      { title: '批处理', icon: Settings2, nodeKey: 'condition' as const },
      { title: '异步任务', icon: Cable, nodeKey: 'skill' as const },
      { title: '选择器', icon: GitBranch, nodeKey: 'condition' as const },
      { title: '循环', icon: Waypoints, nodeKey: 'condition' as const },
      { title: '变量聚合', icon: Braces, nodeKey: 'http' as const },
    ],
  },
  {
    title: '输入&输出',
    items: [
      { title: '输入', icon: Plus, nodeKey: 'custom' as const },
      { title: '输出', icon: ChevronDown, nodeKey: 'custom' as const },
    ],
  },
  {
    title: '数据库',
    items: [
      { title: 'SQL 自定义', icon: Database, nodeKey: 'http' as const },
      { title: '新增数据', icon: DatabaseZap, nodeKey: 'http' as const },
      { title: '更新数据', icon: DatabaseZap, nodeKey: 'http' as const },
      { title: '查询数据', icon: Search, nodeKey: 'http' as const },
      { title: '删除数据', icon: DatabaseZap, nodeKey: 'http' as const },
    ],
  },
  {
    title: '知识库&数据',
    items: [
      { title: '知识库写入', icon: LibraryBig, nodeKey: 'knowledge' as const },
      { title: '知识库检索', icon: LibraryBig, nodeKey: 'knowledge' as const },
    ],
  },
] as const

export const nodeIcons = {
  start: Flag,
  intent: Sparkles,
  knowledge: Database,
  skill: Wrench,
  http: Globe,
  condition: CheckCircle2,
  response: Circle,
} as const

export const nodeThemeClass = {
  start: 'aw-flow-node--start',
  intent: 'aw-flow-node--intent',
  knowledge: 'aw-flow-node--knowledge',
  skill: 'aw-flow-node--skill',
  http: 'aw-flow-node--http',
  condition: 'aw-flow-node--condition',
  response: 'aw-flow-node--response',
} as const

export const defaultRegistries: WorkflowNodeRegistry[] = [
  {
    type: 'start',
    meta: {
      isStart: true,
      deleteDisable: true,
      copyDisable: true,
      size: { width: 228, height: 132 },
      defaultPorts: [{ type: 'output' }],
    },
  },
  {
    type: 'intent',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'knowledge',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'skill',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'http',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'response',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }],
    },
  },
  {
    type: 'condition',
    meta: {
      size: { width: 228, height: 132 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
]

export const defaultNodeContent: Record<WorkflowNode['type'], Omit<WorkflowNode, 'id' | 'position' | 'type'>> = {
  start: {
    title: '开始节点',
    description: '接收用户输入并启动流程。',
    status: 'success',
    inputs: [{ name: 'userInput', type: 'string', description: '用户输入的问题文本' }],
    outputs: [{ name: 'query', type: 'string', description: '标准化后的查询文本' }],
    config: {
      prompt: '提取用户问题中的关键信息。',
      model: 'GPT-4o',
      temperature: 0.2,
      maxTokens: 500,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'text',
      outputKey: 'query',
      inputMappings: [{ field: 'userInput', sourceType: 'context', source: 'message.content' }],
    },
  },
  intent: {
    title: '意图识别',
    description: '识别当前问题属于咨询、投诉或订单查询。',
    status: 'active',
    inputs: [{ name: 'query', type: 'string', description: '用户问题文本' }],
    outputs: [{ name: 'intent', type: 'string', description: '识别后的业务意图' }],
    config: {
      prompt: '对用户问题进行意图分类。',
      model: 'GPT-4o',
      temperature: 0.3,
      maxTokens: 800,
      enabled: true,
      fallbackToHuman: true,
      responseMode: 'json',
      outputKey: 'intent',
      inputMappings: [{ field: 'query', sourceType: 'node', source: 'start.query' }],
    },
  },
  knowledge: {
    title: '查询知识库',
    description: '根据意图与问题语义检索知识库内容。',
    status: 'idle',
    inputs: [{ name: 'intent', type: 'string', description: '已识别的业务意图' }],
    outputs: [{ name: 'knowledge', type: 'array', description: '命中的知识库文档片段' }],
    config: {
      prompt: '根据意图召回最相关的知识库内容。',
      model: 'Embedding + Rerank',
      temperature: 0.2,
      maxTokens: 1200,
      enabled: true,
      fallbackToHuman: true,
      responseMode: 'json',
      outputKey: 'knowledge_hits',
      inputMappings: [{ field: 'intent', sourceType: 'node', source: 'intent.intent' }],
    },
  },
  skill: {
    title: '调用技能',
    description: '当命中订单场景时调用对应业务技能。',
    status: 'idle',
    inputs: [{ name: 'orderId', type: 'string', description: '订单编号' }],
    outputs: [{ name: 'orderInfo', type: 'json', description: '订单详情结果' }],
    config: {
      prompt: '根据用户上下文调用业务技能。',
      model: 'Function Calling',
      temperature: 0.1,
      maxTokens: 600,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'order_info',
      inputMappings: [
        { field: 'user_id', sourceType: 'context', source: 'session.userId' },
        { field: 'order_id', sourceType: 'literal', source: '{{order_id}}' },
      ],
    },
  },
  http: {
    title: 'HTTP 请求',
    description: '请求外部服务或业务 API 获取补充信息。',
    status: 'idle',
    inputs: [{ name: 'requestBody', type: 'json', description: '请求体参数' }],
    outputs: [{ name: 'responseBody', type: 'json', description: 'HTTP 返回结果' }],
    config: {
      prompt: '将上下文映射为 API 请求参数。',
      model: 'HTTP Bridge',
      temperature: 0.1,
      maxTokens: 600,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'response_body',
      inputMappings: [{ field: 'payload', sourceType: 'node', source: 'intent.intent' }],
    },
  },
  condition: {
    title: '条件分支',
    description: '根据意图或命中结果选择后续执行路径。',
    status: 'idle',
    inputs: [{ name: 'intent', type: 'string', description: '待判断的意图值' }],
    outputs: [{ name: 'branch', type: 'string', description: '命中的分支名称' }],
    config: {
      prompt: '根据输入条件决定后续分支。',
      model: 'Rule Engine',
      temperature: 0,
      maxTokens: 300,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'branch',
      inputMappings: [{ field: 'intent', sourceType: 'node', source: 'intent.intent' }],
    },
  },
  response: {
    title: '结束节点',
    description: '整合节点结果并输出最终回复。',
    status: 'idle',
    inputs: [{ name: 'reply', type: 'string', description: '待输出的回复内容' }],
    outputs: [{ name: 'finalReply', type: 'string', description: '最终返回给用户的文本' }],
    config: {
      prompt: '结合上下文生成最终回复。',
      model: 'GPT-4o',
      temperature: 0.6,
      maxTokens: 1200,
      enabled: true,
      fallbackToHuman: true,
      responseMode: 'text',
      outputKey: 'final_reply',
      inputMappings: [{ field: 'reply', sourceType: 'node', source: 'strategy.reply' }],
    },
  },
}
