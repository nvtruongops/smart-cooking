# Documentation Cleanup Script
# Reorganize and clean up docs/ folder

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("Full", "Conservative", "Archive", "Phase2")]
    [string]$Mode = "Archive",
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$Organize = $false
)

function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }

Write-Info "========================================"
Write-Info "Documentation Cleanup Script"
Write-Info "========================================"
Write-Host ""
Write-Host "Mode: $Mode" -ForegroundColor Yellow
Write-Host "Dry Run: $DryRun" -ForegroundColor $(if ($DryRun) { "Yellow" } else { "Red" })
Write-Host ""

$docsPath = "docs"
$archivePath = "docs/archive"
$deletedCount = 0
$movedCount = 0
$keptCount = 0

# Files to delete/archive
$filesToRemove = @(
    # Migration files (7) - Migration complete
    "BEDROCK-AP-SOUTHEAST-1-PERFORMANCE-UPDATE.md",
    "BEDROCK-MIGRATION-COMPLETED.md",
    "COMPLETE-MIGRATION-TO-AP-SOUTHEAST-1.md",
    "AP-SOUTHEAST-1-CHECKLIST.md",
    "REGION-MIGRATION-GUIDE.md",
    "US-EAST-1-SERVICES-AUDIT.md",
    "SYNC-SUMMARY.md",
    
    # Deployment duplicates (3)
    "DEPLOYMENT.md",
    "PRODUCTION-DEPLOYMENT-SUMMARY.md",
    "DEPLOYMENT-SMARTCOOKING-COM.md",
    
    # Monitoring duplicates (3)
    "MONITORING.md",
    "MONITORING-IMPLEMENTATION-SUMMARY.md",
    "MONITORING-COST-ALERTING-IMPLEMENTATION.md",
    
    # Error handling duplicates (2)
    "ERROR-HANDLING.md",
    "ERROR-HANDLING-IMPLEMENTATION.md",
    
    # Ingredient duplicates (2)
    "ingredient-input-implementation.md",
    "INGREDIENT_SYSTEM.md",
    
    # Avatar/Storage (3)
    "AVATAR-IMPLEMENTATION.md",
    "DEFAULT-AVATAR-SETUP-SUMMARY.md",
    "S3-STORAGE-STACK-IMPLEMENTATION.md",
    
    # Task 11.2 duplicates (2)
    "TASK-11.2-BEDROCK-ENHANCEMENT-SUMMARY.md",
    "TASK-11.2-COMPLETION-SUMMARY.md",
    
    # Task 19 duplicates (2)
    "TASK-19-COMPLETION-SUMMARY.md",
    "TASK-19-FINAL-STATUS.md",
    
    # Empty/Old files (4)
    "TASK-13.2-BIDIRECTIONAL-FRIENDSHIP-COMPLETION.md",  # EMPTY
    "TASKS-ARCHITECTURE-ALIGNMENT.md",
    "PHASE-1-COMPLETION-ANALYSIS.md",
    "PERFORMANCE-OPTIMIZATION-IMPLEMENTATION.md"
)

# Conservative mode - only obvious duplicates
$conservativeRemove = @(
    "TASK-13.2-BIDIRECTIONAL-FRIENDSHIP-COMPLETION.md",  # Empty
    "US-EAST-1-SERVICES-AUDIT.md",  # Old region
    "DEPLOYMENT.md",  # Old version
    "MONITORING.md",  # Old version
    "ERROR-HANDLING.md"  # Old version
)

# Phase 2 mode - archive regular task docs, keep only milestones
$phase2Remove = @(
    # Regular feature task completions (not milestones)
    "TASK-14.2-SOCIAL-FEED-COMPLETION.md",
    "TASK-14.4-REACTIONS-COMPLETION.md",
    "TASK-15-NOTIFICATIONS-SYSTEM-COMPLETION.md",
    "TASK-16-COMPLETE-SOCIAL-FEATURES-FRONTEND.md",
    "TASK-17-SOCIAL-INTEGRATION-COMPLETION.md",
    "TASK-18-SOCIAL-OPTIMIZATION-COMPLETION.md",
    # Cleanup plan (no longer needed)
    "CLEANUP-PLAN.md"
)

