import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import { fixture, eventually } from './fixture.ts';
import { basicTools } from '../runtime/tools/basic.ts';
import { createPartner } from '../runtime/partner.ts';

test('patch validates before writes and supports add, contextual update, move, delete, and Rust CRLF behavior', async () => {
 const f=await fixture();const basic=await basicTools(join(f.directory,'workspace'));
 const context={signal:new AbortController().signal} as never;
 const patch=(value:string)=>basic.tools.apply_patch.handler(`*** Begin Patch\n${value}\n*** End Patch`,context);
 const file=(name:string)=>join(f.directory,'workspace',name);
 try {
  await patch('*** Add File: note.txt\n+first\n+second');
  await patch('*** Update File: note.txt\n@@\n first\n-second\n+changed');
  assert.equal(await readFile(file('note.txt'),'utf8'),'first\nchanged\n');
  await assert.rejects(Promise.resolve(patch('*** Add File: untouched.txt\n+hello\n*** Update File: note.txt\n@@\n-missing\n+oops')),/expected lines/);
  await assert.rejects(readFile(file('untouched.txt')),/ENOENT/);
  await patch('*** Update File: note.txt\n*** Move to: moved.txt\n@@\n-changed\n+moved');
  await assert.rejects(readFile(file('note.txt')),/ENOENT/);
  assert.equal(await readFile(file('moved.txt'),'utf8'),'first\nmoved\n');
  await patch('*** Update File: moved.txt\n*** Move to: final.txt\n@@\n first\n moved');
  assert.equal(await readFile(file('final.txt'),'utf8'),'first\nmoved\n');
  await patch('*** Delete File: final.txt');await assert.rejects(readFile(file('final.txt')),/ENOENT/);
  await writeFile(file('crlf.txt'),'one\r\ntwo\r\n');
  await patch('*** Update File: crlf.txt\n@@\n-two\n+three');
  assert.equal(await readFile(file('crlf.txt'),'utf8'),'one\r\nthree\n');
  await assert.rejects(Promise.resolve(patch('*** Add File: ../escaped.txt\n+no')),/escape its root/);
  await symlink(join(f.directory,'persona.md'),file('link.txt'));
  await assert.rejects(Promise.resolve(patch('*** Update File: link.txt\n@@\n-no\n+yes')),/symbolic link/);
 } finally {await basic.close();await f.close();}
});

test('real SDK code mode calls raw apply_patch and reads the edited file', async()=>{
 const f=await fixture();const partner=await createPartner(f.config,f.credentials);
 try {
  f.useTools([{name:'apply_patch',args:'*** Begin Patch\n*** Add File: patch-probe.txt\n+from code mode\n*** End Patch'},
   {name:'read_file',args:{path:'patch-probe.txt'}}]);
  await partner.submit(randomUUID(),'exercise raw patch');
  await eventually(async()=>(await partner.snapshot()).messages[0]?.answer!==null);
  assert.equal(await readFile(join(f.directory,'workspace/patch-probe.txt'),'utf8'),'from code mode\n');
  assert.match(JSON.stringify(f.requests),/apply_patch/);
 }finally{await partner.close();await f.close();}
});

test('standard path-based view_image emits an image through nested code mode',async()=>{
 const f=await fixture();const partner=await createPartner(f.config,f.credentials);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9F0AAAAASUVORK5CYII=';
 try{
  await writeFile(join(f.directory,'workspace/probe.png'),Buffer.from(png,'base64'));
  f.useTools([{name:'exec',args:'const picture = await tools.view_image({path:"probe.png"}); image(picture.image_url);'}]);
  await partner.submit(randomUUID(),'look at local image');
  await eventually(async()=>(await partner.snapshot()).messages[0]?.answer!==null);
  assert.match(JSON.stringify(f.requests.at(-1)),/input_image/);
  assert(JSON.stringify(f.requests.at(-1)).includes(png));
 }finally{await partner.close();await f.close();}
});
