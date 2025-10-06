#!/usr/bin/env pwsh
# Monitor Amplify Build Progress
# Usage: .\scripts\monitor-amplify-build.ps1

param(
    [string]$AppId = "d3dvp9hmx5nwq7",
    [string]$Branch = "main",
    [string]$Region = "ap-southeast-1",
    [int]$JobId = 1
)

$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"

Write-Host "`n========================================" -ForegroundColor $Cyan
Write-Host "  Amplify Build Monitor" -ForegroundColor $Cyan
Write-Host "========================================" -ForegroundColor $Cyan
Write-Host "App ID: $AppId" -ForegroundColor $Green
Write-Host "Branch: $Branch" -ForegroundColor $Green
Write-Host "Job ID: $JobId" -ForegroundColor $Green
Write-Host "URL: https://$Branch.$AppId.amplifyapp.com" -ForegroundColor $Green
Write-Host "`nMonitoring build progress..." -ForegroundColor $Yellow
Write-Host "(Press Ctrl+C to stop monitoring - build will continue)`n" -ForegroundColor $Yellow

$lastStatus = ""
$startTime = Get-Date

while ($true) {
    try {
        $jobStatus = aws amplify get-job `
            --app-id $AppId `
            --branch-name $Branch `
            --job-id $JobId `
            --region $Region `
            2>&1 | ConvertFrom-Json
        
        $status = $jobStatus.job.summary.status
        $currentStep = $jobStatus.job.steps | Where-Object { $_.status -eq "RUNNING" } | Select-Object -First 1
        
        if ($status -ne $lastStatus) {
            $elapsed = ((Get-Date) - $startTime).ToString("mm\:ss")
            
            $statusColor = switch ($status) {
                "PENDING" { $Yellow }
                "PROVISIONING" { $Yellow }
                "RUNNING" { $Cyan }
                "SUCCEED" { $Green }
                "FAILED" { $Red }
                "CANCELLED" { $Yellow }
                default { $Yellow }
            }
            
            Write-Host "[$elapsed] Status: $status" -ForegroundColor $statusColor
            
            if ($currentStep) {
                Write-Host "         Current step: $($currentStep.stepName)" -ForegroundColor $Cyan
            }
            
            $lastStatus = $status
        }
        
        # Show all steps status
        if ($status -eq "RUNNING") {
            $steps = $jobStatus.job.steps
            foreach ($step in $steps) {
                $stepStatus = switch ($step.status) {
                    "SUCCEED" { "✅" }
                    "RUNNING" { "⏳" }
                    "FAILED" { "❌" }
                    "PENDING" { "⏸️" }
                    default { "⏸️" }
                }
                
                if ($step.stepName -match "(PROVISION|BUILD|DEPLOY|VERIFY)") {
                    $stepName = $step.stepName.PadRight(15)
                    Write-Host "         $stepStatus $stepName" -ForegroundColor Gray -NoNewline
                    
                    if ($step.status -eq "RUNNING") {
                        $stepElapsed = ((Get-Date) - [DateTime]$step.startTime).TotalSeconds
                        Write-Host " ($([int]$stepElapsed)s)" -ForegroundColor Yellow
                    } else {
                        Write-Host ""
                    }
                }
            }
            Write-Host ""
        }
        
        if ($status -eq "SUCCEED") {
            $totalTime = ((Get-Date) - $startTime).TotalMinutes
            Write-Host "`n========================================" -ForegroundColor $Green
            Write-Host "  ✅ Deployment Completed Successfully!" -ForegroundColor $Green
            Write-Host "========================================" -ForegroundColor $Green
            Write-Host "Total time: $([Math]::Round($totalTime, 1)) minutes" -ForegroundColor $Green
            Write-Host "`nYour app is live at:" -ForegroundColor $Cyan
            Write-Host "https://$Branch.$AppId.amplifyapp.com" -ForegroundColor $Green
            Write-Host "`nNext steps:" -ForegroundColor $Cyan
            Write-Host "1. Test your app (opening in browser...)" -ForegroundColor $Cyan
            Write-Host "2. Run E2E tests: npm test tests/e2e/" -ForegroundColor $Cyan
            Write-Host "3. Update Task 19 status: COMPLETE ✅`n" -ForegroundColor $Cyan
            
            # Open app in browser
            Start-Process "https://$Branch.$AppId.amplifyapp.com"
            
            break
        }
        
        if ($status -eq "FAILED") {
            Write-Host "`n========================================" -ForegroundColor $Red
            Write-Host "  ❌ Deployment Failed" -ForegroundColor $Red
            Write-Host "========================================" -ForegroundColor $Red
            Write-Host "`nCheck logs at:" -ForegroundColor $Yellow
            Write-Host "https://$Region.console.aws.amazon.com/amplify/home?region=$Region#/$AppId/$Branch/$JobId" -ForegroundColor $Cyan
            
            # Show failed step
            $failedStep = $jobStatus.job.steps | Where-Object { $_.status -eq "FAILED" } | Select-Object -First 1
            if ($failedStep) {
                Write-Host "`nFailed step: $($failedStep.stepName)" -ForegroundColor $Red
                Write-Host "Error: $($failedStep.logUrl)`n" -ForegroundColor $Yellow
            }
            
            exit 1
        }
        
        Start-Sleep -Seconds 15
        
    } catch {
        Write-Host "Error checking status: $($_.Exception.Message)" -ForegroundColor $Red
        Start-Sleep -Seconds 20
    }
}

Write-Host "`nMonitoring complete! 🎉`n" -ForegroundColor $Green
