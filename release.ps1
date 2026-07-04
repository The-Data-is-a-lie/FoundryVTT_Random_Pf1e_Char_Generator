#Requires -Version 5.1
<#
    release.ps1 - cut and publish a new version of the pf1e_random_char_generator Foundry module.

    One command does the whole release: bump module.json, roll the changelog, rebuild the
    distributable zip from source, commit + tag, push to GitLab (main + tag), create a GitLab
    Release, then submit the version to the FoundryVTT package registry via the Package Release API.

    The manifest/download URLs are pinned to the new tag (immutable per release, per Foundry's
    recommendation), so users always get exactly the code that shipped with that version.

    Prerequisites (one-time), in a git-ignored .env next to this script:
      GITLAB_TOKEN=...            # api-scoped GitLab PAT (creates the GitLab Release)
      FOUNDRY_PACKAGE_TOKEN=...   # per-package "Package Release Token" (fvttp_...) from the
                                  #   package's edit page on foundryvtt.com (above "Save Package")

    Usage:
      ./release.ps1 -Version 2.0.0                 # full release + publish to Foundry
      ./release.ps1 -Version 2.0.0 -Verified 13    # also bump compatibility.verified
      ./release.ps1 -Version 2.0.0 -NoPublish      # push + GitLab release, but DON'T submit to Foundry
      ./release.ps1 -Version 2.0.0 -DryRun         # local only: apply edits + build zip, touch nothing remote
      ./release.ps1 -Version 2.0.0 -AllowDirty     # skip the clean-tree / fast-forward preconditions

    A real run always submits a Foundry dry-run (dry-run:true) FIRST and only publishes if it passes,
    so every publish is pre-flighted. -DryRun is a fully local rehearsal that makes no remote changes.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [string]$Verified,
    [string]$Maximum,
    [switch]$DryRun,
    [switch]$NoPublish,
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false   # we check $LASTEXITCODE ourselves

# ---- constants ----
$Root           = $PSScriptRoot
$ModName        = 'pf1e_random_char_generator'
$ModDir         = Join-Path $Root $ModName
$ManifestRel    = "$ModName/module.json"
$ChangelogRel   = 'changelog.md'
$ZipRel         = "downloads/$ModName.zip"
$ManifestPath   = Join-Path $Root "$ModName\module.json"
$ChangelogPath  = Join-Path $Root 'changelog.md'
$ZipPath        = Join-Path $Root "downloads\$ModName.zip"
$EnvPath        = Join-Path $Root '.env'
$PkgId          = $ModName
$ProjPath       = 'pathfinder_1e_randomized_character_generator/FoundryVTT_Random_Pf1e_Char_Generator'
$ProjId         = 'pathfinder_1e_randomized_character_generator%2FFoundryVTT_Random_Pf1e_Char_Generator'
$RawBase        = "https://gitlab.com/$ProjPath/-/raw/v$Version"
$PinnedManifest = "$RawBase/$ModName/module.json"
$PinnedDownload = "$RawBase/downloads/$ModName.zip"
$FoundryApi     = 'https://foundryvtt.com/_api/packages/release_version/'
$PkgUrl         = "https://foundryvtt.com/packages/$PkgId"

Set-Location $Root

