// CoachChris — infrastructure Azure (D93). Portée abonnement : resource group, budget, puis modules.
targetScope = 'subscription'

@description('Région de toutes les ressources (D20).')
param location string = 'westeurope'

@description('Montant mensuel du budget, en euros.')
param budgetAmount int = 7

@description('Adresse qui reçoit les alertes du budget.')
param alertEmail string

@description('Premier jour du mois de départ du budget (AAAA-MM-01).')
param budgetStartDate string

@description('Object ID Entra de l\'utilisateur, autorisé sur le plan de données Cosmos pour le développement local.')
param userObjectId string

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-coach-chris'
  location: location
}

// Budget sur tout l'abonnement : il ne bloque rien, il prévient (D33).
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'bud-cc-9we-01'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      actual50: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: [alertEmail]
      }
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [alertEmail]
      }
      actual100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [alertEmail]
      }
    }
  }
}

module cosmos 'modules/cosmos.bicep' = {
  scope: rg
  name: 'cosmos'
  params: {
    location: location
    dataContributorIds: [userObjectId]
  }
}

output cosmosEndpoint string = cosmos.outputs.endpoint
