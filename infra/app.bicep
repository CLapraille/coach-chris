// CoachChris — ressources du resource group (D93, ARCHITECTURE §9). Déployé par GitHub Actions à chaque push sur main.
param location string = resourceGroup().location

@description('Étiquette des images GHCR à déployer (SHA du commit).')
param imageTag string

@description('Préfixe des images publiques GHCR (D116).')
param imageRepo string = 'ghcr.io/clapraille/coach-chris'

@description('Tenant Entra ID.')
param tenantId string = subscription().tenantId

@description('Application Entra app-cc-9we-01 : SPA et API du BFF (infra/bootstrap.ps1).')
param entraClientId string

@description('Object ID de l\'utilisateur : seul compte autorisé (Easy Auth + BFF) et accès Cosmos pour le dev local.')
param userObjectId string

@description('Cron UTC du job de synchro (D97) : 4 h UTC = 6 h l\'été, 5 h l\'hiver à Paris.')
param syncCron string = '0 4 * * *'

@description('Heures (heure de Paris) où le BFF garde une réplique prête, pour éviter ~30 s de démarrage à l’ouverture. Vide = jamais (0 € de plus).')
param bffWarmHours object = { start: '0 6 * * *', end: '0 23 * * *' }

@description('Compte MyWhoosh (D160) : vide = intégration MyWhoosh désactivée. Fourni par les secrets GitHub.')
@secure()
param mywhooshUsername string = ''
@secure()
param mywhooshPassword string = ''

// ---------------------------------------------------------------- identité, journaux, stockage

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'mid-cc-9we-01'
  location: location
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-cc-9we-01'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    // Plafond d'ingestion journalier : principal risque de coût (ARCHITECTURE §9).
    workspaceCapping: { dailyQuotaGb: json('0.1') }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stacc9we01'
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    // Le montage Azure Files de Container Apps exige la clé du compte (ARCHITECTURE §8).
    allowSharedKeyAccess: true
  }
}

resource files 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

// Jetons des MCP : garmin/ et campus/ (D41, ARCHITECTURE §6).
resource tokens 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: files
  name: 'tokens'
  properties: { shareQuota: 1 }
}

module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  params: {
    location: location
    dataContributorIds: [userObjectId, identity.properties.principalId]
  }
}

// ---------------------------------------------------------------- Container Apps

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-cc-9we-01'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
  }
}

resource envTokens 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: env
  name: 'tokens'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: tokens.name
      accessMode: 'ReadWrite'
    }
  }
}

var swaHost = swa.properties.defaultHostname
var garminUrl = 'http://aci-cc-9we-mcpgarmin/mcp'
var campusUrl = 'http://aci-cc-9we-mcpcampus/mcp'

