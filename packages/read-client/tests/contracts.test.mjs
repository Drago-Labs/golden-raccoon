import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createReadClient, CompatibilityError, ReadClientError } from '../dist/client.js';
const fixture = name => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const wallet = fixture('portfolio').walletAddress;
const id = fixture('snapshot').snapshot.id;
const rows = [
  ['health', '/api/health', c => c.health.get()],
  ['portfolio', '/api/portfolio', c => c.portfolio.get({walletAddress:wallet,chain:'stellar-testnet'})],
  ['history', '/api/history/transactions', c => c.history.transactions({walletAddress:wallet,cursor:'Opaque+/Cursor=',limit:1})],
  ['watchlist', '/api/watchlist', c => c.watchlist.list({walletAddress:wallet})],
  ['alerts', '/api/alerts', c => c.alerts.list({walletAddress:wallet})],
  ['registry', '/api/stellar/registry/history', c => c.registry.history({network:'stellar-testnet'})],
  ['snapshot', `/api/snapshots/${id}`, c => c.snapshots.get(id)],
];
for (const [name,path,run] of rows) {
  test(`${name}: runtime contract, exact identity and GET transport`, async () => {
    const expected=fixture(name);
    const client=createReadClient({baseUrl:'https://example.test/prefix',fetch:async (url, init)=>{
      assert.equal(url.pathname,'/prefix'+path);assert.equal(init.method,'GET');assert.equal(init.body,undefined);
      assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
      if(name==='history')assert.equal(url.searchParams.get('cursor'),'Opaque+/Cursor=');
      if(url.searchParams.has('walletAddress'))assert.equal(url.searchParams.get('walletAddress'),wallet);
      return Response.json(expected);
    }});
    assert.deepEqual(await run(client),expected);
  });
  test(`${name}: incompatible shape and authentication errors`, async () => {
    const client=createReadClient({baseUrl:'https://example.test',fetch:async()=>Response.json({unexpected:true})});
    await assert.rejects(run(client),CompatibilityError);
    let attempts=0;
    const denied=createReadClient({baseUrl:'https://example.test',retries:3,fetch:async()=>{
      attempts++;return Response.json({code:'wallet_session_required',message:'Private detail',retryable:false,requestId:'req1'}, {status:401});
    }});
    await assert.rejects(run(denied),e=>e instanceof ReadClientError&&e.status===401&&e.code==='wallet_session_required'&&e.requestId==='req1');
    assert.equal(attempts,1);
  });
}
test('empty collection shapes remain endpoint-specific', async()=>{
  const values=[{items:[],total:0},{entries:[]},{alerts:[]},{ok:true,count:0,records:[]},{ok:true,record:null}];
  const c=createReadClient({baseUrl:'https://example.test',fetch:async()=>Response.json(values.shift())});
  assert.deepEqual(await c.history.transactions(),{items:[],total:0});
  assert.deepEqual(await c.watchlist.list(),{entries:[]});
  assert.deepEqual(await c.alerts.list({walletAddress:wallet}),{alerts:[]});
  assert.deepEqual(await c.registry.history(),{ok:true,count:0,records:[]});
  assert.deepEqual(await c.registry.find({network:'stellar-mainnet',txHash:'a'.repeat(64)}),{ok:true,record:null});
});
test('registry lookup/status variants and nested malformed records',async()=>{
  const publication=fixture('registry').records[0];
  const values=[{ok:true,record:publication},{network:'stellar-testnet',hash:'a'.repeat(64),status:'NOT_FOUND',providerMeta:{provider:'fixture'}},{ok:true,record:{...publication,score:'70'}}];
  const c=createReadClient({baseUrl:'https://example.test',fetch:async()=>Response.json(values.shift())});
  assert.equal((await c.registry.find({network:'stellar-testnet',txHash:publication.txHash})).record.assetKey,publication.assetKey);
  assert.equal((await c.registry.status({network:'stellar-testnet',hash:publication.txHash})).status,'NOT_FOUND');
  await assert.rejects(c.registry.find({network:'stellar-testnet',txHash:publication.txHash}),CompatibilityError);
});
test('amounts, sequence strings and partial/unavailable fields survive unchanged',async()=>{
  const values=[fixture('portfolio'),fixture('history')];
  const c=createReadClient({baseUrl:'https://example.test',fetch:async()=>Response.json(values.shift())});
  const p=await c.portfolio.get({walletAddress:wallet});
  assert.equal(p.recentActivity[0].amount,'922337203685.4775807');assert.equal(p.valuationStatus,'unavailable');
  assert.equal(p.holdings[0].priceUsd,null);
  assert.equal((await c.history.transactions()).items[0].stellarDetails.sequence,'9223372036854775806');
});
test('nested contract violations fail; unknown additive fields are retained',async()=>{
  const p=fixture('portfolio');p.holdings[0].balance='1';
  const s=fixture('snapshot');s.snapshot.document.schemaVersion='2';
  const values=[p,s,{...fixture('health'),newField:{future:true}}];
  const c=createReadClient({baseUrl:'https://example.test',fetch:async()=>Response.json(values.shift())});
  await assert.rejects(c.portfolio.get({walletAddress:wallet}),CompatibilityError);
  await assert.rejects(c.snapshots.get(id),CompatibilityError);
  assert.deepEqual((await c.health.get()).newField,{future:true});
});
