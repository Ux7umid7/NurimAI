const fs=require('node:fs');const path=require('node:path');
// The app's own files must not bring user data, the server, tests or CI files; any file anywhere (dependencies too) must not be a secret.
// Dependencies may have their own folders named data/ or server/ (the Claude SDK keeps model tables in internal/data/), so only secrets are checked there.
const OWN=/(?:^|[/\\])(?:data|server|tests|\.github)(?:[/\\.]|$)/;
const SECRET=/(?:^|[/\\])\.env(?:[/\\.]|$)|settings\.json$|\.(?:p12|pfx)$/;
const unexpected=entry=>SECRET.test(entry)||(!/(?:^|[/\\])node_modules(?:[/\\]|$)/.test(entry)&&OWN.test(entry));
async function main(){const asar=await import('@electron/asar');const dist=path.join(__dirname,'../dist');let archives=[];
 function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())walk(full);else if(item.name==='app.asar')archives.push(full);}}
 walk(dist);if(!archives.length)throw new Error('No packaged app.asar found');
 for(const archive of archives){const entries=asar.listPackage(archive);for(const entry of entries)if(unexpected(entry))throw new Error('Unexpected packaged file: '+entry);
  const config=JSON.parse(asar.extractFile(archive,'src/release-config.json'));if(config.owner!=='Ux7umid7'||config.repo!=='NurimAI')throw new Error('Wrong release feed');
 }console.log('Package allowlist and release feed verified.');}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={unexpected};
