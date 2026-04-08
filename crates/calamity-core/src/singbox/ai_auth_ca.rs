use std::fs;
use std::path::PathBuf;

use rcgen::{CertificateParams, DnType, IsCa, BasicConstraints, KeyPair, KeyUsagePurpose};

use super::storage::app_data_dir;

const CA_DIR: &str = "ai-auth-ca";
const CA_CERT_FILE: &str = "ca-cert.pem";
const CA_KEY_FILE: &str = "ca-key.pem";

pub fn ca_dir() -> PathBuf {
    app_data_dir().join(CA_DIR)
}

pub fn ca_cert_path() -> PathBuf {
    ca_dir().join(CA_CERT_FILE)
}

pub fn ca_key_path() -> PathBuf {
    ca_dir().join(CA_KEY_FILE)
}

/// Ensure the CA cert + key exist, generating them if missing.
pub fn ensure_ca_exists() -> Result<(), String> {
    let dir = ca_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("create CA dir: {e}"))?;

    if ca_cert_path().exists() && ca_key_path().exists() {
        return Ok(());
    }

    log::info!("generating AI auth CA certificate");

    let mut params =
        CertificateParams::new(Vec::<String>::new()).map_err(|e| format!("cert params: {e}"))?;
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params.distinguished_name.push(DnType::CommonName, "Calamity AI Auth CA");
    params.distinguished_name.push(DnType::OrganizationName, "Calamity");
    params.not_before = time::OffsetDateTime::now_utc();
    params.not_after = time::OffsetDateTime::now_utc() + time::Duration::days(3650);
    params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];

    let key_pair = KeyPair::generate().map_err(|e| format!("keygen: {e}"))?;
    let ca_cert = params
        .self_signed(&key_pair)
        .map_err(|e| format!("self-sign CA: {e}"))?;

    fs::write(ca_cert_path(), ca_cert.pem()).map_err(|e| format!("write CA cert: {e}"))?;
    fs::write(ca_key_path(), key_pair.serialize_pem())
        .map_err(|e| format!("write CA key: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(ca_key_path(), fs::Permissions::from_mode(0o600));
    }

    log::info!("CA certificate generated at {}", ca_cert_path().display());
    Ok(())
}

/// Sign a certificate for the given domain using the CA.
/// Returns (cert_der, key_der).
pub fn sign_domain_cert(domain: &str) -> Result<(Vec<u8>, Vec<u8>), String> {
    let ca_key_pem =
        fs::read_to_string(ca_key_path()).map_err(|e| format!("read CA key: {e}"))?;
    let ca_cert_pem =
        fs::read_to_string(ca_cert_path()).map_err(|e| format!("read CA cert: {e}"))?;

    let ca_key = KeyPair::from_pem(&ca_key_pem).map_err(|e| format!("parse CA key: {e}"))?;
    let ca_issuer = rcgen::Issuer::from_ca_cert_pem(&ca_cert_pem, &ca_key)
        .map_err(|e| format!("CA issuer: {e}"))?;

    let mut params = CertificateParams::new(vec![domain.to_string()])
        .map_err(|e| format!("domain cert params: {e}"))?;
    params.not_before = time::OffsetDateTime::now_utc();
    params.not_after = time::OffsetDateTime::now_utc() + time::Duration::days(365);
    params.distinguished_name.push(DnType::CommonName, domain);

    let domain_key = KeyPair::generate().map_err(|e| format!("domain keygen: {e}"))?;
    let domain_cert = params
        .signed_by(&domain_key, &ca_issuer)
        .map_err(|e| format!("sign domain cert: {e}"))?;
    drop(ca_issuer);

    Ok((domain_cert.der().to_vec(), domain_key.serialize_der()))
}

/// Install the CA certificate into the macOS System Keychain as trusted.
#[cfg(target_os = "macos")]
pub fn install_ca_cert_local() -> Result<(), String> {
    let cert = ca_cert_path();
    if !cert.exists() {
        return Err("CA certificate not found, enable AI auth first".into());
    }

    let output = std::process::Command::new("sudo")
        .args([
            "security",
            "add-trusted-cert",
            "-d",
            "-r",
            "trustRoot",
            "-k",
            "/Library/Keychains/System.keychain",
        ])
        .arg(&cert)
        .output()
        .map_err(|e| format!("exec security: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("security add-trusted-cert failed: {stderr}"));
    }

    log::info!("CA certificate installed and trusted on macOS");
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn install_ca_cert_local() -> Result<(), String> {
    Err("automatic CA install not supported on this platform".into())
}

/// Generate an Apple .mobileconfig profile containing the CA certificate.
pub fn generate_mobileconfig() -> Result<Vec<u8>, String> {
    let cert_pem =
        fs::read_to_string(ca_cert_path()).map_err(|e| format!("read CA cert: {e}"))?;
    let cert_der = pem::parse(&cert_pem).map_err(|e| format!("parse cert: {e}"))?;
    let cert_b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        cert_der.contents(),
    );

    let uuid1 = uuid::Uuid::new_v4();
    let uuid2 = uuid::Uuid::new_v4();

    let mobileconfig = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadCertificateFileName</key>
            <string>calamity-ai-auth-ca.cer</string>
            <key>PayloadContent</key>
            <data>{cert_b64}</data>
            <key>PayloadDescription</key>
            <string>Calamity AI Auth CA Certificate</string>
            <key>PayloadDisplayName</key>
            <string>Calamity AI Auth CA</string>
            <key>PayloadIdentifier</key>
            <string>com.calamity.ai-auth-ca.{uuid1}</string>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadUUID</key>
            <string>{uuid1}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>Calamity AI Auth</string>
    <key>PayloadDescription</key>
    <string>Install this profile to trust the Calamity AI Auth gateway CA certificate.</string>
    <key>PayloadIdentifier</key>
    <string>com.calamity.ai-auth-profile</string>
    <key>PayloadOrganization</key>
    <string>Calamity</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>{uuid2}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>"#
    );

    Ok(mobileconfig.into_bytes())
}
