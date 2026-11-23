import { promises as fs } from 'node:fs';
import { operationHttp } from './operations/httpClient.js';

async function main() {
  const args = process.argv.slice(2);
  const option = args.indexOf('--url');
  if (option >= 0) {
    if (!args[option + 1]) throw new Error('--url 需要本机地址');
    process.env.SHALE_URL = args[option + 1];
    delete process.env.SHALE_ENDPOINT_FILE;
    args.splice(option, 2);
  }
  const name = args[0] ?? 'list';
  if (['--help', '-h', 'help'].includes(name)) {
    console.log('shale [--url http://127.0.0.1:8787] list | <shale_tool_name> [arguments.json]\nSet SHALE_ENDPOINT_FILE for a desktop instance. Mutations are proposals only.');
    return;
  }
  const result = name === 'list' ? await operationHttp('tools') : await operationHttp('call', {
    name, arguments: args[1] ? JSON.parse(await fs.readFile(args[1], 'utf8')) : {},
  });
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
