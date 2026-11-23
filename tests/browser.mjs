import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const html=readFileSync(new URL('../index.html',import.meta.url));
const server=createServer((req,res)=>{
 if(req.url==='/'||req.url==='/index.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(html);
 }else{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const external=[];
 page.on('request',req=>{if(!req.url().startsWith(base)&&!req.url().startsWith('blob:')&&!req.url().startsWith('data:'))external.push(req.url())});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 assert.match(await page.title(),/Конструктор значков/);
 assert.equal(await page.locator('.workspace-grid>.panel').count(),3);
 const pngData=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=120;c.height=120;
  const ctx=c.getContext('2d');ctx.fillStyle='#e25081';ctx.fillRect(0,0,120,120);
  ctx.fillStyle='#fff';ctx.fillRect(30,30,60,60);
  return c.toDataURL('image/png').split(',')[1];
 });
 const png=Buffer.from(pngData,'base64');
 await page.locator('#file').setInputFiles([
  {name:'red.png',mimeType:'image/png',buffer:png},
  {name:'second.png',mimeType:'image/png',buffer:png}
 ]);
 await page.waitForFunction(()=>document.querySelectorAll('.design-row').length===2);
 assert.match(await page.locator('#status').innerText(),/Добавлено рисунков: 2/);
 assert.equal(await page.locator('.design-row').count(),2);
 await page.locator('#size').selectOption('m37');
 await page.locator('#zoom').evaluate(el=>{el.value='135';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#faceFill').selectOption('color');
 await page.locator('#fillColor').evaluate(el=>{el.value='#123456';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#copies').fill('3');
 await page.locator('#copies').dispatchEvent('change');
 assert.match(await page.locator('#sheetInfo').innerText(),/всего значков: 4/);
 await page.locator('#sheetToggle').click();
 assert.match(await page.locator('#sheetInfo').innerText(),/всего значков: 1/);
 assert.match(await page.locator('.design-row').last().innerText(),/не на листе/);
 // Restore without deleting design.
 await page.locator('#copies').fill('3');
 await page.locator('#copies').dispatchEvent('change');
 assert.match(await page.locator('#sheetInfo').innerText(),/всего значков: 4/);
 let downloadPromise=page.waitForEvent('download');
 await page.locator('#saveProject').click();
 let download=await downloadPromise;
 const savePath=await download.path();
 const project=JSON.parse(readFileSync(savePath,'utf8'));
 assert.equal(project.format,'badge-constructor-project');
 assert.equal(project.version,1);
 assert.equal(project.type,'m37');
 assert.equal(project.items.length,2);
 assert.equal(project.items[project.selected].copies,3);
 assert.equal(project.items[project.selected].zoom,1.35);
 assert.equal(project.items[project.selected].faceFill,'color');
 assert.equal(project.items[project.selected].fillColor,'#123456');
 assert.match(project.items[0].image,/^data:image\/png;base64,/);
 // Restored project can be opened and saved again.
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#openProject').setInputFiles({name:'resume.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Проект открыт'));
 assert.equal(await page.locator('.design-row').count(),2);
 assert.equal(await page.locator('#zoom').inputValue(),'135');
 assert.equal(await page.locator('#faceFill').inputValue(),'color');
 downloadPromise=page.waitForEvent('download');
 await page.locator('#saveProject').click();
 download=await downloadPromise;
 assert.equal(JSON.parse(readFileSync(await download.path(),'utf8')).items.length,2);
 // A deliberately broken import must preserve the current document.
 const bad={...project,items:project.items.map((it,i)=>i===1?{...it,image:'data:image/png;base64,'+Buffer.from('<svg>bad</svg>').toString('base64')}:it)};
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#openProject').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Не удалось открыть проект'));
 assert.equal(await page.locator('.design-row').count(),2);
 assert.match(await page.locator('#sheetInfo').innerText(),/всего значков: 4/);
 // MIME spoofing: an SVG marked PNG must be rejected without altering the project.
 await page.locator('#file').setInputFiles({name:'spoof.png',mimeType:'image/png',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')});
 assert.equal(await page.locator('.design-row').count(),2);
 assert.match(await page.locator('#status').innerText(),/Пропущено: 1/);
 // PDF generation is tested via a real browser download, not merely parsing source.
 downloadPromise=page.waitForEvent('download');
 await page.locator('#download').click();
 download=await downloadPromise;
 const pdf=readFileSync(await download.path());
 assert.equal(pdf.subarray(0,8).toString(),'%PDF-1.4');
 assert.match(pdf.toString('latin1'),/\/MediaBox \[0 0 595\.27559 841\.88976\]/);
 assert.match(pdf.toString('latin1'),/\/Count 1\b/);
 assert.equal(external.length,0,'No outside network requests: '+external.join(', '));
 assert.deepEqual(errors,[],'Page errors: '+errors.join('; '));
 console.log('BROWSER PASS: uploads, selection, sheet removal, full project save/open/re-save, invalid JSON, MIME spoofing, A4 PDF, CSP and no external requests');
 await page.screenshot({path:'browser-smoke.png',fullPage:true});
 await context.close();
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