function Fail($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    $m" -ForegroundColor Green }
function Note($m) { Write-Host "    $m" -ForegroundColor Yellow }

function Read-EnvVar($key, $path) {
    $line = Get-Content $path -ErrorAction SilentlyContinue | Where-Object { $_ -like "$key=*" } | Select-Object -First 1
    if ($line) { $line.Substring("$key=".Length).Trim() }
}
function Write-Utf8NoBom($path, $text) {
    [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

$mode = if ($DryRun) { 'DRY-RUN (local only, no remote changes)' }
        elseif ($NoPublish) { 'NO-PUBLISH (push + GitLab release, no Foundry submit)' }
        else { 'FULL RELEASE (+ Foundry publish)' }
Step "release.ps1  ->  v$Version   [$mode]"

# ---- 1. preconditions ----------------------------------------------------------------------------
Step 'Checking preconditions'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git not found on PATH.' }

$GitLabToken  = Read-EnvVar 'GITLAB_TOKEN' $EnvPath
$FoundryToken = Read-EnvVar 'FOUNDRY_PACKAGE_TOKEN' $EnvPath
if (-not $DryRun -and -not $GitLabToken) {
    Fail "GITLAB_TOKEN missing from $EnvPath (needed to create the GitLab release)."
}
if (-not $DryRun -and -not $NoPublish -and -not $FoundryToken) {
    Fail "FOUNDRY_PACKAGE_TOKEN missing from $EnvPath (needed to publish to Foundry). Use -NoPublish to skip publishing."
}

if (& git tag -l "v$Version") { Fail "Tag v$Version already exists locally. Pick a new version, or 'git tag -d v$Version' to redo." }

if (-not $AllowDirty) {
    $porcelain = (& git status --porcelain)
    if ($porcelain) { Fail "Working tree is not clean. Commit or stash first, or pass -AllowDirty.`n$porcelain" }
    & git merge-base --is-ancestor origin/main HEAD
    if ($LASTEXITCODE -ne 0) {
        Fail "origin/main is not an ancestor of HEAD -- 'git push origin HEAD:main' would not fast-forward. Reconcile with main first (or pass -AllowDirty)."
    }
}
Ok 'Preconditions OK.'

# ---- 2. bump module.json (version, compat, pinned URLs) -------------------------------------------
Step "Bumping $ManifestRel -> version $Version, pinned to tag v$Version"
$mj  = [System.IO.File]::ReadAllText($ManifestPath)
$nlM = if ($mj -match "`r`n") { "`r`n" } else { "`n" }
$mj  = $mj -creplace '("version"\s*:\s*")[^"]*(")', ('${1}' + $Version + '${2}')
if ($Verified) { $mj = $mj -creplace '("verified"\s*:\s*")[^"]*(")', ('${1}' + $Verified + '${2}') }
if ($Maximum) {
    if ($mj -match '"maximum"\s*:') {
        $mj = $mj -creplace '("maximum"\s*:\s*")[^"]*(")', ('${1}' + $Maximum + '${2}')
    } else {
        $mj = $mj -creplace '("verified"\s*:\s*"[^"]*")', ('${1},' + $nlM + '    "maximum": "' + $Maximum + '"')
    }
}
$mj = $mj -creplace '("manifest"\s*:\s*")[^"]*(")', ('${1}' + $PinnedManifest + '${2}')
$mj = $mj -creplace '("download"\s*:\s*")[^"]*(")', ('${1}' + $PinnedDownload + '${2}')

try { $mjObj = $mj | ConvertFrom-Json } catch { Fail "module.json no longer parses after edit: $($_.Exception.Message)" }
if ($mjObj.version -ne $Version) { Fail "version did not update as expected (got '$($mjObj.version)')." }
Write-Utf8NoBom $ManifestPath $mj
Ok "version=$($mjObj.version)  minimum=$($mjObj.compatibility.minimum)  verified=$($mjObj.compatibility.verified)"

# ---- 3. roll the changelog -----------------------------------------------------------------------
Step 'Rolling changelog.md (Unreleased -> versioned)'
$cl  = [System.IO.File]::ReadAllText($ChangelogPath)
$nlC = if ($cl -match "`r`n") { "`r`n" } else { "`n" }
$m   = [regex]::Match($cl, '(?s)^Unreleased\r?\n\r?\n(.*?)\r?\n\r?\nVersion ')
if (-not $m.Success) { Fail "changelog.md: couldn't find an 'Unreleased' section followed by a 'Version ' section -- roll aborted." }
$body = $m.Groups[1].Value.Trim()
if (-not $body) { Fail 'The Unreleased section is empty -- nothing to release.' }
$date     = Get-Date -Format 'yyyy-MM-dd'
$verStart = $m.Index + $m.Length - 'Version '.Length
$rest     = $cl.Substring($verStart)
$newCl    = "Unreleased$nlC$nlC" + "Version $Version ($date)$nlC$nlC" + $body + "$nlC$nlC" + $rest
Write-Utf8NoBom $ChangelogPath $newCl
$ReleaseNotes = $body
$entryCount   = ($body -split "`n" | Where-Object { $_ -match '^\s*-' }).Count
Ok "Rolled to 'Version $Version ($date)'  ($entryCount entries)."

# ---- 4. rebuild the distributable zip ------------------------------------------------------------
Step 'Rebuilding the distributable zip (from current source)'
$zipTarget = if ($DryRun) { Join-Path $env:TEMP "$ModName-v$Version-dryrun.zip" } else { $ZipPath }
$stageRoot = Join-Path $env:TEMP "pf1e_rcg_stage_$Version"
$stageMod  = Join-Path $stageRoot $ModName
if (Test-Path $stageRoot) { Remove-Item $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

# Mirror the module dir minus everything the shipped archive has never contained:
#   *.bak (scratch), *_MODS.json (dev overlays), .claude/ (agent tooling), .env, .git, node_modules.
& robocopy $ModDir $stageMod /MIR /XD .claude .git node_modules /XF *.bak *_MODS.json *.tmp .env /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "robocopy failed (exit $LASTEXITCODE)." }
$global:LASTEXITCODE = 0

if (Test-Path $zipTarget) { Remove-Item $zipTarget -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
[System.IO.Compression.ZipFile]::CreateFromDirectory($stageMod, $zipTarget, [System.IO.Compression.CompressionLevel]::Optimal, $true)
Remove-Item $stageRoot -Recurse -Force -ErrorAction SilentlyContinue

# sanity: right root, no forbidden files, runtime data present, plausible size
$zi = [System.IO.Compression.ZipFile]::OpenRead($zipTarget)
try { $names = @($zi.Entries | ForEach-Object { $_.FullName }) } finally { $zi.Dispose() }
$bad = $names | Where-Object { $_ -match '\.bak$' -or $_ -match '_MODS\.json$' -or $_ -match '/\.claude/' -or $_ -match '(^|/)\.env$' }
if ($bad) { Fail "Zip contains files that must not ship:`n$($bad -join "`n")" }
if (-not ($names -match "^$ModName/templates/character_sheet_folder/every_feat\.json$")) {
    Fail 'Zip is missing expected runtime data (every_feat.json) -- aborting.'
}
$zipMB = [math]::Round((Get-Item $zipTarget).Length / 1MB, 1)
if ($zipMB -lt 1) { Fail "Rebuilt zip is only ${zipMB} MB (<1 MB) -- likely incomplete." }
Ok "Zip: $zipTarget  (${zipMB} MB, $($names.Count) entries)"

# ---- DRY-RUN stops here --------------------------------------------------------------------------
if ($DryRun) {
    Write-Host ''
    Step 'DRY-RUN summary (no commit / tag / push / publish performed)'
    Note "module.json + changelog.md were edited in place; the tracked zip was left untouched (built to TEMP)."
    Note "Inspect:  git --no-pager diff -- $ManifestRel $ChangelogRel"
    Note "Revert:   git restore -- $ManifestRel $ChangelogRel"
    Write-Host ''
    Step 'Foundry payload that a real run would submit (dry-run:true, then dry-run:false):'
    $preview = @{ id = $PkgId; 'dry-run' = $true; release = @{
        version = $Version; manifest = $PinnedManifest
        notes = '(the GitLab release URL, created at publish time)'
        compatibility = @{ minimum = $mjObj.compatibility.minimum; verified = $mjObj.compatibility.verified } } }
    if ($mjObj.compatibility.maximum) { $preview.release.compatibility.maximum = $mjObj.compatibility.maximum }
    ($preview | ConvertTo-Json -Depth 6) | Write-Host
    Write-Host ''
    Ok 'Dry-run complete. No remote changes were made.'
    exit 0
}

# ---- 5. commit + tag + push ----------------------------------------------------------------------
Step "Committing release + tagging v$Version"
& git add -- $ManifestRel $ChangelogRel $ZipRel
if ($LASTEXITCODE -ne 0) { Fail 'git add failed.' }
& git commit -q -m "chore(release): v$Version"
if ($LASTEXITCODE -ne 0) { Fail 'git commit failed (nothing staged?).' }
& git tag -a "v$Version" -m "Release v$Version"
if ($LASTEXITCODE -ne 0) { Fail 'git tag failed.' }

Step 'Pushing to GitLab (main + tag)'
& git push origin HEAD:main
if ($LASTEXITCODE -ne 0) { Fail "Push to main failed. Local commit+tag exist -- fix, then re-run: git push origin HEAD:main && git push origin v$Version" }
& git push origin "v$Version"
if ($LASTEXITCODE -ne 0) { Fail "Tag push failed. Re-run: git push origin v$Version" }
Ok 'Pushed main + tag.'

# ---- 6. GitLab release ---------------------------------------------------------------------------
Step 'Creating GitLab release'
$glBody = @{ tag_name = "v$Version"; name = "v$Version"; description = $ReleaseNotes } | ConvertTo-Json -Depth 4
try {
    $rel = Invoke-RestMethod -Method Post -Uri "https://gitlab.com/api/v4/projects/$ProjId/releases" `
        -Headers @{ 'PRIVATE-TOKEN' = $GitLabToken } -ContentType 'application/json' -Body $glBody
    $GitLabReleaseUrl = $rel._links.self
} catch {
    $code = $null; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 409) {
        Note "GitLab release v$Version already exists -- continuing."
        $GitLabReleaseUrl = "https://gitlab.com/$ProjPath/-/releases/v$Version"
    } else {
        Fail "GitLab release failed ($code): $($_.ErrorDetails.Message)`nTag is pushed; create the release manually or re-run with -NoPublish once fixed."
    }
}
Ok "GitLab release: $GitLabReleaseUrl"

# ---- NO-PUBLISH stops here -----------------------------------------------------------------------
if ($NoPublish) {
    Write-Host ''
    Step 'NO-PUBLISH: stopping before Foundry submission'
    Note "Publish manually at $PkgUrl (Release Version), or re-run without -NoPublish:"
    Note "  version:  $Version"
    Note "  manifest: $PinnedManifest"
    Note "  notes:    $GitLabReleaseUrl"
    Write-Host ''
    Ok 'Pushed + released on GitLab. Not submitted to Foundry.'
    exit 0
}

# ---- 7. Foundry: dry-run, then publish -----------------------------------------------------------
$compat = @{ minimum = $mjObj.compatibility.minimum; verified = $mjObj.compatibility.verified }
if ($mjObj.compatibility.maximum) { $compat.maximum = $mjObj.compatibility.maximum }

function Invoke-FoundryRelease([bool]$dry) {
    $payload = @{ id = $PkgId; 'dry-run' = $dry; release = @{
        version = $Version; manifest = $PinnedManifest; notes = $GitLabReleaseUrl; compatibility = $compat } }
    $json = $payload | ConvertTo-Json -Depth 6
    try {
        return Invoke-RestMethod -Method Post -Uri $FoundryApi -Headers @{ Authorization = $FoundryToken } -ContentType 'application/json' -Body $json
    } catch {
        $code = $null; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        if ($code -eq 429) {
            $ra = '60'; try { $ra = ($_.Exception.Response.Headers.GetValues('Retry-After') | Select-Object -First 1) } catch {}
            Fail "Foundry rate limit (429): wait ${ra}s (one release per package per 60s) and re-run (tag + GitLab release already exist)."
        }
        Fail "Foundry API error ($code): $($_.ErrorDetails.Message)"
    }
}

Step 'Foundry: validating (dry-run:true)'
$dr = Invoke-FoundryRelease $true
Ok "dry-run OK: $($dr | ConvertTo-Json -Compress -Depth 6)"

Step 'Foundry: publishing (dry-run:false)'
$pub = Invoke-FoundryRelease $false
Ok "published: $($pub | ConvertTo-Json -Compress -Depth 6)"

# ---- 8. summary ----------------------------------------------------------------------------------
Write-Host ''
Write-Host "Published $ModName v$Version" -ForegroundColor Green
Write-Host "  Foundry:  $PkgUrl" -ForegroundColor Green
Write-Host "  GitLab:   $GitLabReleaseUrl" -ForegroundColor Green
Write-Host "  Manifest: $PinnedManifest" -ForegroundColor Green
