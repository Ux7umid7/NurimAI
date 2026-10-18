const fs=require('node:fs');const path=require('node:path');const {validateGateway}=require('../src/gateway.cjs');
const file=path.join(__dirname,'../src/release-config.json');const config=JSON.parse(fs.readFileSync(file,'utf8'));
const repo=process.argv[2]||process.env.GITHUB_REPOSITORY;
if(repo){if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('Expected owner/repository');[config.owner,config.repo]=repo.split('/');}
if(process.argv[3]||process.env.NURIMAI_GATEWAY_URL)config.gateway=validateGateway(process.argv[3]||process.env.NURIMAI_GATEWAY_URL);
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');console.log('Public release configuration updated. No API keys are stored here.');
