const {version}=require('../package.json');const {validateGateway}=require('../src/gateway.cjs');
if(process.env.GITHUB_REF_NAME!==`v${version}`)throw new Error('Tag must match package.json version');
if(!validateGateway(process.env.NURIMAI_GATEWAY_URL))throw new Error('Deploy the gateway and set NURIMAI_GATEWAY_URL before publishing to users');
console.log('Release version and gateway origin verified.');