if ($Mode -eq "Conservative") {
    $filesToRemove = $conservativeRemove
}

if ($Mode -eq "Phase2") {
    $filesToRemove = $phase2Remove
}

# Process files
Write-Info "Processing $($filesToRemove.Count) files..."
Write-Host ""

foreach ($file in $filesToRemove) {
    $filePath = Join-Path $docsPath $file
    
    if (!(Test-Path $filePath)) {
        Write-Warning "[SKIP] File not found: $file"
        continue
    }
    
    $fileSize = (Get-Item $filePath).Length
    $fileSizeKB = [math]::Round($fileSize / 1KB, 2)
    
    if ($Mode -eq "Archive" -or $Mode -eq "Phase2") {
        # Archive mode - move to archive folder
        if (!$DryRun) {
            if (!(Test-Path $archivePath)) {
                New-Item -ItemType Directory -Path $archivePath -Force | Out-Null
            }
            
            $destPath = Join-Path $archivePath $file
            Move-Item -Path $filePath -Destination $destPath -Force
            Write-Success "[ARCHIVE] $file ($fileSizeKB KB)"
            $movedCount++
        } else {
            Write-Warning "[DRY-RUN] Would archive: $file ($fileSizeKB KB)"
        }
    } else {
        # Full/Conservative mode - delete
        if (!$DryRun) {
            Remove-Item -Path $filePath -Force
            Write-Success "[DELETE] $file ($fileSizeKB KB)"
            $deletedCount++
        } else {
            Write-Warning "[DRY-RUN] Would delete: $file ($fileSizeKB KB)"
        }
    }
}

Write-Host ""

# Count remaining files
$remainingFiles = Get-ChildItem -Path $docsPath -Filter "*.md" -File
$keptCount = $remainingFiles.Count

# Summary
Write-Info "========================================"
Write-Info "Cleanup Summary"
Write-Info "========================================"
Write-Host ""

if ($DryRun) {
    Write-Warning "DRY RUN MODE - No changes made"
    Write-Host ""
    Write-Host "Would process:"
    Write-Host "  Files to $($Mode.ToLower()): $($filesToRemove.Count)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Run without -DryRun to apply changes" -ForegroundColor Gray
} else {
    if ($Mode -eq "Archive") {
        Write-Success "Archived: $movedCount files"
        Write-Host "  Location: $archivePath" -ForegroundColor Gray
    } else {
        Write-Success "Deleted: $deletedCount files"
    }
    
    Write-Host "Remaining: $keptCount files" -ForegroundColor Green
    Write-Host ""
    
    Write-Info "Essential files kept:"
    Write-Host "  - AWS-PROFILE-MANAGEMENT.md" -ForegroundColor White
    Write-Host "  - AMPLIFY-DEPLOYMENT-GUIDE.md" -ForegroundColor White
    Write-Host "  - CUSTOM-DOMAIN-SETUP.md" -ForegroundColor White
    Write-Host "  - TASK-14 to TASK-20 completion docs" -ForegroundColor White
    Write-Host "  - TYPESCRIPT-VALIDATION-REPORT.md" -ForegroundColor White
}

Write-Host ""
Write-Info "========================================"
Write-Host ""

if ($DryRun) {
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Review the list above" -ForegroundColor White
    Write-Host "  2. Run without -DryRun to apply" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Gray
    Write-Host "  .\scripts\cleanup-docs.ps1 -Mode Archive" -ForegroundColor Gray
    Write-Host "  .\scripts\cleanup-docs.ps1 -Mode Full" -ForegroundColor Gray
    Write-Host "  .\scripts\cleanup-docs.ps1 -Mode Conservative" -ForegroundColor Gray
} else {
    Write-Success "Cleanup complete!"
    Write-Host ""
    Write-Host "Check cleanup plan: docs/CLEANUP-PLAN.md" -ForegroundColor Gray
}

Write-Host ""
