//! 通过原生接口检查证书，仅在首次安装时请求 Windows 授权。

use std::{ffi::c_void, io, ptr, slice};

use windows_sys::Win32::Security::Cryptography::{
    CertCloseStore, CertEnumCertificatesInStore, CertOpenStore, CERT_STORE_OPEN_EXISTING_FLAG,
    CERT_STORE_PROV_SYSTEM_W, CERT_STORE_READONLY_FLAG, CERT_SYSTEM_STORE_LOCAL_MACHINE,
};

use crate::{Error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{os::windows::process::CommandExt, process::Command};

// 只安装内部生成的证书内容，不接收前端命令或提升整个应用的权限。
pub(super) fn install(cert: &str) -> Result<()> {
    let encoded_cert = STANDARD.encode(certificate_der(cert)?);
    let script = format!(
        "$ErrorActionPreference='Stop'; $store=New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine'); try {{ $store.Open('ReadWrite'); $cert=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,[Convert]::FromBase64String('{encoded_cert}')); $store.Add($cert) }} finally {{ $store.Close() }}"
    );
    let encoded_script = STANDARD.encode(
        script
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>(),
    );
    let launcher = format!(
        "$ErrorActionPreference='Stop'; try {{ $p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile -NonInteractive -EncodedCommand {encoded_script}'; exit $p.ExitCode }} catch {{ exit 1 }}"
    );
    let system_root = std::env::var_os("SystemRoot")
        .ok_or_else(|| Error::Config("无法定位 Windows 系统目录".into()))?;
    let status = Command::new(
        std::path::PathBuf::from(system_root)
            .join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    )
    .args(["-NoProfile", "-NonInteractive", "-Command", &launcher])
    .creation_flags(0x08000000)
    .status()?;
    if !status.success() || !is_installed(cert)? {
        return Err(Error::Config(
            "证书授权被取消或安装失败，请点击连接重试，并在 Windows 提示中选择“是”".into(),
        ));
    }
    Ok(())
}

const ROOT_STORE: [u16; 5] = [b'R' as u16, b'O' as u16, b'O' as u16, b'T' as u16, 0];

pub(super) fn is_installed(cert: &str) -> Result<bool> {
    let der = certificate_der(cert)?;
    let store = open_root_store()?;
    let mut context = ptr::null();
    let mut found = false;
    loop {
        context = unsafe { CertEnumCertificatesInStore(store, context) };
        if context.is_null() {
            break;
        }
        let encoded = unsafe {
            slice::from_raw_parts((*context).pbCertEncoded, (*context).cbCertEncoded as usize)
        };
        if encoded == der {
            found = true;
            break;
        }
    }
    if !context.is_null() {
        unsafe { windows_sys::Win32::Security::Cryptography::CertFreeCertificateContext(context) };
    }
    close_store(store)?;
    Ok(found)
}

fn certificate_der(cert: &str) -> Result<Vec<u8>> {
    pem::parse(cert)
        .map(|pem| pem.into_contents())
        .map_err(|error| Error::Config(format!("parse CA PEM: {error}")))
}

fn open_root_store() -> Result<*mut c_void> {
    let flags =
        CERT_SYSTEM_STORE_LOCAL_MACHINE | CERT_STORE_OPEN_EXISTING_FLAG | CERT_STORE_READONLY_FLAG;
    let store = unsafe {
        CertOpenStore(
            CERT_STORE_PROV_SYSTEM_W,
            0,
            0,
            flags,
            ROOT_STORE.as_ptr().cast(),
        )
    };
    if store.is_null() {
        return Err(Error::Config(format!(
            "open Windows LocalMachine Root store: {}",
            io::Error::last_os_error()
        )));
    }
    Ok(store)
}

fn close_store(store: *mut c_void) -> Result<()> {
    if unsafe { CertCloseStore(store, 0) } == 0 {
        return Err(Error::Config(format!(
            "close Windows certificate store: {}",
            io::Error::last_os_error()
        )));
    }
    Ok(())
}
