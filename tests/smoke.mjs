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
assert.equal(tools.clampCopies(0),0);
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

assert.match(script,/function featherImage\(/);
assert.match(script,/item\.feathered=featherImage\(img\)/);
assert.match(script,/img\.naturalWidth\|\|img\.width/);
assert.match(script,/item\.faceFill!=='none'/);
console.log('OK: feathered edges and image/canvas dimensions');

assert.match(html,/class="workspace-grid"/);
for(const panel of ['designs-panel','editor-panel','paper-panel'])assert.match(html,new RegExp('class="panel '+panel+'"'));
assert.equal((html.match(/id="preview"/g)||[]).length,1);
assert.equal((html.match(/id="sheet"/g)||[]).length,1);
assert.equal((html.match(/id="size"/g)||[]).length,1);
assert.match(script,/function sheetCaption\(/);
assert.match(script,/c\.fillText\(sheetCaption\(\),p\.margin\*mm,289\*mm\)/);
const caption=vm.runInNewContext(
  script.slice(script.indexOf('function sheetCaption()'),script.indexOf('function renderSheet(',script.indexOf('function sheetCaption()')))+';sheetCaption',
  {state:{type:'m37'},presets:{m37:{face:37,paper:48.5},plastic:{face:33,paper:33}}}
);
assert.match(caption(),/37 мм/);
assert.match(caption(),/48,5 мм/);
console.log('OK: three-panel workspace, unique controls, and A4 size caption');

assert.match(html,/class="add-image-button"/);
assert.match(html,/Добавить ещё изображение/);
assert.match(html,/id="file"[^>]*multiple/);
assert.match(script,/state\.items\.push\(item\)/);
console.log('OK: additive image upload clearly labeled');

assert.match(html,/id="saveProject"/);
assert.match(html,/id="openProject"/);
assert.match(html,/id="sheetToggle"/);
assert.match(html,/id="copies" min="0"/);
for(const name of ['saveProject','openProject','validateSavedItem','fileToDataURL','loadImage','updateSheetToggle'])assert.match(script,new RegExp('function '+name+'\\('));
assert.match(script,/i\.copies=0/);
assert.match(script,/state\.items=loaded/);
assert.match(script,/format:PROJECT_FORMAT,version:PROJECT_VERSION/);
assert.match(script,/image:await fileToDataURL\(blob\)/);
const validate=vm.runInNewContext(script.slice(script.indexOf('function validateSavedItem'),script.indexOf('async function saveProject'))+';validateSavedItem');
const valid={name:'test.png',image:'data:image/png;base64,aGVsbG8=',zoom:1,x:0,y:0,copies:0,blur:true,faceFill:'none',fillColor:'#ffffff'};
assert.doesNotThrow(()=>validate(valid));
assert.throws(()=>validate({...valid,image:'https://host.example/a.png'}));
assert.throws(()=>validate({...valid,copies:-1}));
assert.throws(()=>validate({...valid,zoom:Infinity}));
assert.throws(()=>validate({...valid,fillColor:'red'}));
assert.throws(()=>validate({...valid,faceFill:'script'}));
console.log('OK: save/open project format, validation, and 0-copy sheet removal');

assert.match(html,/http-equiv="Content-Security-Policy"/);
assert.match(html,/connect-src blob:/);
assert.match(script,/MAX_IMAGES=24/);
assert.match(script,/MAX_IMAGE_PIXELS=16e6/);
assert.match(script,/MAX_TOTAL_PIXELS=64e6/);
assert.match(script,/function imageSignature\(/);
assert.match(script,/function projectImageSignature\(/);
assert.match(script,/if\(!committed\)for\(const item of loaded\)disposeDesign\(item\)/);
assert.match(script,/fileSignature\(file\)!==file.type/);
assert.match(script,/totalPixels\(loaded\)/);
const sig=vm.runInNewContext(script.slice(script.indexOf('function imageSignature'),script.indexOf('function imagePixels'))+';({imageSignature,projectImageSignature})',{Uint8Array,atob});
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const jpeg=Uint8Array.from([255,216,255,224,0,0]);
const webp=Uint8Array.from([82,73,70,70,0,0,0,0,87,69,66,80]);
assert.equal(sig.imageSignature(png),'image/png');
assert.equal(sig.imageSignature(jpeg),'image/jpeg');
assert.equal(sig.imageSignature(webp),'image/webp');
assert.equal(sig.imageSignature(new Uint8Array([60,115,118,103,62])),null);
assert.equal(sig.projectImageSignature('data:image/png;base64,'+Buffer.from(png).toString('base64')),'image/png');
assert.equal(sig.projectImageSignature('data:image/png;base64,'+Buffer.from(jpeg).toString('base64')),'image/jpeg');
console.log('OK: signatures, CSP, resource budgets, and failed-import rollback');
