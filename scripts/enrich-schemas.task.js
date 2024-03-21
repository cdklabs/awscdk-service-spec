const child_process= require('child_process');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');


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

function enrichCfnSchema(sourceRegion, destRegion) {
    const sourceDir = path.join(tmpExtract, CFN_LINT_SCHEMA_PATH, sourceRegion);
    const destDir = path.join(CLOUDFORMATION_SCHEMA_FOLDER_PATH, destRegion);

    const sourceFiles = fs.readdirSync(sourceDir);
    sourceFiles.forEach((file) => {
        if (file.endsWith('.json')) {
            const sourceFilePath = path.join(sourceDir, file);
            const destFilePath = path.join(destDir, file);
            if (fs.existsSync(sourceFilePath) && fs.existsSync(destFilePath)) {
                const sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
                const destContent = fs.readFileSync(destFilePath, 'utf8');
                
                const sourceData = JSON.parse(sourceContent);
                const destData = JSON.parse(destContent);
    
                addEnumsFromSourceToDest(sourceData, destData);
    
                fs.writeFileSync(destFilePath, JSON.stringify(destData, null, 2));
            }
        }
    });
}

function addEnumsFromSourceToDest(source, dest) {
    const sourceProperties = source.properties;
    const destProperties = dest.properties;
    const sourceDefinitions = source.definitions;
    const destDefinitions = dest.definitions;

    if (sourceProperties && destProperties) {
        addPropertyEnums(sourceProperties, destProperties);
    } 

    if (sourceDefinitions && destDefinitions) {
        Object.keys(sourceDefinitions).forEach((definitionName) => {
            const sourceDefinition = sourceDefinitions[definitionName];
            const destDefinition = destDefinitions[definitionName];

            const sourceProperties = sourceDefinition?.properties;
            const destProperties = destDefinition?.properties;
            
            if (sourceProperties && destProperties) {
                addPropertyEnums(sourceProperties, destProperties);
            }
        });
    }
}

function addPropertyEnums(sourceProperties, destProperties) {
    Object.keys(sourceProperties).forEach((propertyName) => {
        const sourceProperty = sourceProperties[propertyName];
        const destProperty = destProperties[propertyName];

        if (destProperty && sourceProperty.enum && !destProperty.enum) {
            destProperty.enum = sourceProperty.enum;
        }
    });
}

async function fetchCfnLintSchema(tmpDir, tmpDest, tmpExtract) {
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

                // Enrich each region CloudFormation schema with us-east-1 from cfn-lint
                // Then us-east-2 for us-east-2 and us-west-2 for us-west-2
                enrichCfnSchema('us_east_1', 'enriched-us-east-1');
                enrichCfnSchema('us_east_1', 'enriched-us-east-2');
                enrichCfnSchema('us_east_1', 'enriched-us-west-2');
                enrichCfnSchema('us_east_2', 'enriched-us-east-2');
                enrichCfnSchema('us_west_2', 'enriched-us-west-2');

                fs.rmSync(tmpDir, { recursive: true, force: true });
                console.log('Extraction completed');
            })
            .on('error', (err) => {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                console.error(`Download failed: ${err.message}`);
            });
    });
}

fetchCfnLintSchema(tmpDir, tmpDest, tmpExtract);