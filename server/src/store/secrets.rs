//! Windows 使用当前系统账户的 DPAPI 保护落盘凭据。
use crate::Result;

#[cfg(windows)]
mod windows {
    use crate::{Error, Result};
    use base64::{engine::general_purpose::STANDARD, Engine};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };

    const PREFIX: &str = "bmapi-dpapi:";

    fn transform(input: &[u8], protect: bool) -> Result<Vec<u8>> {
        let source = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        // 系统分配输出内存，复制后必须通过 LocalFree 释放。
        unsafe {
            let ok = if protect {
                CryptProtectData(
                    &source,
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &source,
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            };
            if ok == 0 {
                return Err(Error::Config(
                    "无法访问系统保护的 Key，请在当前系统账户下重新配置".into(),
                ));
            }
            let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            LocalFree(output.pbData.cast());
            Ok(bytes)
        }
    }

    pub fn seal(value: &str) -> Result<String> {
        Ok(format!(
            "{PREFIX}{}",
            STANDARD.encode(transform(value.as_bytes(), true)?)
        ))
    }

    pub fn open(value: &str) -> Result<String> {
        let encoded = value
            .strip_prefix(PREFIX)
            .ok_or_else(|| Error::Config("Key 未使用系统加密保存，请重新配置".into()))?;
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| Error::Config("本地 Key 数据损坏，请重新配置".into()))?;
        String::from_utf8(transform(&bytes, false)?)
            .map_err(|_| Error::Config("本地 Key 数据无效".into()))
    }
}

pub fn seal(value: &str) -> Result<String> {
    #[cfg(windows)]
    {
        windows::seal(value)
    }
    // 非 Windows 保持原项目本地存储行为；本定制版只提供 Windows 安装包。
    #[cfg(not(windows))]
    {
        Ok(value.to_owned())
    }
}

pub fn open(value: &str) -> Result<String> {
    #[cfg(windows)]
    {
        windows::open(value)
    }
    #[cfg(not(windows))]
    {
        Ok(value.to_owned())
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn credential_round_trip_is_encrypted() {
        let stored = super::seal("test-only-secret").unwrap();
        assert!(!stored.contains("test-only-secret"));
        assert_eq!(super::open(&stored).unwrap(), "test-only-secret");
        assert!(super::open("bmapi-dpapi:invalid!").is_err());
    }
}
