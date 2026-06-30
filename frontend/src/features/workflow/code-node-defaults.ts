export const DEFAULT_CODE_SNIPPET = `# 在这里，您可以通过 'args'  获取节点中的输入变量，并通过 'ret' 输出结果
# 'args' 已经被正确地注入到环境中
# 下面是一个示例，首先获取节点的全部输入参数params，其次获取其中参数名为'input'的值：
# params = args.params;
# input = params['input'];
# 下面是一个示例，输出一个包含多种数据类型的 'ret' 对象：
# ret: Output =  { "name": '小明', "hobbies": ["看书", "旅游"] };

async def main(args: Args) -> Output:
    params = args.params
    # 构建输出对象
    ret: Output = {
        "key0": params['input'] + params['input'], # 拼接两次入参 input 的值
        "key1": ["hello", "world"],  # 输出一个数组
        "key2": { # 输出一个Object
            "key21": "hi",
        },
    }
    return ret`
