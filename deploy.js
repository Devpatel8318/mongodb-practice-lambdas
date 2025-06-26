// deploy.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');
const {
    LambdaClient,
    UpdateFunctionCodeCommand,
} = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'ap-south-1' });

const readLambdasToDeploy = () => {
    const fileContents = fs.readFileSync('deploy.yml', 'utf8');
    const data = yaml.load(fileContents);
    return data.lambdas || [];
};

const runZipScript = (folder) => {
    const functionPath = path.join(__dirname, 'src', 'functions', folder);
    console.log(`Zipping: ${folder}`);
    execSync('npm run zip', {
        cwd: functionPath,
        stdio: 'inherit',
    });
    return path.join(functionPath, 'app.zip');
};

const uploadToLambda = async (functionName, zipPath) => {
    console.log(`Uploading to Lambda (v3): ${functionName}`);
    const zipBuffer = fs.readFileSync(zipPath);

    const command = new UpdateFunctionCodeCommand({
        FunctionName: functionName,
        ZipFile: zipBuffer,
        Publish: true,
    });

    try {
        const result = await lambdaClient.send(command);
        console.log(`✅ Uploaded ${functionName} | Version: ${result.Version}`);
    } catch (err) {
        console.error(`❌ Failed to upload ${functionName}:`, err.message);
    }
};

const deploy = async () => {
    const lambdas = readLambdasToDeploy();

    for (const { folder, functionName } of lambdas) {
        try {
            const zipPath = runZipScript(folder);
            await uploadToLambda(functionName, zipPath);
        } catch (err) {
            console.error(`Error processing ${functionName}:`, err.message);
        }
    }
};

deploy();
