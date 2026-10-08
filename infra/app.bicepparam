using 'app.bicep'

// Remplacé par le SHA du commit lors d'un déploiement (deploy.yml).
param imageTag = 'latest'
// Identifiants affichés par infra/bootstrap.ps1 (aucun n'est un secret).
param entraClientId = '35c93925-0537-452f-adc9-fd5471adbf22'
param userObjectId = '5e45b477-b723-4b66-bf85-109f65ccb43b'
