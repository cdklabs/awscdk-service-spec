import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { CloudFormationDocumentation, cfndocs } from '../types';

export function importCloudFormationDocumentation(db: SpecDatabase, docs: CloudFormationDocumentation) {
  for (const [typeName, typeDocs] of Object.entries(docs.Types)) {
    const parts = typeName.split('.');
    if (parts.length === 2) {
      readPropertyTypeDocs(parts[0], parts[1], typeDocs);
    } else {
      readResourceDocs(parts[0], typeDocs);
    }
  }

  function readResourceDocs(resourceName: string, resDocs: cfndocs.TypeDocumentation) {
    for (const res of db.lookup('resource', 'cloudFormationType', 'equals', resourceName)) {
      if (resDocs.description) {
        res.documentation = resDocs.description;
      }

      copyDocs(res.properties, resDocs.properties);
      copyDocs(res.attributes, resDocs.attributes);
    }
  }

  function readPropertyTypeDocs(resourceName: string, propertyTypeName: string, typeDocs: cfndocs.TypeDocumentation) {
    const propertyTypes = db
      .lookup('resource', 'cloudFormationType', 'equals', resourceName)
      .flatMap((res) => db.follow('usesType', res).filter((t) => t.entity.name === propertyTypeName))
      .map((t) => t.entity);

    for (const propertyType of propertyTypes) {
      if (typeDocs.description) {
        propertyType.documentation = typeDocs.description;
      }

      copyDocs(propertyType.properties, typeDocs.properties);
    }
  }
}

function copyDocs<A extends { documentation?: string }>(
  targets: Record<string, A>,
  sources: Record<string, string> | undefined,
) {
  for (const [key, doc] of Object.entries(sources ?? {})) {
    if (doc && targets[key]) {
      targets[key].documentation = doc;
    }
  }
}
