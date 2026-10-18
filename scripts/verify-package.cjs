const fs=require('node:fs');const path=require('node:path');
async function main(){const asar=await import('@electron/asar');const dist=path.join(__dirname,'../dist');let archives=[];
 function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())walk(full);else if(item.name==='app.asar')archives.push(full);}}
 walk(dist);if(!archives.length)throw new Error('No packaged app.asar found');
 for(const archive of archives){const entries=asar.listPackage(archive);for(const entry of entries){if(/(?:^|[/\\])(?:data|server|tests|\.github|\.env)(?:[/\\.]|$)|settings\.json|\.(?:p12|pfx)$/.test(entry))throw new Error('Unexpected packaged file: '+entry);}
  const config=JSON.parse(asar.extractFile(archive,'src/release-config.json'));if(config.owner!=='Ux7umid7'||config.repo!=='NurmiAI')throw new Error('Wrong release feed');
 }console.log('Package allowlist and release feed verified.');}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
