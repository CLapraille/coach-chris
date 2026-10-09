<#
.SYNOPSIS
  Ce que Bicep fait mal (D93), à lancer une fois après `az login` ; relançable sans effet de bord.

  1. Inscription Entra app-cc-9we-01 (D30) : SPA (MSAL) + API du BFF (portée access_as_user),
     « affectation requise » et seul le compte de l'utilisateur affecté.
  2. Identité de déploiement GitHub Actions gh-cc-9we-deploy : fédération OIDC sur la branche main
     (aucun secret dans GitHub), rôle Contributor limité au resource group.

  Affiche les identifiants à reporter dans infra/app.bicepparam et .github/workflows/deploy.yml.
#>
param(
  [string] $Repo = 'CLapraille/coach-chris',
  [string] $ResourceGroup = 'rg-coach-chris',
  # Front local (Vite) et Static Web App (sortie webUrl de infra/app.bicep).
  [string[]] $RedirectUris = @('http://localhost:5173', 'https://salmon-field-0225c0803.3.azurestaticapps.net')
)
$ErrorActionPreference = 'Stop'
$graph = 'https://graph.microsoft.com/v1.0'

function Invoke-Graph([string] $Method, [string] $Url, $Body) {
  $azArgs = @('rest', '--method', $Method, '--url', $Url, '--headers', 'Content-Type=application/json')
  if ($null -ne $Body) {
    $file = New-TemporaryFile
    # Sans BOM : az rest rejette un corps JSON précédé d'un BOM.
    [IO.File]::WriteAllText($file, ($Body | ConvertTo-Json -Depth 10 -Compress))
    $azArgs += @('--body', "@$file")
  }
  try { $out = az @azArgs } finally { if ($file) { Remove-Item $file } }
  if ($LASTEXITCODE -ne 0) { throw "Graph $Method $Url a échoué" }
  # az renvoie le JSON ligne par ligne : on le recolle avant de le lire.
  $text = ($out -join "`n").Trim()
  if ($text) {
    try { return ($text | ConvertFrom-Json) } catch { throw "Réponse Graph illisible pour $Method $Url : $($text.Substring(0, [Math]::Min(200, $text.Length)))" }
  }
}

function Get-App([string] $Name) {
  $id = az ad app list --display-name $Name --query '[0].appId' -o tsv
  if (-not $id) {
    $id = az ad app create --display-name $Name --sign-in-audience AzureADMyOrg --query appId -o tsv
    Write-Host "Application $Name créée."
  }
  return $id
}

function Get-Sp([string] $AppId) {
  $sp = az ad sp list --filter "appId eq '$AppId'" --query '[0].id' -o tsv
  if (-not $sp) { $sp = az ad sp create --id $AppId --query id -o tsv }
  return $sp
}

$tenant = az account show --query tenantId -o tsv
$sub = az account show --query id -o tsv
$me = az ad signed-in-user show --query id -o tsv

# ---------------------------------------------------------------- 1. app-cc-9we-01
$appId = Get-App 'app-cc-9we-01'
# Par l'identifiant objet : az est un script .cmd qui déforme les parenthèses et quotes d'une URL.
$appObj = az ad app show --id $appId --query id -o tsv
$app = Invoke-Graph GET "$graph/applications/$appObj"
$scope = $app.api.oauth2PermissionScopes | Where-Object value -eq 'access_as_user'
$scopeId = if ($scope) { $scope.id } else { [guid]::NewGuid().ToString() }
Invoke-Graph PATCH "$graph/applications/$($app.id)" @{
  identifierUris = @("api://$appId")
  spa            = @{ redirectUris = $RedirectUris }
  api            = @{
    requestedAccessTokenVersion = 2
    oauth2PermissionScopes      = @(@{
        id                      = $scopeId
        value                   = 'access_as_user'
        type                    = 'User'
        isEnabled               = $true
        adminConsentDisplayName = 'Accéder à CoachChris'
        adminConsentDescription = "Permet au front CoachChris d'appeler son BFF."
        userConsentDisplayName  = 'Accéder à CoachChris'
        userConsentDescription  = "Permet au front CoachChris d'appeler son BFF."
      })
  }
} | Out-Null
# Le front appelle sa propre API sans écran de consentement.
Invoke-Graph PATCH "$graph/applications/$($app.id)" @{
  api = @{ preAuthorizedApplications = @(@{ appId = $appId; delegatedPermissionIds = @($scopeId) }) }
} | Out-Null

$sp = Get-Sp $appId
Invoke-Graph PATCH "$graph/servicePrincipals/$sp" @{ appRoleAssignmentRequired = $true } | Out-Null
$assigned = Invoke-Graph GET "$graph/servicePrincipals/$sp/appRoleAssignedTo"
if (-not ($assigned.value | Where-Object principalId -eq $me)) {
  Invoke-Graph POST "$graph/servicePrincipals/$sp/appRoleAssignedTo" @{
    principalId = $me; resourceId = $sp; appRoleId = '00000000-0000-0000-0000-000000000000'
  } | Out-Null
  Write-Host 'Compte de l''utilisateur affecté à app-cc-9we-01.'
}

# ---------------------------------------------------------------- 2. gh-cc-9we-deploy
$deployId = Get-App 'gh-cc-9we-deploy'
$deploySp = Get-Sp $deployId
$creds = az ad app federated-credential list --id $deployId --query "[].name" -o tsv
# GitHub présente désormais le sujet avec les identifiants immuables du propriétaire et du dépôt
# (repo:owner@ownerId/repo@repoId:…) ; on déclare les deux formes.
$owner, $name = $Repo -split '/'
# Deux requêtes jq sans guillemets : PowerShell 5.1 retire les guillemets des arguments d'un exécutable.
$ownerId = gh api "repos/$Repo" --jq .owner.id
$repoId = gh api "repos/$Repo" --jq .id
if (-not $ownerId -or -not $repoId) { throw "Identifiants GitHub de $Repo introuvables (gh auth login ?)" }
$subjects = @{
  'main'     = "repo:${Repo}:ref:refs/heads/main"
  'main-ids' = "repo:${owner}@${ownerId}/${name}@${repoId}:ref:refs/heads/main"
}
foreach ($credName in $subjects.Keys) {
  if ($creds -contains $credName) { continue }
  $file = New-TemporaryFile
  @{
    name      = $credName
    issuer    = 'https://token.actions.githubusercontent.com'
    subject   = $subjects[$credName]
    audiences = @('api://AzureADTokenExchange')
  } | ConvertTo-Json | ForEach-Object { [IO.File]::WriteAllText($file, $_) }
  az ad app federated-credential create --id $deployId --parameters "@$file" --only-show-errors | Out-Null
  Remove-Item $file
  Write-Host "Fédération OIDC GitHub ($credName : $($subjects[$credName])) créée."
}
$rgId = az group show -n $ResourceGroup --query id -o tsv
$has = az role assignment list --assignee $deploySp --scope $rgId --role Contributor --query '[0].id' -o tsv
if (-not $has) {
  az role assignment create --assignee-object-id $deploySp --assignee-principal-type ServicePrincipal `
    --role Contributor --scope $rgId --only-show-errors | Out-Null
  Write-Host "Rôle Contributor donné sur $ResourceGroup."
}

Write-Host ''
Write-Host "tenantId          = $tenant"
Write-Host "subscriptionId    = $sub"
Write-Host "entraClientId     = $appId   (app-cc-9we-01)"
Write-Host "deployClientId    = $deployId   (gh-cc-9we-deploy)"
Write-Host "userObjectId      = $me"