// Variables communes au BFF et au job de synchro.
var bffEnv = [
  { name: 'COSMOS_ENDPOINT', value: cosmos.outputs.endpoint }
  { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
  { name: 'GARMIN_MCP_URL', value: garminUrl }
  { name: 'CAMPUS_MCP_URL', value: campusUrl }
  { name: 'ALLOWED_OID', value: userObjectId }
]

// MyWhoosh (D160) : serveur communautaire lancé en stdio dans l'image du BFF, identifiants en secrets Container Apps.
var whoosh = !empty(mywhooshUsername) && !empty(mywhooshPassword)
var whooshSecrets = whoosh
  ? [
      { name: 'mywhoosh-username', value: mywhooshUsername }
      { name: 'mywhoosh-password', value: mywhooshPassword }
    ]
  : []
var whooshEnv = whoosh
  ? [
      { name: 'MYWHOOSH_MCP_CMD', value: 'node' }
      { name: 'MYWHOOSH_MCP_ARGS', value: '/app/mcp/mywhoosh/build/index.js' }
      { name: 'MYWHOOSH_MCP_ENV', value: 'MYWHOOSH_USERNAME,MYWHOOSH_PASSWORD' }
      { name: 'MYWHOOSH_USERNAME', secretRef: 'mywhoosh-username' }
      { name: 'MYWHOOSH_PASSWORD', secretRef: 'mywhoosh-password' }
    ]
  : []

// Liste blanche côté MCP (ARCHITECTURE §6) : lectures + écritures confirmées (D123), rien d'autre
// (pas de nutrition, de poids ni de suppression en masse).
var garminTools = join([
  'get_activities_by_date'
  'get_activity'
  'get_activity_splits'
  'get_activity_hr_in_timezones'
  'get_sleep_data'
  'get_hrv_data'
  'get_training_readiness'
  'get_body_battery'
  'get_stress_data'
  'get_weigh_ins'
  'get_devices'
  'get_device_last_used'
  'upload_workout'
  'schedule_workout'
  'delete_workout'
  'set_activity_name'
  'set_activity_description'
  'set_perceived_effort'
  'set_activity_feel'
  'create_manual_activity'
  'upload_activity_fit'
], ',')

// Volume des jetons : propriétaire 1000 (utilisateur des images MCP), lecture réservée.
var tokenVolume = {
  name: 'tokens'
  storageType: 'AzureFile'
  storageName: envTokens.name
  mountOptions: 'uid=1000,gid=1000,dir_mode=0700,file_mode=0600'
}

resource mcpGarmin 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'aci-cc-9we-mcpgarmin'
  location: location
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      // Ingress interne seulement (D27) : les MCP n'ont pas d'authentification HTTP propre.
      ingress: { external: false, targetPort: 8000, transport: 'http', allowInsecure: true }
    }
    template: {
      containers: [
        {
          name: 'mcp'
          image: '${imageRepo}-mcp-garmin:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [{ name: 'GARMIN_ENABLED_TOOLS', value: garminTools }]
          volumeMounts: [{ volumeName: 'tokens', mountPath: '/data' }]
        }
      ]
      volumes: [tokenVolume]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

resource mcpCampus 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'aci-cc-9we-mcpcampus'
  location: location
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: { external: false, targetPort: 8001, transport: 'http', allowInsecure: true }
    }
    template: {
      containers: [
        {
          name: 'mcp'
          image: '${imageRepo}-mcp-campus:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          // Protection DNS rebinding du MCP : nom interne appelé par le BFF et le job (campusUrl).
          env: [{ name: 'CAMPUS_MCP_ALLOWED_HOSTS', value: 'aci-cc-9we-mcpcampus,aci-cc-9we-mcpcampus:*' }]
          volumeMounts: [{ volumeName: 'tokens', mountPath: '/data' }]
        }
      ]
      volumes: [tokenVolume]
      // Le refresh token Campus change à chaque rafraîchissement : jamais deux processus (ARCHITECTURE §6).
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

resource bff 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'aci-cc-9we-bff'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        // CORS traité par l'ingress, avant Easy Auth : seule l'origine du front est admise.
        corsPolicy: {
          allowedOrigins: ['https://${swaHost}']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['authorization', 'content-type']
          maxAge: 3600
        }
      }
      secrets: whooshSecrets
    }
    template: {
      containers: [
        {
          name: 'bff'
          image: '${imageRepo}-bff:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat(bffEnv, whooshEnv)
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 3000 }
              periodSeconds: 30
            }
          ]
        }
      ]
      // Zéro réplique hors usage ; une réplique gardée prête en journée si bffWarmHours est renseigné (règle cron KEDA).
      // Déclarer une règle remplace la règle HTTP implicite : elle est donc redéclarée.
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: concat(
          [{ name: 'http', http: { metadata: { concurrentRequests: '10' } } }],
          empty(bffWarmHours)
            ? []
            : [
                {
                  name: 'journee'
                  custom: {
                    type: 'cron'
                    metadata: {
                      timezone: 'Europe/Paris'
                      start: bffWarmHours.start
                      end: bffWarmHours.end
                      desiredReplicas: '1'
                    }
                  }
                }
              ]
        )
      }
    }
  }
}

// Easy Auth (D30) : jeton Entra obligatoire, audience de l'API, seul le compte de l'utilisateur.
resource bffAuth 'Microsoft.App/containerApps/authConfigs@2024-03-01' = {
  parent: bff
  name: 'current'
  properties: {
    platform: { enabled: true }
    globalValidation: {
      unauthenticatedClientAction: 'Return401'
      excludedPaths: ['/api/health']
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraClientId
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenantId}/v2.0'
        }
        validation: {
          allowedAudiences: ['api://${entraClientId}', entraClientId]
          defaultAuthorizationPolicy: {
            allowedPrincipals: { identities: [userObjectId] }
          }
        }
      }
    }
  }
}

// Job quotidien (D35, D97) : même image que le BFF, commande de synchro.
resource syncJob 'Microsoft.App/jobs@2024-03-01' = {
  name: 'job-cc-9we-sync'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Schedule'
      scheduleTriggerConfig: { cronExpression: syncCron, parallelism: 1, replicaCompletionCount: 1 }
      replicaTimeout: 900
      replicaRetryLimit: 1
    }
    template: {
      containers: [
        {
          name: 'sync'
          image: '${imageRepo}-bff:${imageTag}'
          command: ['node', 'server/src/sync-cli.ts']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: bffEnv
        }
      ]
    }
  }
}

// ---------------------------------------------------------------- front

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-cc-9we-01'
  location: location
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

output apiUrl string = 'https://${bff.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${swaHost}'
output cosmosEndpoint string = cosmos.outputs.endpoint
