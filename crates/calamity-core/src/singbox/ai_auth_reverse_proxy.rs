//! HTTPS reverse proxy for AI auth header injection.
//!
//! Listens on a local port, accepts TLS connections with AI API SNIs,
//! terminates TLS (using CA-signed certs), reads HTTP requests, injects
//! auth headers, then forwards to the real API via sing-box SOCKS proxy.

use std::collections::HashMap;
use std::io;
use std::net::SocketAddr;
use std::sync::Arc;

use rustls::ServerConfig;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{watch, Mutex};
use tokio_rustls::TlsAcceptor;

use super::ai_auth_ca;
use super::ai_auth_storage::AiAuthSettings;

/// A running AI auth reverse proxy instance.
pub struct AiAuthProxy {
    shutdown_tx: watch::Sender<bool>,
}

impl AiAuthProxy {
    /// Start the reverse proxy.
    pub async fn start(settings: AiAuthSettings) -> Result<Self, String> {
        ai_auth_ca::ensure_ca_exists()?;

        let bind_addr: SocketAddr = format!("0.0.0.0:{}", settings.proxy_port)
            .parse()
            .map_err(|e| format!("invalid bind addr: {e}"))?;

        let listener = TcpListener::bind(bind_addr)
            .await
            .map_err(|e| format!("bind {bind_addr}: {e}"))?;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let cert_cache: Arc<Mutex<HashMap<String, Arc<ServerConfig>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let settings = Arc::new(settings);

        log::info!("AI auth reverse proxy listening on {bind_addr}");

        // CA distribution HTTP server on port 8900
        let ca_shutdown = shutdown_rx.clone();
        tokio::spawn(async move {
            if let Err(e) = run_ca_http_server(ca_shutdown).await {
                log::error!("CA HTTP server error: {e}");
            }
        });

        let mut rx = shutdown_rx;
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept = listener.accept() => {
                        match accept {
                            Ok((stream, peer)) => {
                                let settings = settings.clone();
                                let cache = cert_cache.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_connection(
                                        stream, peer, settings, cache,
                                    ).await {
                                        log::warn!("AI proxy {peer}: {e}");
                                    }
                                });
                            }
                            Err(e) => log::error!("AI proxy accept: {e}"),
                        }
                    }
                    _ = rx.changed() => {
                        if *rx.borrow() { break; }
                    }
                }
            }
            log::info!("AI auth reverse proxy stopped");
        });

        Ok(Self { shutdown_tx })
    }

    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
    }
}

