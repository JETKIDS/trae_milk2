# Bulk update dummy customers: set billing_method to 'debit' for IDs multiple of 3
# And for customers with 'debit' but missing bank account info, fill with dummy values

$ErrorActionPreference = 'Stop'

$BaseUrl = 'http://localhost:9000'
$PageSize = 200
$Page = 1
$Processed = 0

Write-Host "Starting bulk update of dummy customers..." -ForegroundColor Cyan

function Get-CustomerDetails($id) {
  return Invoke-RestMethod -Uri "$BaseUrl/api/customers/$id" -Method Get
}

function Put-Settings($id, $billing_method, $rounding_enabled, $bank_code, $branch_code, $account_type, $account_number, $account_holder_katakana) {
  $payload = @{ billing_method = $billing_method; rounding_enabled = $rounding_enabled }
  if ($bank_code -ne $null) { $payload.bank_code = $bank_code }
  if ($branch_code -ne $null) { $payload.branch_code = $branch_code }
  if ($account_type -ne $null) { $payload.account_type = $account_type }
  if ($account_number -ne $null) { $payload.account_number = $account_number }
  if ($account_holder_katakana -ne $null) { $payload.account_holder_katakana = $account_holder_katakana }
  $json = $payload | ConvertTo-Json
  return Invoke-RestMethod -Uri "$BaseUrl/api/customers/$id/settings" -Method Put -ContentType 'application/json' -Body $json
}

function Is-MissingBankInfo($settings) {
  if ($settings -eq $null) { return $true }
  $missing = $false
  if ([string]::IsNullOrWhiteSpace($settings.bank_code)) { $missing = $true }
  if ([string]::IsNullOrWhiteSpace($settings.branch_code)) { $missing = $true }
  if ($settings.account_type -eq $null) { $missing = $true }
  if ([string]::IsNullOrWhiteSpace($settings.account_number)) { $missing = $true }
  if ([string]::IsNullOrWhiteSpace($settings.account_holder_katakana)) { $missing = $true }
  return $missing
}

function Generate-DummyBankInfo($id) {
  $bank_code = ('{0:D4}' -f (([int]$id % 9000) + 1))
  $branch_code = ('{0:D3}' -f (([int]$id % 1000) + 1))
  $account_type = 1
  $account_number = ('{0:D7}' -f [int]$id)
  # 半角カタカナのダミー名義（APIバリデーション要件に準拠）
  $account_holder_katakana = 'ﾔﾏﾀﾞﾀﾛｳ'
  $result = @{}
  $result.bank_code = $bank_code
  $result.branch_code = $branch_code
  $result.account_type = $account_type
  $result.account_number = $account_number
  $result.account_holder_katakana = $account_holder_katakana
  return $result
}

try {
  while ($true) {
    $paged = Invoke-RestMethod -Uri "$BaseUrl/api/customers/paged?page=$Page&pageSize=$PageSize" -Method Get
    if ($null -eq $paged -or $null -eq $paged.items -or $paged.items.Count -eq 0) {
      break
    }
    foreach ($cust in $paged.items) {
      $id = [int]$cust.id
      $details = Get-CustomerDetails -id $id
      $settings = $details.settings
      $rounding = 1
      if ($settings -ne $null -and $settings.rounding_enabled -ne $null) { $rounding = [int]$settings.rounding_enabled }

      # 1) If customer ID is multiple of 3, set billing_method to 'debit'
      if (($id % 3) -eq 0) {
        if ($settings -eq $null -or $settings.billing_method -ne 'debit') {
          Write-Host "[UPDATE] Set billing_method=debit for customer $id" -ForegroundColor Yellow
          Put-Settings -id $id -billing_method 'debit' -rounding_enabled $rounding -bank_code $null -branch_code $null -account_type $null -account_number $null -account_holder_katakana $null | Out-Null
          # refresh details
          $details = Get-CustomerDetails -id $id
          $settings = $details.settings
        }
      }

      # 2) If billing_method is 'debit' and bank info missing, fill dummy bank info
      if ($settings -ne $null -and $settings.billing_method -eq 'debit') {
        if (Is-MissingBankInfo -settings $settings) {
          $dummy = Generate-DummyBankInfo -id $id
          Write-Host "[BANK] Fill dummy bank info for customer ${id}: bank=$($dummy.bank_code) branch=$($dummy.branch_code) acct=$($dummy.account_number)" -ForegroundColor Green
          Put-Settings -id $id -billing_method 'debit' -rounding_enabled $rounding -bank_code $dummy.bank_code -branch_code $dummy.branch_code -account_type $dummy.account_type -account_number $dummy.account_number -account_holder_katakana $dummy.account_holder_katakana | Out-Null
        }
      }
    }
    $Processed += $paged.items.Count
    Write-Host "Processed $Processed / $($paged.total) customers so far..." -ForegroundColor Cyan
    if ($Processed -ge $paged.total) { break }
    $Page += 1
  }
  Write-Host "Bulk update completed. Processed $Processed customers." -ForegroundColor Cyan
} catch {
  Write-Host "Error during bulk update: $($_.Exception.Message)" -ForegroundColor Red
  throw
}