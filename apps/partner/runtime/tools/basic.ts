import { applyPatch } from 'nanocodex/node';
import { viewImage, updatePlan } from 'nanocodex/tools';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, tools as workspaceTools } from 'nanocodex/node/workspace';
import { createNodeProcessTools } from 'nanocodex-tools/node';
import { resolve } from 'node:path';
import type { ToolMap } from 'nanocodex/node';
import { z } from 'zod';

const run = promisify(execFile);
export function skillTools(cwd: string, executable = 'skill'): ToolMap {
  const shapes = {
    skill_list: z.object({}).strict(),
    skill_find: z.object({ query: z.string().trim().min(1).max(2000), limit: z.number().int().min(1).max(32).default(8) }).strict(),
    skill_get: z.object({ name: z.string().min(1).max(300) }).strict(),
  };
  return Object.fromEntries(Object.entries(shapes).map(([name, schema]) => [name, {
    description: name === 'skill_get' ? 'Read a skill by its exact frontmatter name. Follow applicable instructions, reusing them while still in context.' : name === 'skill_find' ? 'Find relevant skills by natural-language query. Read a matching skill before applying it.' : 'List available skill metadata. Discovery uses the Partner workspace and host user skill directories.',
    parameters: z.toJSONSchema(schema),
    async handler(input: unknown, context: { signal: AbortSignal }) {
      const args = schema.parse(input);
      const argv = 'query' in args ? ['find', '--json', '--limit', String(args.limit), '--', args.query] : 'name' in args ? ['get', '--', args.name] : ['list', '--json'];
      const { stdout } = await run(executable, argv, { cwd, signal: context.signal, timeout: 10000, maxBuffer: 1024 * 1024 });
      return name === 'skill_get' ? stdout : JSON.parse(stdout);
    },
  }]));
}

export async function basicTools(path: string) {
  const directory = resolve(path);
  const filesystem = await open({ path: directory, root: directory });
  const patch = applyPatch({ workspace: filesystem });
  const processes = await createNodeProcessTools({ workspace: directory });
  return { close: processes.close, workspace: filesystem,
    instructions: `The host tool working directory is ${JSON.stringify(directory)}. File tools use this real directory, with relative paths resolved inside it. exec_command launches native host commands, with this directory as the default cwd. It supports pipe sessions through write_stdin, not PTYs. This is a trusted local host, not an OS sandbox. Skill discovery uses this same directory.`,
    tools: { ...workspaceTools(filesystem), apply_patch: patch, view_image: viewImage({ workspace: filesystem }), update_plan: updatePlan(), ...Object.fromEntries(processes.tools.map(tool => [tool.name, tool])), ...skillTools(directory) } };
}