/// Handle a single inbound connection.
async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    settings: Arc<AiAuthSettings>,
    cert_cache: Arc<Mutex<HashMap<String, Arc<ServerConfig>>>>,
) -> Result<(), String> {
    // Peek at TLS ClientHello to extract SNI
    let mut buf = [0u8; 4096];
    let stream = stream.into_std().map_err(|e| format!("into_std: {e}"))?;
    stream
        .set_nonblocking(false)
        .map_err(|e| format!("set_blocking: {e}"))?;
    let n = (&stream).peek(&mut buf).map_err(|e| format!("peek: {e}"))?;
    stream
        .set_nonblocking(true)
        .map_err(|e| format!("set_nonblocking: {e}"))?;
    let stream =
        TcpStream::from_std(stream).map_err(|e| format!("from_std: {e}"))?;

    let sni = extract_sni(&buf[..n]).unwrap_or_default();

    // Only reverse-proxy configured AI domains; tunnel everything else
    let service = settings.find_service_for_host(&sni);
    if service.is_none() {
        // Not an AI domain — TCP tunnel to the real server via SOCKS
        return tunnel_passthrough(stream, &sni).await;
    }

    let service = service.unwrap();
    let auth_header = service.auth_header();

    // Get or create TLS server config for this domain
    let tls_config = get_or_create_tls_config(&sni, &cert_cache).await?;
    let acceptor = TlsAcceptor::from(tls_config);

    // TLS handshake with client
    let tls_stream = acceptor
        .accept(stream)
        .await
        .map_err(|e| format!("TLS accept: {e}"))?;

    let (mut client_reader, mut client_writer) = tokio::io::split(tls_stream);

    // Read the HTTP request from the client
    let mut req_buf = Vec::with_capacity(8192);
    let mut tmp = [0u8; 8192];
    loop {
        let n = client_reader
            .read(&mut tmp)
            .await
            .map_err(|e| format!("read req: {e}"))?;
        if n == 0 {
            return Err("client closed before sending request".into());
        }
        req_buf.extend_from_slice(&tmp[..n]);
        // Check for end of headers
        if req_buf
            .windows(4)
            .any(|w| w == b"\r\n\r\n")
        {
            break;
        }
        if req_buf.len() > 64 * 1024 {
            return Err("request headers too large".into());
        }
    }

    // Split headers from body (if any body bytes were read)
    let header_end = req_buf
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .unwrap()
        + 4;
    let (header_bytes, body_start) = req_buf.split_at(header_end);
    let header_str =
        String::from_utf8_lossy(header_bytes).to_string();

    // Inject auth header
    let modified_headers = if let Some((name, value)) = &auth_header {
        inject_header(&header_str, name, value)
    } else {
        header_str
    };

    // Connect to real API directly — the connection originates from the
    // gateway machine so DNS won't hit the predefined rule (source_ip
    // exclusion), and sing-box routes it according to the user's rules.
    let upstream_tcp = TcpStream::connect(format!("{sni}:443"))
        .await
        .map_err(|e| format!("connect to {sni}: {e}"))?;

    // TLS to real server
    let mut root_store = rustls::RootCertStore::empty();
    for cert in rustls_native_certs::load_native_certs().certs {
        let _ = root_store.add(cert);
    }
    let client_config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    let connector = tokio_rustls::TlsConnector::from(Arc::new(client_config));
    let server_name = rustls::pki_types::ServerName::try_from(sni.clone())
        .map_err(|e| format!("server name: {e}"))?;
    let mut upstream_tls = connector
        .connect(server_name, upstream_tcp)
        .await
        .map_err(|e| format!("upstream TLS: {e}"))?;

    // Send modified request to upstream
    upstream_tls
        .write_all(modified_headers.as_bytes())
        .await
        .map_err(|e| format!("write headers: {e}"))?;
    if !body_start.is_empty() {
        upstream_tls
            .write_all(body_start)
            .await
            .map_err(|e| format!("write body start: {e}"))?;
    }

    // Bidirectional copy: client <-> upstream
    let (mut upstream_reader, mut upstream_writer) = tokio::io::split(upstream_tls);

    let client_to_upstream = async {
        tokio::io::copy(&mut client_reader, &mut upstream_writer).await
    };
    let upstream_to_client = async {
        tokio::io::copy(&mut upstream_reader, &mut client_writer).await
    };

    tokio::select! {
        r = client_to_upstream => { r.map_err(|e| format!("c→s: {e}"))?; }
        r = upstream_to_client => { r.map_err(|e| format!("s→c: {e}"))?; }
    }

    log::info!("AI proxy: {peer} → {sni} (auth injected)");
    Ok(())
}

/// TCP tunnel for non-AI domains (no TLS termination).
async fn tunnel_passthrough(
    mut client: TcpStream,
    sni: &str,
) -> Result<(), String> {
    if sni.is_empty() {
        return Err("no SNI, dropping connection".into());
    }
    let mut upstream = TcpStream::connect(format!("{sni}:443"))
        .await
        .map_err(|e| format!("tunnel connect {sni}: {e}"))?;
    tokio::io::copy_bidirectional(&mut client, &mut upstream)
        .await
        .map_err(|e| format!("tunnel copy: {e}"))?;
    Ok(())
}

/// Get or create a TLS ServerConfig with a CA-signed cert for the domain.
async fn get_or_create_tls_config(
    domain: &str,
    cache: &Mutex<HashMap<String, Arc<ServerConfig>>>,
) -> Result<Arc<ServerConfig>, String> {
    {
        let guard = cache.lock().await;
        if let Some(config) = guard.get(domain) {
            return Ok(config.clone());
        }
    }

    let (cert_der, key_der) = ai_auth_ca::sign_domain_cert(domain)?;

    let cert = rustls::pki_types::CertificateDer::from(cert_der);
    let key = rustls::pki_types::PrivateKeyDer::try_from(key_der)
        .map_err(|e| format!("parse key DER: {e}"))?;

    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert], key)
        .map_err(|e| format!("server config: {e}"))?;
    let config = Arc::new(config);

    cache
        .lock()
        .await
        .insert(domain.to_string(), config.clone());
    Ok(config)
}

