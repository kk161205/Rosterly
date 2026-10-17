# ==============================================================================
# Self-Contained PostgreSQL Integration Smoke Test Runner for Rosterly (§5.13–§5.15)
# ==============================================================================
# Strict Target Requirements:
# - Host:     127.0.0.1 (explicitly 127.0.0.1, no missing host)
# - Port:     5432 (explicitly 5432, no missing port)
# - Database: rosterly_scratch
# - User:     postgres
# ==============================================================================

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 1. Prompt securely for local PostgreSQL password (masked)
Write-Host "=== Rosterly PostgreSQL Integration Smoke Test ===" -ForegroundColor Cyan
$securePass = Read-Host "Enter local PostgreSQL password for postgres@127.0.0.1:5432/rosterly_scratch" -AsSecureString
$plainPass = [System.Net.NetworkCredential]::new("", $securePass).Password

# 2. Preserve original process environment
$origDbUrl = $env:DATABASE_URL
$origPgPass = $env:PGPASSWORD

$executionError = $null

try {
    # 3. Process-scoped temporary credentials (URL-encoded)
    $escapedPass = [System.Uri]::EscapeDataString($plainPass)
    $env:PGPASSWORD = $plainPass
    $env:DATABASE_URL = "postgresql+psycopg2://postgres:$escapedPass@127.0.0.1:5432/rosterly_scratch"

    # 4. Fail-closed target guard: Application Settings & Engine Target
    Write-Host "`n[1/5] Verifying application database target..." -ForegroundColor Yellow
    python -c "from sqlalchemy.engine import make_url; from app.core.config import settings; import sys; u = make_url(settings.DATABASE_URL); print(f'App Target Check: host={u.host}, port={u.port}, db={u.database}, user={u.username}'); valid = (u.host == '127.0.0.1' and u.port == 5432 and u.database == 'rosterly_scratch' and u.username == 'postgres'); sys.exit(0 if valid else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw "Application target guard failed: Effective target is NOT postgres@127.0.0.1:5432/rosterly_scratch. Aborting before database operations."
    }
    Write-Host "Application target verified as postgres@127.0.0.1:5432/rosterly_scratch." -ForegroundColor Green

    # 5. Fail-closed target guard: Alembic Real Migration Target Path
    Write-Host "`n[2/5] Independently verifying Alembic migration target path..." -ForegroundColor Yellow
    python -c "from alembic.config import Config; from sqlalchemy.engine import make_url; from app.core.config import settings; import sys; cfg = Config('alembic.ini'); cfg.set_main_option('sqlalchemy.url', settings.DATABASE_URL); sec = cfg.get_section(cfg.config_ini_section, {}); raw_url = sec.get('sqlalchemy.url') or cfg.get_main_option('sqlalchemy.url'); u = make_url(raw_url); print(f'Alembic Target Check: host={u.host}, port={u.port}, db={u.database}, user={u.username}'); valid = (u.host == '127.0.0.1' and u.port == 5432 and u.database == 'rosterly_scratch' and u.username == 'postgres'); sys.exit(0 if valid else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw "Alembic target guard failed: Effective migration target is NOT postgres@127.0.0.1:5432/rosterly_scratch. Aborting before database operations."
    }
    Write-Host "Alembic migration target verified as postgres@127.0.0.1:5432/rosterly_scratch." -ForegroundColor Green

    # 6. Test connectivity with psql
    Write-Host "`n[3/5] Confirming psql connectivity to rosterly_scratch..." -ForegroundColor Yellow
    & "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
        -h 127.0.0.1 -p 5432 -U postgres -d rosterly_scratch `
        -w -c "SELECT current_database(), current_user, version();"
    if ($LASTEXITCODE -ne 0) {
        throw "psql connection failed with exit code $LASTEXITCODE."
    }
    Write-Host "psql connectivity confirmed." -ForegroundColor Green

    # 7. Apply Alembic migrations to rosterly_scratch only
    Write-Host "`n[4/5] Applying Alembic migrations to rosterly_scratch..." -ForegroundColor Yellow
    python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) {
        throw "Alembic migration failed with exit code $LASTEXITCODE."
    }
    Write-Host "Alembic migrations successfully applied to head (d2b3e4f5a6b7)." -ForegroundColor Green

    # 8. Run PostgreSQL integration smoke tests
    Write-Host "`n[5/5] Running PostgreSQL analytics integration smoke tests..." -ForegroundColor Yellow
    python -m pytest tests/test_analytics_postgres.py -v
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL integration smoke tests failed with exit code $LASTEXITCODE."
    }
    Write-Host "`nAll PostgreSQL integration smoke tests passed successfully!" -ForegroundColor Green

} catch {
    $executionError = $_
    Write-Host "`n[RUNNER ERROR] $executionError" -ForegroundColor Red
} finally {
    # 9. Clean up process environment: restore original values without masking failures
    if ($null -ne $origDbUrl) {
        $env:DATABASE_URL = $origDbUrl
    } else {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }

    if ($null -ne $origPgPass) {
        $env:PGPASSWORD = $origPgPass
    } else {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    $plainPass = $null
    $securePass = $null
    $escapedPass = $null

    Write-Host "`n[Cleanup] Process credentials cleared and original environment restored." -ForegroundColor Gray

    # Re-throw original exception if failure occurred so process exit code accurately reflects failure
    if ($null -ne $executionError) {
        throw $executionError
    }
}
