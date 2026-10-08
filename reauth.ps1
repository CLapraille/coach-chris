<#
.SYNOPSIS
  Reconnecte une source (Garmin ou Campus) et envoie ses jetons vers Azure Files (D82, D92).

.DESCRIPTION
  Le navigateur ne peut pas lancer de script local : l'écran Données affiche cette commande quand un jeton est refusé.
  Les jetons ne sont jamais affichés ; ils transitent par un fichier temporaire supprimé à la fin.

  - garmin : envoie les jetons du poste (~/.garminconnect). Avec -Login, refait d'abord la connexion (garmin-mcp-auth).
    Garmin accepte plusieurs copies des mêmes jetons.
  - campus : ouvre une connexion Campus DÉDIÉE à Azure. Le refresh token Campus change à chaque rafraîchissement :
    si Azure et le poste partageaient le même, l'un des deux finirait refusé. La connexion se fait donc dans une
    fenêtre de navigation privée, distincte de la session habituelle.

.EXAMPLE
  .\reauth.ps1 -Source campus
#>
param(
  [Parameter(Mandatory)] [ValidateSet('garmin', 'campus')] [string] $Source,
  [switch] $Login
)
$ErrorActionPreference = 'Stop'
$rg = 'rg-coach-chris'
$account = 'stacc9we01'
$share = 'tokens'

function Send-Token([string] $File, [string] $Dir, [string] $Name) {
  $key = az storage account keys list -g $rg -n $account --query '[0].value' -o tsv
  if (-not $key) { throw "Clé du compte $account introuvable (az login ?)" }
  az storage directory create --account-name $account --account-key $key --share-name $share --name $Dir --only-show-errors | Out-Null
  az storage file upload --account-name $account --account-key $key --share-name $share `
    --source $File --path "$Dir/$Name" --only-show-errors | Out-Null
  Write-Host "Jetons $Source envoyés vers Azure Files ($share/$Dir/$Name)."
}

function Restart-Mcp([string] $App) {
  # Le MCP Garmin lit ses jetons au démarrage : on relance la révision active s'il tourne.
  $rev = az containerapp revision list -g $rg -n $App --query "[?properties.active].name | [0]" -o tsv
  if ($rev) { az containerapp revision restart -g $rg -n $App --revision $rev --only-show-errors | Out-Null }
}

if ($Source -eq 'garmin') {
  if ($Login) { garmin-mcp-auth }
  $file = Join-Path $HOME '.garminconnect\garmin_tokens.json'
  if (-not (Test-Path $file)) { throw "Pas de jetons Garmin dans $file : relance avec -Login" }
  Send-Token $file 'garmin' 'garmin_tokens.json'
  Restart-Mcp 'aci-cc-9we-mcpgarmin'
}
else {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("cc-campus-" + [guid]::NewGuid())
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    Write-Host ''
    Write-Host '1. Ouvre une fenêtre de navigation PRIVÉE et connecte-toi sur https://app.campus.coach'
    Write-Host '2. Colle dans la console (F12) le snippet affiché ci-dessous.'
    Write-Host '3. Ferme ensuite la fenêtre privée SANS te déconnecter (la déconnexion révoquerait la session).'
    Write-Host ''
    $env:CAMPUS_COACH_TOKEN_DIR = $tmp
    uv run --system-certs --directory (Join-Path $PSScriptRoot 'mcp\campus') campus-coach-auth
    $file = Join-Path $tmp 'tokens.json'
    if (-not (Test-Path $file)) { throw 'Aucun jeton reçu.' }
    Send-Token $file 'campus' 'tokens.json'
  }
  finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item Env:CAMPUS_COACH_TOKEN_DIR -ErrorAction SilentlyContinue
  }
}
Write-Host 'Reviens sur l''écran Données et clique « Actualiser maintenant ».'
