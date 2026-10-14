// Cosmos DB NoSQL en offre gratuite (D14, ARCHITECTURE §3) : une base, 600 RU/s partagés (400 laissés à HealthMoneyTracker), 5 conteneurs.
param location string

@description('Object IDs Entra autorisés en lecture/écriture sur les données (rôle intégré Data Contributor).')
param dataContributorIds array

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: 'cos-cc-9we-01'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Un seul compte gratuit par abonnement, et le choix n'est possible qu'à la création.
    enableFreeTier: true
    // Pas de clé d'accès : uniquement Entra ID (identité managée en prod, az login en local).
    disableLocalAuth: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 1440
        backupRetentionIntervalInHours: 48
        backupStorageRedundancy: 'Local'
      }
    }
    minimalTlsVersion: 'Tls12'
  }
}

resource db 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: account
  name: 'coachchris'
  properties: {
    resource: { id: 'coachchris' }
    // 600 des 1000 RU/s gratuits du compte ; les 400 autres vont à la base hmt de HealthMoneyTracker.
    options: { throughput: 600 }
  }
}

var containers = [
  { name: 'cache', pk: '/pk', ttl: null }
  { name: 'plan', pk: '/weekDate', ttl: null }
  { name: 'library', pk: '/kind', ttl: null }
  { name: 'user', pk: '/kind', ttl: null }
  // TTL activé sans valeur par défaut : seuls les documents qui portent `ttl` (journal, 90 jours) expirent.
  { name: 'ops', pk: '/kind', ttl: -1 }
]

resource cont 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = [
  for c in containers: {
    parent: db
    name: c.name
    properties: {
      resource: union(
        {
          id: c.name
          partitionKey: { paths: [c.pk], kind: 'Hash' }
        },
        c.ttl == null ? {} : { defaultTtl: c.ttl }
      )
    }
  }
]

// Rôle intégré « Cosmos DB Built-in Data Contributor ».
var dataContributor = '${account.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'

resource roles 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = [
  for id in dataContributorIds: {
    parent: account
    name: guid(account.id, id, 'data-contributor')
    properties: {
      roleDefinitionId: dataContributor
      principalId: id
      scope: account.id
    }
  }
]

output endpoint string = account.properties.documentEndpoint
