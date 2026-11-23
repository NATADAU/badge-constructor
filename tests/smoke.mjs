import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'script exists');
new vm.Script(script);
for(const diameter of ['33','35','48.5','54']) assert.ok(script.includes('paper:'+diameter),'paper size '+diameter);
for(const name of ['renderSheet','drawPrintedBadge','downloadPdf','pdfFromJpegs']) assert.ok(script.includes('function '+name),'function '+name);
assert.match(html,/id="download"/);
assert.match(html,/id="copies"/);
assert.match(html,/id="blur"/);
assert.match(html,/id="grid"/);
assert.match(script,/function drawGrid\(/);
assert.match(script,/function nudge\(/);
const pdfSource=script.slice(script.indexOf('function pdfFromJpegs'),script.indexOf('async function downloadPdf'));
const makePdf=vm.runInNewContext(pdfSource+';pdfFromJpegs',{TextEncoder,Blob,Uint8Array});
const blob=makePdf([{w:100,h:100,bytes:new Uint8Array([255,216,255,217])},{w:100,h:100,bytes:new Uint8Array([255,216,255,217])}]);
const text=new TextDecoder('latin1').decode(await blob.arrayBuffer());
assert.ok(text.startsWith('%PDF-1.4'));
assert.match(text,/\/Count 2\b/);
const size=Number(text.match(/\/Size (\d+)/)?.[1]);assert.equal(size,9);
const lines=text.split('xref\n')[1].split('\n').slice(2,2+size-1);
for(let i=1;i<size;i++){const offset=Number(lines[i-1].slice(0,10));assert.ok(text.slice(offset).startsWith(i+' 0 obj'),'xref '+i);}
const dimensions=text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
assert.ok(dimensions);
assert.ok(Math.abs(Number(dimensions[1])-595.27559)<.001);
assert.ok(Math.abs(Number(dimensions[2])-841.88976)<.001);
console.log('OK: syntax, paper diameters, A4, PDF pages and offsets');

assert.match(html,/id="designs"/);
assert.match(html,/type="file"[^>]*multiple/);
assert.equal((html.match(/id="copies"/g)||[]).length,1);
assert.match(script,/function selectDesign\(/);
assert.match(script,/function saveActive\(/);
assert.match(script,/drawPrintedBadge\(c,x,y,p\.d\/2\*mm,all\[n\]\)/);
const slotStart=script.indexOf('function clampCopies(');
const slotEnd=script.indexOf('function plan()',slotStart);
assert.ok(slotStart>0&&slotEnd>slotStart);
const tools=vm.runInNewContext(
  script.slice(slotStart,slotEnd)+';({clampCopies,copies,slots})',
  {state:{items:[{id:1,copies:2},{id:2,copies:1},{id:3,copies:3}]}}
);
assert.equal(tools.clampCopies(0),1);
assert.equal(tools.clampCopies(999),200);
assert.equal(tools.copies(),6);
assert.deepEqual(Array.from(tools.slots(),i=>i.id),[1,1,2,3,3,3]);
console.log('OK: multiple designs and independent counts');

assert.match(html,/id="faceFill"/);
assert.match(html,/id="fillColor"/);
for(const mode of ['none','blur','color'])assert.match(html,new RegExp('value="'+mode+'"'));
assert.match(script,/function paintBadge\(/);
assert.match(script,/paintBadge\(c,x,y,r,item,true\)/);
assert.match(script,/faceFill:state\.faceFill/);
console.log('OK: selectable face fills and print-preview shared renderer');
