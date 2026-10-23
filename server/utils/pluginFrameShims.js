// What every plugin page is served with so it keeps working in its sandbox
// (mrramam/HomeGlow#50).
//
// Plugin frames have an opaque origin (no allow-same-origin), so a plugin can
// no longer reach the dashboard's storage, DOM or API as if it were HomeGlow.
// Two things plugins relied on need a stand-in there:
//
// - **Calling HomeGlow.** Every request from the frame arrives with
//   `Origin: null`, and the server lets it through only with this page's
//   token (utils/pluginRequestPolicy.js). The script adds the token, as
//   X-HomeGlow-Plugin-Token, to fetch and XMLHttpRequest calls to this host,
//   and to nothing else, so no other site ever sees it. Plugins, and the
//   SDK, call the API exactly as before.
// - **localStorage.** It throws SecurityError in an opaque origin. The script
//   puts a Storage-like object in its place, this plugin's own: it starts from
//   the map the dashboard hands the frame in its `name` (the plugin's saved
//   keys on this display) and posts each change back as
//   `homeglow:local-storage`, for the dashboard to keep
//   (client/src/utils/pluginLocalStore.js). 512 KB at most, as the dashboard
//   enforces too. sessionStorage gets the same object, in memory only.
//
// A page opened on its own (not framed) is left alone. Plain ES5 in an IIFE,
// inlined into <head> before any plugin script; no globals left behind.

const PLUGIN_LOCAL_STORAGE_MAX_CHARS = 512 * 1024;

/** The script, for a page served with `token`. */
function pluginFrameShimScript(token) {
  return `(function(){
if(window.parent===window)return;
var TOKEN=${JSON.stringify(String(token))},HEADER="X-HomeGlow-Plugin-Token",MAX=${PLUGIN_LOCAL_STORAGE_MAX_CHARS};
var host;try{host=new URL(location.href).host;}catch(x){host="";}
function same(u){try{return !!host&&new URL(String(u),location.href).host===host;}catch(x){return false;}}
var nativeFetch=window.fetch;
if(typeof nativeFetch==="function"){window.fetch=function(input,init){
var url=typeof input==="string"||input instanceof URL?String(input):(input&&input.url);
if(!same(url))return nativeFetch.apply(window,arguments);
if(typeof Request==="function"&&input instanceof Request){var req=new Request(input,init);req.headers.set(HEADER,TOKEN);return nativeFetch.call(window,req);}
var opts={};if(init){for(var k in init){opts[k]=init[k];}}var h=new Headers(opts.headers||{});h.set(HEADER,TOKEN);opts.headers=h;
return nativeFetch.call(window,input,opts);};}
if(window.XMLHttpRequest){var X=XMLHttpRequest.prototype,open=X.open,send=X.send;
X.open=function(m,u){this.__hgSame=same(u);return open.apply(this,arguments);};
X.send=function(){if(this.__hgSame){try{this.setRequestHeader(HEADER,TOKEN);}catch(x){}}return send.apply(this,arguments);};}
function quota(){try{return new DOMException("The plugin's storage is full.","QuotaExceededError");}catch(x){var e=new Error("The plugin's storage is full.");e.name="QuotaExceededError";return e;}}
function storage(initial,persist){
var data=Object.create(null);
for(var k in initial){if(Object.prototype.hasOwnProperty.call(initial,k)&&typeof initial[k]==="string")data[k]=initial[k];}
function size(){var n=0;for(var k in data)n+=k.length+data[k].length;return n;}
var api={
getItem:function(k){k=String(k);return k in data?data[k]:null;},
setItem:function(k,v){k=String(k);v=String(v);var before=k in data?k.length+data[k].length:0;
if(size()-before+k.length+v.length>MAX)throw quota();data[k]=v;if(persist)persist({op:"set",key:k,value:v});},
removeItem:function(k){k=String(k);if(k in data){delete data[k];if(persist)persist({op:"remove",key:k});}},
clear:function(){data=Object.create(null);if(persist)persist({op:"clear"});},
key:function(i){var ks=Object.keys(data);return i>=0&&i<ks.length?ks[i]:null;}};
return new Proxy(api,{
get:function(t,p){if(p==="length")return Object.keys(data).length;if(typeof p==="symbol"||p in api)return t[p];return p in data?data[p]:undefined;},
set:function(t,p,v){if(typeof p==="symbol"||p in api)return false;api.setItem(p,v);return true;},
deleteProperty:function(t,p){if(typeof p!=="symbol"&&!(p in api))api.removeItem(p);return true;},
has:function(t,p){return p in api||p==="length"||(typeof p!=="symbol"&&p in data);},
ownKeys:function(){return Object.keys(data);},
getOwnPropertyDescriptor:function(t,p){if(typeof p!=="symbol"&&p in data)return{value:data[p],writable:true,enumerable:true,configurable:true};return undefined;}});}
var seed={};try{var named=JSON.parse(window.name||"null");if(named&&named.homeglowLocalStorage&&typeof named.homeglowLocalStorage==="object")seed=named.homeglowLocalStorage;}catch(x){}
try{window.name="";}catch(x){}
var local=storage(seed,function(change){change.type="homeglow:local-storage";try{window.parent.postMessage(change,"*");}catch(x){}});
var session=storage({},null);
try{Object.defineProperty(window,"localStorage",{value:local,configurable:true,enumerable:true});}catch(x){}
try{Object.defineProperty(window,"sessionStorage",{value:session,configurable:true,enumerable:true});}catch(x){}
})();`;
}

module.exports = { pluginFrameShimScript, PLUGIN_LOCAL_STORAGE_MAX_CHARS };
