import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
test('browser bundle works without Node globals and uses injected fetch',async()=>{
  const result=await build({entryPoints:['src/client.ts'],bundle:true,platform:'browser',format:'iife',globalName:'ReadAPI',write:false});
  const code=result.outputFiles[0].text;
  assert(!code.includes('node:'));assert(!code.includes('process.env'));
  const context=vm.createContext({URL,Headers,Response,AbortSignal,setTimeout,clearTimeout});
  vm.runInContext(code,context);
  const client=context.ReadAPI.createReadClient({baseUrl:'https://example.test',fetch:async(_url,init)=>{
    assert.equal(init.method,'GET');return Response.json({entries:[]});
  }});
  const response=await client.watchlist.list();assert.equal(response.entries.length,0);
});
