import { JsonRpcProvider } from 'near-api-js';
import {bridgeRequest} from './tool-bridge.mjs';
export class BridgeProvider extends JsonRpcProvider {
 constructor(url='https://test.rpc.fastnear.com'){super({url});this.bridgeUrl=url;}
 async sendJsonRpc(method,params){const value=await bridgeRequest(this.bridgeUrl,'POST',{jsonrpc:'2.0',id:'sealwork-next',method,params});return value.result;}
}
