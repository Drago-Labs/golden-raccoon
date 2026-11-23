import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/server/security/rateLimit';
import { evaluateCapability } from '@/server/security/authz';
import { resolveWalletSession } from '@/server/security/walletSession';
import { ALLOCATION_LIMITS, AllocationDriftError, inspectAllocationDrift } from '@/server/research/allocation-drift';

export const dynamic='force-dynamic';
const headers={'cache-control':'no-store'};

/** Reads the body without buffering more than the documented request limit. */
async function boundedBody(request:Request):Promise<Uint8Array|null> {
  const reader=request.body?.getReader();
  if(!reader) return null;
  const chunks:Uint8Array[]=[];let length=0;
  for(;;) {
    const {done,value}=await reader.read();if(done) break;
    length+=value.byteLength;
    if(length>ALLOCATION_LIMITS.maxRequestBytes) {await reader.cancel();return null;}
    chunks.push(value);
  }
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

function field(input:unknown,name:'walletAddress'|'network'):string|undefined {
  if(!input||typeof input!=='object'||Array.isArray(input)) return undefined;
  const value=(input as Record<string,unknown>)[name];
  return typeof value==='string'?value:undefined;
}

export async function POST(request:NextRequest) {
  const limited=checkRateLimit(request,{namespace:'allocation-drift',limit:12,windowMs:60_000});
  if(limited) return limited;
  const bytes=await boundedBody(request);
  if(!bytes) return NextResponse.json({error:'payload_too_large',message:`Allocation requests are limited to ${ALLOCATION_LIMITS.maxRequestBytes} bytes.`},{status:413,headers});
  let input:unknown;
  try {input=JSON.parse(new TextDecoder().decode(bytes));}
  catch {return NextResponse.json({error:'invalid_json',message:'The request body is not JSON.'},{status:400,headers});}

  // The session cookie, not the request body, decides whose portfolio is read.
  const session=resolveWalletSession(request,{suppliedWallet:field(input,'walletAddress')});
  if(session.response) return session.response;
  const walletAddress=session.wallet!,network=field(input,'network');
  const authz=evaluateCapability(
    {kind:'wallet',walletAddress,walletHash:'allocation-drift',chainFamily:network?.startsWith('stellar')?'stellar':'evm',network},
    'portfolio:read',
    {walletAddress,network},
  );
  if(!authz.allowed) return NextResponse.json({error:'auth_error',reason:authz.reason},{status:403,headers});

  try {
    const result=await inspectAllocationDrift(input&&typeof input==='object'&&!Array.isArray(input)?{...input,walletAddress}:input);
    return NextResponse.json(result,{status:result.state==='unavailable'?503:200,headers});
  } catch(error) {
    if(error instanceof AllocationDriftError) return NextResponse.json({error:error.code,message:error.message},{status:400,headers});
    return NextResponse.json({error:'analysis_failed',message:'Allocation evidence could not be read.'},{status:500,headers});
  }
}