/// Extract SNI from a TLS ClientHello.
fn extract_sni(buf: &[u8]) -> Option<String> {
    // TLS record: type=0x16 (handshake), version, length
    if buf.len() < 5 || buf[0] != 0x16 {
        return None;
    }
    let record_len = u16::from_be_bytes([buf[3], buf[4]]) as usize;
    if buf.len() < 5 + record_len {
        return None;
    }
    let hs = &buf[5..5 + record_len];
    // Handshake: type=0x01 (ClientHello)
    if hs.is_empty() || hs[0] != 0x01 {
        return None;
    }
    let hs_len = u32::from_be_bytes([0, hs[1], hs[2], hs[3]]) as usize;
    if hs.len() < 4 + hs_len {
        return None;
    }
    let ch = &hs[4..4 + hs_len];
    // Skip: version(2) + random(32) + session_id(1+len) + cipher_suites(2+len) + compression(1+len)
    let mut pos = 2 + 32;
    if pos >= ch.len() {
        return None;
    }
    let sid_len = ch[pos] as usize;
    pos += 1 + sid_len;
    if pos + 2 > ch.len() {
        return None;
    }
    let cs_len = u16::from_be_bytes([ch[pos], ch[pos + 1]]) as usize;
    pos += 2 + cs_len;
    if pos >= ch.len() {
        return None;
    }
    let comp_len = ch[pos] as usize;
    pos += 1 + comp_len;
    // Extensions
    if pos + 2 > ch.len() {
        return None;
    }
    let ext_len = u16::from_be_bytes([ch[pos], ch[pos + 1]]) as usize;
    pos += 2;
    let ext_end = pos + ext_len;
    while pos + 4 <= ext_end && pos + 4 <= ch.len() {
        let ext_type = u16::from_be_bytes([ch[pos], ch[pos + 1]]);
        let ext_data_len = u16::from_be_bytes([ch[pos + 2], ch[pos + 3]]) as usize;
        pos += 4;
        if ext_type == 0x0000 {
            // SNI extension
            if ext_data_len >= 5 && pos + ext_data_len <= ch.len() {
                let sni_data = &ch[pos..pos + ext_data_len];
                // list_len(2) + type(1) + name_len(2) + name
                let name_len =
                    u16::from_be_bytes([sni_data[3], sni_data[4]]) as usize;
                if 5 + name_len <= sni_data.len() {
                    return String::from_utf8(sni_data[5..5 + name_len].to_vec()).ok();
                }
            }
            return None;
        }
        pos += ext_data_len;
    }
    None
}

/// Inject a header into raw HTTP request headers.
/// Replaces existing header if present, otherwise inserts before the blank line.
fn inject_header(headers: &str, name: &str, value: &str) -> String {
    let mut lines: Vec<&str> = headers.lines().collect();
    let name_lower = name.to_lowercase();

    // Remove existing header with same name
    lines.retain(|line| {
        !line.to_lowercase().starts_with(&format!("{name_lower}:"))
    });

    // Insert new header before the empty line (end of headers)
    let new_header = format!("{name}: {value}");
    // Find the last non-empty line position
    if let Some(pos) = lines.iter().rposition(|l| !l.is_empty()) {
        lines.insert(pos + 1, &new_header);
    }

    let mut result = lines.join("\r\n");
    if !result.ends_with("\r\n\r\n") {
        result.push_str("\r\n");
    }
    result
}

/// Simple HTTP server for CA certificate distribution.
async fn run_ca_http_server(mut shutdown: watch::Receiver<bool>) -> Result<(), String> {
    let listener = TcpListener::bind("0.0.0.0:8900")
        .await
        .map_err(|e| format!("bind CA HTTP: {e}"))?;
    log::info!("CA distribution server on http://0.0.0.0:8900");

    loop {
        tokio::select! {
            accept = listener.accept() => {
                if let Ok((stream, _)) = accept {
                    tokio::spawn(async move {
                        if let Err(e) = handle_ca_http(stream).await {
                            log::warn!("CA HTTP: {e}");
                        }
                    });
                }
            }
            _ = shutdown.changed() => {
                if *shutdown.borrow() { break; }
            }
        }
    }
    Ok(())
}

async fn handle_ca_http(mut stream: TcpStream) -> io::Result<()> {
    let mut buf = [0u8; 2048];
    let n = stream.read(&mut buf).await?;
    let req = String::from_utf8_lossy(&buf[..n]);

    let (status, content_type, body) = if req.starts_with("GET /ca.mobileconfig") {
        match ai_auth_ca::generate_mobileconfig() {
            Ok(data) => (
                "200 OK",
                "application/x-apple-aspen-config",
                data,
            ),
            Err(e) => (
                "500 Internal Server Error",
                "text/plain",
                e.into_bytes(),
            ),
        }
    } else if req.starts_with("GET /ca.pem") {
        match std::fs::read(ai_auth_ca::ca_cert_path()) {
            Ok(data) => ("200 OK", "application/x-pem-file", data),
            Err(e) => (
                "500 Internal Server Error",
                "text/plain",
                e.to_string().into_bytes(),
            ),
        }
    } else {
        let html = ca_install_page();
        ("200 OK", "text/html; charset=utf-8", html.into_bytes())
    };

    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.write_all(&body).await?;
    Ok(())
}

