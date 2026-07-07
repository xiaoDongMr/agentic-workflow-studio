# 沙箱编码持久化实现 TODO

## 目标

- 沙箱仍作为临时编辑和调试环境，试运行始终运行当前沙箱里的代码。
- 保存 workflow 时默认同步沙箱编码工作区，但只有内容变更时才生成新的持久化 package。
- 编码工作区按节点目录持久化，而不是只保存 `main.py` 或 `browser_main.py`。
- 沙箱过期、替换或重新绑定后，可以从最新 package 恢复整个节点工作区。
- 初始模板代码不单独生成版本；只有用户保存 workflow 或手动保存工作区且内容变化时才生成 package。

## 设计约定

- 工作区目录：
  - Python：`/home/gem/workflows/{workflowId}/nodes/{nodeId}/main.py`
  - Browser：`/home/gem/workflows/{workflowId}/nodes/{nodeId}/browser_main.py`
  - 用户可在该节点目录下创建任意子文件和子目录。
- 持久化单位：节点工作区目录 zip package。
- 变更判断：扫描工作区文件 manifest，计算稳定 `workspace_hash`；hash 未变化时不打包、不上传、不生成版本。
- 试运行：不依赖 package，直接执行当前沙箱工作区内容。
- 保存 workflow：默认同步所有有变更的沙箱文件模式编码节点，不弹窗。
- 恢复：从最新 package 解压到当前绑定沙箱的对应节点目录。

## 实现 TODO

- [x] 数据模型 done
  - [x] 新增 `workflow_node_code_workspaces` 当前工作区状态表。done
  - [x] 新增 `workflow_node_code_packages` 工作区 package 历史表。done
  - [x] SQL schema 增加对应建表语句和索引。done
  - [x] 修复 `workflow_version_id` 兼容性：手动保存默认关联当前 draft version，并允许字段为空。done
  - [x] 修复 `latest_package_id` 兼容性：新建 workspace 允许暂未绑定 package。done

- [x] 后端服务 done
  - [x] 新增工作区扫描 manifest 和 `workspace_hash` 计算逻辑。done
  - [x] 新增沙箱工作区 zip 打包逻辑，并排除缓存、依赖、临时产物。done
  - [x] 新增 package 本地 storage 写入逻辑，复用 `object_storage.local_dir`。done
  - [x] 新增保存工作区服务：hash 无变化跳过；hash 变化生成 package 并更新 latest。done
  - [x] 新增恢复工作区服务：读取最新 package 并写回当前绑定沙箱目录。done
  - [x] 保存 workflow 草稿时默认同步有变更的代码工作区。done

- [x] 后端接口 done
  - [x] 保存 workflow 返回代码工作区同步摘要。done
  - [x] 新增手动保存当前节点工作区接口。done
  - [x] 新增恢复当前节点工作区到沙箱接口。done
  - [x] 新增查询当前节点工作区状态接口。done

- [x] 前端接口与类型 done
  - [x] 增加代码工作区 package/status API 类型。done
  - [x] 保存 workflow 后展示代码工作区同步摘要。done
  - [x] 编码节点配置区展示工作区保存状态。done
  - [x] 编码节点配置区增加“保存工作区”和“恢复到沙箱”操作。done

- [x] 验证 done
  - [x] 后端相关文件 `py_compile` 通过。done
  - [x] `git diff --check` 通过。done
  - [ ] 前端构建验证；当前环境缺少 `node/npm`，暂未完成。

## 后续增强

- [x] 代码 package 历史版本 Drawer。done
- [x] 历史版本恢复到沙箱。done
- [ ] 将 package storage 从 local 扩展到对象存储 provider。
