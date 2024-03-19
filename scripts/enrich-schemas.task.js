const child_process= require('child_process');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Write a function that fetches files from CFN_LINT_URL into a temporary directory
// and returns the path to the temporary directory.

const REGIONS = {
    'us_east_1': 'enriched-us-east-1',
    'us_east_2': 'enriched-us-east-2',
    'us_west_2': 'enriched-us-west-2'
};

const CFN_LINT_URL = 'https://github.com/aws-cloudformation/cfn-lint/archive/v1.zip';
const CFN_LINT_SCHEMA_PATH = 'cfn-lint-1/src/cfnlint/data/schemas/providers';

const CLOUDFORMATION_SCHEMA_FOLDER_PATH = 'sources/CloudFormationSchema';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `cfn-lint-`));
const tmpDest = path.join(tmpDir, 'data');
const tmpExtract = path.join(tmpDir, 'extract');

function addEnumsToSchema(sourceRegion, destRegion) {
    const sourcePath = path.join([tmpExtract, CFN_LINT_SCHEMA_PATH, sourceRegion]);
    const destPath = path.join([CLOUDFORMATION_SCHEMA_FOLDER_PATH, destRegion]);
}

function fetchCfnLintSchema(tmpDir, tmpDest, tmpExtract) {
    const file = fs.createWriteStream(tmpDest);
    fetch(CFN_LINT_URL).then((res) => {
        res.body.pipe(file);
        file
            .on('finish', () => {
                file.close();
                console.log('Download completed');

                fs.mkdirSync(tmpExtract, { recursive: true });
                const { status } = child_process.spawnSync('unzip', [tmpDest, '-d', tmpExtract], {
                    cwd: process.cwd(),
                    stdio: [null, null, process.stderr],
                });
                if (status !== 0) {
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                    console.error('Extraction failed');
                    return;
                }
            
                // fs.rmSync(destination, { recursive: true, force: true });
                // fs.mkdirSync(destination, { recursive: true });
                // fs.cpSync(tmpExtract, destination, { recursive: true });

                // Enrich each region CloudFormation schema with us-east-1 from cfn-lint
                // Then us-east-2 for us-east-2 and us-west-2 for us-west-2
                Object.keys(REGIONS).forEach((region) => {
                    addEnumsToSchema(region, REGIONS[region]);
                });
                addEnumsToSchema('us_east_1', REGIONS['us_east_2']);
                addEnumsToSchema('us_east_1', REGIONS['us_west_2']);

                fs.rmSync(tmpDir, { recursive: true, force: true });
                console.log(tmpExtract);
                console.log(`${tmpExtract}/${CFN_LINT_SCHEMA_PATH}`);
                console.log('Extraction completed');
            })
            .on('error', (err) => {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                console.error(`Download failed: ${err.message}`);
            });
    });
}


fetchCfnLintSchema(tmpDest, tmpDir, tmpExtract);