fn ca_install_page() -> String {
    let lan_ip = crate::platform::get_lan_ip().unwrap_or_else(|| "gateway-ip".into());
    format!(
        r#"<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calamity AI Auth - Install CA Certificate</title>
<style>body{{font-family:system-ui;max-width:600px;margin:40px auto;padding:0 20px;line-height:1.6}}
h1{{color:#333}}a{{color:#0066cc}}code{{background:#f4f4f4;padding:2px 6px;border-radius:3px}}</style>
</head><body>
<h1>Calamity AI Auth</h1>
<p>Install the CA certificate to enable AI API authentication through this gateway.</p>
<h2>Apple (macOS / iOS)</h2>
<p><a href="/ca.mobileconfig">Download Configuration Profile</a> — open it, then go to Settings → General → Profiles to install and trust.</p>
<h2>Other Platforms</h2>
<p><a href="/ca.pem">Download CA Certificate (PEM)</a></p>
<h3>Linux</h3>
<pre><code>curl http://{lan_ip}:8900/ca.pem | sudo tee /usr/local/share/ca-certificates/calamity.crt
sudo update-ca-certificates</code></pre>
<h3>Windows</h3>
<p>Download the PEM file, rename to <code>.crt</code>, double-click → Install → Place in "Trusted Root Certification Authorities".</p>
</body></html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_sni_from_client_hello() {
        // Minimal TLS 1.2 ClientHello with SNI=api.openai.com
        let sni = "api.openai.com";
        let hello = build_test_client_hello(sni);
        assert_eq!(extract_sni(&hello), Some(sni.to_string()));
    }

    #[test]
    fn extract_sni_no_sni() {
        assert_eq!(extract_sni(&[0x16, 0x03, 0x01, 0x00, 0x00]), None);
    }

    #[test]
    fn inject_header_adds_new() {
        let headers = "GET /v1/models HTTP/1.1\r\nHost: api.openai.com\r\n\r\n";
        let result = inject_header(headers, "Authorization", "Bearer sk-test");
        assert!(result.contains("Authorization: Bearer sk-test\r\n"));
        assert!(result.contains("Host: api.openai.com"));
    }

    #[test]
    fn inject_header_replaces_existing() {
        let headers =
            "GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Bearer old\r\n\r\n";
        let result = inject_header(headers, "Authorization", "Bearer new");
        assert!(result.contains("Authorization: Bearer new"));
        assert!(!result.contains("Bearer old"));
    }

    /// Build a minimal TLS ClientHello with the given SNI.
    fn build_test_client_hello(sni: &str) -> Vec<u8> {
        let sni_bytes = sni.as_bytes();
        // SNI extension: type(0x0000) + length + list_length + host_type(0) + name_length + name
        let sni_ext_data_len = 2 + 1 + 2 + sni_bytes.len();
        let sni_ext_len = 4 + sni_ext_data_len;

        // Extensions block
        let ext_total_len = sni_ext_len;

        // ClientHello body: version(2) + random(32) + session_id_len(1) + cipher_suites_len(2) + cipher(2) + comp_len(1) + comp(1) + ext_len(2) + ext
        let ch_len = 2 + 32 + 1 + 2 + 2 + 1 + 1 + 2 + ext_total_len;

        let mut ch = Vec::new();
        ch.extend_from_slice(&[0x03, 0x03]); // TLS 1.2
        ch.extend_from_slice(&[0u8; 32]); // random
        ch.push(0); // session_id length = 0
        ch.extend_from_slice(&2u16.to_be_bytes()); // cipher suites length
        ch.extend_from_slice(&[0x00, 0x2f]); // TLS_RSA_WITH_AES_128_CBC_SHA
        ch.push(1); // compression methods length
        ch.push(0); // null compression
        ch.extend_from_slice(&(ext_total_len as u16).to_be_bytes());
        // SNI extension
        ch.extend_from_slice(&0u16.to_be_bytes()); // ext type = SNI
        ch.extend_from_slice(&(sni_ext_data_len as u16).to_be_bytes());
        ch.extend_from_slice(&((sni_ext_data_len - 2) as u16).to_be_bytes()); // list length
        ch.push(0); // host name type
        ch.extend_from_slice(&(sni_bytes.len() as u16).to_be_bytes());
        ch.extend_from_slice(sni_bytes);

        // Handshake: type(1) + length(3) + body
        let mut hs = Vec::new();
        hs.push(0x01); // ClientHello
        let hs_len = ch.len() as u32;
        hs.push((hs_len >> 16) as u8);
        hs.push((hs_len >> 8) as u8);
        hs.push(hs_len as u8);
        hs.extend_from_slice(&ch);

        // TLS record: type(0x16) + version(2) + length(2) + handshake
        let mut record = Vec::new();
        record.push(0x16);
        record.extend_from_slice(&[0x03, 0x01]); // TLS 1.0 record version
        record.extend_from_slice(&(hs.len() as u16).to_be_bytes());
        record.extend_from_slice(&hs);

        record
    }
}
