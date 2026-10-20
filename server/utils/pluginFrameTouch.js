// The touch script every plugin page is served with, for the dashboard's
// two-finger swipe between tabs and its pinch-zoom block (per-display settings,
// both off by default).
//
// A plugin is an iframe, and the dashboard never sees touches made inside one,
// so without this a swipe that starts on a plugin would do nothing, and a pinch
// on a plugin would still zoom. The script does nothing until the dashboard
// posts it this display's settings (`homeglow:touch-settings`, from the frame's
// parent only). Then, with swiping on, it reports two-finger touches to the
// dashboard as `homeglow:touch` messages, and the dashboard's detector
// (client/src/utils/twoFingerSwipe.js) decides whether they were a swipe; with
// pinch zoom blocked, it gives the page the same touch-action as the dashboard.
//
// Only two-finger touches are reported, and only their positions; a start also
// says where each finger landed and how long ago, since fingers rarely land
// together and a second finger may join a first that is already moving. Once the two
// fingers are clearly travelling sideways together, the script stops the
// browser's own handling of that touch, as the dashboard does; the thresholds
// below mirror CLAIM_DISTANCE and PINCH_SPREAD_SHARE there. Listeners exist
// only while swiping is on, so a display with it off pays nothing.
//
// The same script serves expanding a widget (client/src/utils/widgetExpand.js),
// also per display and off by default. The settings message then carries
// `expand`: false, 'doubleTap' or 'button', for this plugin on this display.
// With either method on, a touch in the frame is reported (at most once a
// second) as `homeglow:frame-activity`, so the dashboard can show its expand
// buttons and hold off its auto-return. With 'doubleTap', a click on the
// page's plain area (not a button, link or field) is held for a moment: a
// second click close by makes it a double-tap, reported as
// `homeglow:double-tap` and eaten; otherwise the held click is replayed on
// what it was meant for. The page also stops the browser's own double-tap
// zoom. Thresholds mirror DOUBLE_TAP_MS, DOUBLE_TAP_SLOP and
// INTERACTIVE_SELECTOR there.
//
// Plain ES5 in an IIFE, inlined into <head>: it must run in any plugin, old or
// new, with or without the SDK, and leave no globals behind.

const PLUGIN_FRAME_TOUCH_SCRIPT = `(function(){
if(window.parent===window)return;
var CLAIM=20,PINCH=0.4,BLOCK="pan-x pan-y";
var listening=false,gesture=null,before="",landed={};
function points(t,withLanding){var p=[],now=Date.now();for(var i=0;i<t.length&&i<10;i++){var o={id:t[i].identifier,x:t[i].clientX,y:t[i].clientY},l=landed[t[i].identifier];
if(withLanding&&l){o.x0=l.x;o.y0=l.y;o.age=now-l.t;}p.push(o);}return p;}
function post(phase,e,withLanding){try{window.parent.postMessage({type:"homeglow:touch",phase:phase,points:points(e.touches,withLanding),fingers:e.touches.length},"*");}catch(x){}}
function spread(p){return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
function from(p){var l=landed[p.id];return l?{x:l.x,y:l.y}:{x:p.x,y:p.y};}
function remember(e){for(var i=0;i<e.changedTouches.length;i++){var c=e.changedTouches[i];landed[c.identifier]={x:c.clientX,y:c.clientY,t:Date.now()};}}
function forget(e){for(var i=0;i<e.changedTouches.length;i++)delete landed[e.changedTouches[i].identifier];}
function onStart(e){remember(e);var n=e.touches.length;
if(n===2){var p=points(e.touches,false);gesture={a:from(p[0]),b:from(p[1]),s:spread(p),pinch:false};post("start",e,true);}
else if(n>2&&gesture){gesture=null;post("cancel",e,false);}}
function onMove(e){if(!gesture||e.touches.length!==2)return;post("move",e,false);
var p=points(e.touches,false),dx=(p[0].x-gesture.a.x+p[1].x-gesture.b.x)/2,dy=(p[0].y-gesture.a.y+p[1].y-gesture.b.y)/2;
if(Math.abs(spread(p)-gesture.s)>gesture.s*PINCH)gesture.pinch=true;
if(!gesture.pinch&&Math.abs(dx)>CLAIM&&Math.abs(dx)>Math.abs(dy)&&e.cancelable)e.preventDefault();}
function onEnd(e){forget(e);if(!gesture||e.touches.length>1)return;gesture=null;post("end",e,false);}
function onCancel(e){forget(e);if(!gesture)return;gesture=null;post("cancel",e,false);}
var opts={capture:true,passive:true},moveOpts={capture:true,passive:false};
function listen(on){if(on===listening)return;listening=on;gesture=null;landed={};
var f=on?"addEventListener":"removeEventListener";
window[f]("touchstart",onStart,opts);window[f]("touchmove",onMove,moveOpts);
window[f]("touchend",onEnd,opts);window[f]("touchcancel",onCancel,opts);}
var touchMode="",expand=false,tapWin=320,tapSlop=40,lastTap=null,held=null,lastActivity=0,REPLAY="__homeglowReplayedClick",
INTERACTIVE='button,a,input,textarea,select,label,[role="button"],[role="slider"],[role="tab"],[role="checkbox"],[role="switch"],[contenteditable="true"]';
function touchAction(mode){var s=document.documentElement.style;if(mode===touchMode)return;
if(!touchMode)before=s.touchAction;s.touchAction=mode||before;touchMode=mode;}
function tell(type){try{window.parent.postMessage({type:type},"*");}catch(x){}}
function onDown(){var now=Date.now();if(now-lastActivity<1000)return;lastActivity=now;tell("homeglow:frame-activity");}
function dropHeld(){if(held){clearTimeout(held.timer);held=null;}}
function replay(h){if(!h.t.isConnected)return;var r=new MouseEvent("click",{bubbles:true,cancelable:true,composed:true,clientX:h.x,clientY:h.y,detail:1,view:window});r[REPLAY]=true;h.t.dispatchEvent(r);}
function flushHeld(){var h=held;dropHeld();if(h)replay(h);}
function onClick(e){if(e[REPLAY]||expand!=="doubleTap"||e.detail===0)return;
var t=e.target;if(!t||!t.closest||t.closest(INTERACTIVE)){lastTap=null;flushHeld();return;}
e.stopImmediatePropagation();e.preventDefault();var now=Date.now();
if(lastTap&&now-lastTap.at<=tapWin&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=tapSlop){lastTap=null;dropHeld();tell("homeglow:double-tap");return;}
lastTap={x:e.clientX,y:e.clientY,at:now};flushHeld();
var h={t:t,x:e.clientX,y:e.clientY};h.timer=setTimeout(function(){held=null;replay(h);},tapWin);held=h;}
function watchExpand(mode){var on=mode==="doubleTap"||mode==="button";var was=expand==="doubleTap"||expand==="button";
if(on!==was){var f=on?"addEventListener":"removeEventListener";window[f]("pointerdown",onDown,opts);window[f]("click",onClick,true);}
if(mode!=="doubleTap"){lastTap=null;flushHeld();}expand=on?mode:false;}
window.addEventListener("message",function(e){
if(e.source!==window.parent||!e.data||e.data.type!=="homeglow:touch-settings")return;
listen(e.data.swipe===true);var mode=e.data.expand==="doubleTap"||e.data.expand==="button"?e.data.expand:false;watchExpand(mode);
touchAction(e.data.blockPinchZoom===true?BLOCK:(mode==="doubleTap"?"manipulation":""));});
})();`;

module.exports = { PLUGIN_FRAME_TOUCH_SCRIPT };
