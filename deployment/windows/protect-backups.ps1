param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory
)

$resolved = [System.IO.Path]::GetFullPath($BackupDirectory)
if (-not $resolved.StartsWith('E:\WSL-Backups\DA-System-SC', [StringComparison]::OrdinalIgnoreCase)) {
    throw '拒绝修改预期目录以外的 ACL。'
}

New-Item -ItemType Directory -Path $resolved -Force | Out-Null
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$directoryArguments = @(
    $resolved,
    '/inheritance:r',
    '/grant:r',
    "${currentUser}`:(OI)(CI)F",
    'SYSTEM:(OI)(CI)F',
    'BUILTIN\Administrators:(OI)(CI)F'
)
& icacls.exe @directoryArguments | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw '备份目录 ACL 收紧失败。'
}

# 已存在文件不能使用仅适合目录继承的 OI/CI 标记，否则可能得到空 ACL。
$children = Get-ChildItem -LiteralPath $resolved -Force -Recurse -ErrorAction Stop
foreach ($child in $children) {
    $grant = if ($child.PSIsContainer) {
        @(
            "${currentUser}`:(OI)(CI)F",
            'SYSTEM:(OI)(CI)F',
            'BUILTIN\Administrators:(OI)(CI)F'
        )
    } else {
        @(
            "${currentUser}`:F",
            'SYSTEM:F',
            'BUILTIN\Administrators:F'
        )
    }
    & icacls.exe $child.FullName /inheritance:r /grant:r $grant | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "备份项 ACL 收紧失败：$($child.FullName)"
    }
}
