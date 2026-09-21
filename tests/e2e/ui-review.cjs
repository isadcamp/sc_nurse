const { chromium } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
 const out = path.resolve(__dirname,'test-results/ui-review'); fs.mkdirSync(out,{recursive:true});
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1586,height:992},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message)); console.log('E2E: frontend loaded');
 let loaded=false; for (let attempt=0; attempt<20 && !loaded; attempt++) { try { await page.goto('http://127.0.0.1:3100',{waitUntil:'domcontentloaded',timeout:3000}); loaded=true; } catch (error) { if (attempt===19) throw error; await new Promise(resolve=>setTimeout(resolve,1000)); } }
 await page.getByLabel('รหัสเข้าใช้งาน').fill('synthetic-head-token-for-tests-only');
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
 await page.getByLabel('หน่วยงาน',{exact:true}).selectOption('test-ward');
 await page.getByLabel('เดือน',{exact:true}).fill('2026-09');
 await page.getByRole('button',{name:'เปิดตาราง',exact:true}).click();
 await page.locator('.matrix-table').waitFor(); console.log('E2E: roster loaded');
 await page.screenshot({path:path.join(out,'desktop-initial.png'),fullPage:true});
 console.log(JSON.stringify({errors,overflow:await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})),cells:await page.locator('[data-cell-key]').count(),buttons:await page.locator('.nf-palette').innerText()}));
 await page.locator('[data-cell-key="test-a_2026-09-01"]').click();
 await page.getByRole('button',{name:'เลือกเวร ช',exact:true}).click();
 await page.waitForTimeout(800);
 console.log('After edit:',await page.locator('[data-cell-key="test-a_2026-09-01"]').innerText());
 console.log('Alerts:',await page.getByRole('alert').allTextContents());
 await page.screenshot({path:path.join(out,'desktop-edited.png'),fullPage:true});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

