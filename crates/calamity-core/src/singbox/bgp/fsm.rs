use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::codec;
use crate::singbox::rules_storage::RulesData;

const BGP_MARKER: [u8; 16] = [0xff; 16];
const BGP_VERSION: u8 = 4;
const BGP_ASN: u16 = 64512;
const BGP_HOLD_TIME: u16 = 60;

const MSG_OPEN: u8 = 1;
const MSG_UPDATE: u8 = 2;
const MSG_NOTIFICATION: u8 = 3;
const MSG_KEEPALIVE: u8 = 4;

const CALAMITY_AFI: u16 = 99;
const CALAMITY_SAFI: u8 = 1;

#[derive(Debug, Clone)]
pub struct PullResult {
    pub remote_rules: RulesData,
}

/// Build a BGP OPEN message.
fn build_open(router_id: [u8; 4]) -> Vec<u8> {
    let cap_mp_reach: Vec<u8> = vec![
        2, 4,
        (CALAMITY_AFI >> 8) as u8, (CALAMITY_AFI & 0xff) as u8,
        0, CALAMITY_SAFI,
    ];
    let opt_param: Vec<u8> = {
        let mut p = vec![2];
        p.push(cap_mp_reach.len() as u8);
        p.extend_from_slice(&cap_mp_reach);
        p
    };

    let open_len = 10 + opt_param.len();
    let total_len = 19 + open_len;

    let mut msg = Vec::with_capacity(total_len);
    msg.extend_from_slice(&BGP_MARKER);
    msg.extend_from_slice(&(total_len as u16).to_be_bytes());
    msg.push(MSG_OPEN);
    msg.push(BGP_VERSION);
    msg.extend_from_slice(&BGP_ASN.to_be_bytes());
    msg.extend_from_slice(&BGP_HOLD_TIME.to_be_bytes());
    msg.extend_from_slice(&router_id);
    msg.push(opt_param.len() as u8);
    msg.extend_from_slice(&opt_param);
    msg
}

/// Build a BGP KEEPALIVE message.
fn build_keepalive() -> Vec<u8> {
    let mut msg = Vec::with_capacity(19);
    msg.extend_from_slice(&BGP_MARKER);
    msg.extend_from_slice(&19u16.to_be_bytes());
    msg.push(MSG_KEEPALIVE);
    msg
}

/// Build a BGP UPDATE carrying Calamity rule entries via MP_REACH_NLRI (AFI=99/SAFI=1).
fn build_update(entries: &[(Vec<u8>, Vec<u8>)]) -> Vec<u8> {
    let mut nlri_blob = Vec::new();
    for (key, payload) in entries {
        nlri_blob.extend_from_slice(&(key.len() as u16).to_be_bytes());
        nlri_blob.extend_from_slice(key);
        nlri_blob.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        nlri_blob.extend_from_slice(payload);
    }

    let mut mp_reach = Vec::new();
    mp_reach.extend_from_slice(&CALAMITY_AFI.to_be_bytes());
    mp_reach.push(CALAMITY_SAFI);
    mp_reach.push(0); // next hop length
    mp_reach.push(0); // reserved
    mp_reach.extend_from_slice(&nlri_blob);

    let attr_flags: u8 = 0x80 | 0x40 | 0x10; // optional, transitive, extended length
    let mut path_attrs = Vec::new();
    path_attrs.push(attr_flags);
    path_attrs.push(14); // MP_REACH_NLRI
    path_attrs.extend_from_slice(&(mp_reach.len() as u16).to_be_bytes());
    path_attrs.extend_from_slice(&mp_reach);

    let update_body_len = 2 + 2 + path_attrs.len();
    let total_len = 19 + update_body_len;

    let mut msg = Vec::with_capacity(total_len);
    msg.extend_from_slice(&BGP_MARKER);
    msg.extend_from_slice(&(total_len as u16).to_be_bytes());
    msg.push(MSG_UPDATE);
    msg.extend_from_slice(&0u16.to_be_bytes()); // withdrawn routes length
    msg.extend_from_slice(&(path_attrs.len() as u16).to_be_bytes());
    msg.extend_from_slice(&path_attrs);
    msg
}

/// Parse entries from a received UPDATE message body.
fn parse_update_entries(update_body: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, String> {
    if update_body.len() < 4 {
        return Err("UPDATE too short".to_string());
    }
    let withdrawn_len = u16::from_be_bytes([update_body[0], update_body[1]]) as usize;
    let pos = 2 + withdrawn_len;
    if pos + 2 > update_body.len() {
        return Err("UPDATE truncated at path attr length".to_string());
    }
    let path_attr_len = u16::from_be_bytes([update_body[pos], update_body[pos + 1]]) as usize;
    let attr_start = pos + 2;
    let attr_end = attr_start + path_attr_len;
    if attr_end > update_body.len() {
        return Err("UPDATE path attributes exceed message".to_string());
    }

    let mut apos = attr_start;
    while apos < attr_end {
        if apos + 2 > attr_end { break; }
        let flags = update_body[apos];
        let attr_type = update_body[apos + 1];
        apos += 2;

        let extended = flags & 0x10 != 0;
        let attr_len = if extended {
            if apos + 2 > attr_end {
                return Err("truncated extended attr length".to_string());
            }
            let l = u16::from_be_bytes([update_body[apos], update_body[apos + 1]]) as usize;
            apos += 2;
            l
        } else {
            if apos >= attr_end {
                return Err("truncated attr length".to_string());
            }
            let l = update_body[apos] as usize;
            apos += 1;
            l
        };

        if attr_type == 14 {
            let attr_data = &update_body[apos..apos + attr_len];
            if attr_data.len() < 5 {
                return Err("MP_REACH_NLRI too short".to_string());
            }
            let afi = u16::from_be_bytes([attr_data[0], attr_data[1]]);
            let safi = attr_data[2];
            if afi != CALAMITY_AFI || safi != CALAMITY_SAFI {
                apos += attr_len;
                continue;
            }
            let nh_len = attr_data[3] as usize;
            let nlri_start = 4 + nh_len + 1;
            if nlri_start > attr_data.len() {
                return Err("MP_REACH_NLRI NH exceeds data".to_string());
            }
            return parse_nlri_blob(&attr_data[nlri_start..]);
        }

        apos += attr_len;
    }

    Ok(vec![])
}

fn parse_nlri_blob(data: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, String> {
    let mut entries = Vec::new();
    let mut pos = 0;

    while pos < data.len() {
        if pos + 2 > data.len() {
            return Err("truncated NLRI key length".to_string());
        }
        let key_len = u16::from_be_bytes([data[pos], data[pos + 1]]) as usize;
        pos += 2;
        if pos + key_len > data.len() {
            return Err("NLRI key exceeds data".to_string());
        }
        let key = data[pos..pos + key_len].to_vec();
        pos += key_len;

        if pos + 4 > data.len() {
            return Err("truncated NLRI payload length".to_string());
        }
        let payload_len = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        pos += 4;
        if pos + payload_len > data.len() {
            return Err("NLRI payload exceeds data".to_string());
        }
        let payload = data[pos..pos + payload_len].to_vec();
        pos += payload_len;

        entries.push((key, payload));
    }

    Ok(entries)
}

/// Read one BGP message from stream. Returns (type, body).
async fn read_message(stream: &mut TcpStream) -> Result<(u8, Vec<u8>), String> {
    let mut header = [0u8; 19];
    stream.read_exact(&mut header).await.map_err(|e| format!("read header: {e}"))?;

    if header[0..16] != BGP_MARKER {
        return Err("invalid BGP marker".to_string());
    }

    let length = u16::from_be_bytes([header[16], header[17]]) as usize;
    let msg_type = header[18];

    if length < 19 {
        return Err(format!("invalid BGP message length: {length}"));
    }

    let body_len = length - 19;
    let mut body = vec![0u8; body_len];
    if body_len > 0 {
        stream.read_exact(&mut body).await.map_err(|e| format!("read body: {e}"))?;
    }

    Ok((msg_type, body))
}

/// Pull rules from a remote Calamity peer.
pub async fn pull_rules(peer_addr: &str, local_router_id: [u8; 4]) -> Result<PullResult, String> {
    let addr: std::net::SocketAddr = format!("{peer_addr}:179")
        .parse()
        .map_err(|e| format!("invalid address: {e}"))?;

    let mut stream = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        TcpStream::connect(addr),
    )
    .await
    .map_err(|_| "connection timeout".to_string())?
    .map_err(|e| format!("connect failed: {e}"))?;

    // Send OPEN
    stream.write_all(&build_open(local_router_id)).await.map_err(|e| format!("send OPEN: {e}"))?;

    // Read OPEN
    let (msg_type, _) = read_message(&mut stream).await?;
    if msg_type != MSG_OPEN {
        return Err(format!("expected OPEN, got type {msg_type}"));
    }

    // Send KEEPALIVE
    stream.write_all(&build_keepalive()).await.map_err(|e| format!("send KEEPALIVE: {e}"))?;

    // Read KEEPALIVE
    let (msg_type, _) = read_message(&mut stream).await?;
    if msg_type != MSG_KEEPALIVE {
        return Err(format!("expected KEEPALIVE, got type {msg_type}"));
    }

    eprintln!("[bgp] session established with {peer_addr}");

    let mut all_entries: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();

    loop {
        let read_result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            read_message(&mut stream),
        ).await;

        match read_result {
            Ok(Ok((MSG_UPDATE, body))) => {
                let entries = parse_update_entries(&body)?;
                if entries.is_empty() { break; }
                all_entries.extend(entries);
            }
            Ok(Ok((MSG_KEEPALIVE, _))) => {
                let _ = stream.write_all(&build_keepalive()).await;
            }
            Ok(Ok((MSG_NOTIFICATION, body))) => {
                let code = body.first().copied().unwrap_or(0);
                let subcode = body.get(1).copied().unwrap_or(0);
                return Err(format!("peer sent NOTIFICATION: code={code} subcode={subcode}"));
            }
            Ok(Ok((_, _))) => {}
            Ok(Err(e)) => {
                if all_entries.is_empty() { return Err(e); }
                break;
            }
            Err(_) => {
                if all_entries.is_empty() { return Err("timeout waiting for UPDATE".to_string()); }
                break;
            }
        }
    }

    let remote_rules = codec::decode_rules_data(&all_entries)?;
    eprintln!("[bgp] received {} rules from {peer_addr}", remote_rules.rules.len());
    let _ = stream.shutdown().await;

    Ok(PullResult { remote_rules })
}

/// Handle incoming peer connection — send local rules.
pub async fn serve_rules(mut stream: TcpStream, local_router_id: [u8; 4]) -> Result<(), String> {
    let (msg_type, _) = read_message(&mut stream).await?;
    if msg_type != MSG_OPEN {
        return Err(format!("expected OPEN, got type {msg_type}"));
    }

    stream.write_all(&build_open(local_router_id)).await.map_err(|e| format!("send OPEN: {e}"))?;
    stream.write_all(&build_keepalive()).await.map_err(|e| format!("send KEEPALIVE: {e}"))?;

    let (msg_type, _) = read_message(&mut stream).await?;
    if msg_type != MSG_KEEPALIVE {
        return Err(format!("expected KEEPALIVE, got type {msg_type}"));
    }

    let peer_addr = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
    eprintln!("[bgp] session established with {peer_addr} (serving)");

    let rules_data = crate::singbox::rules_storage::load_rules();
    let syncable = codec::filter_syncable_rules(&rules_data);
    let entries = codec::encode_rules_data(&syncable);

    stream.write_all(&build_update(&entries)).await.map_err(|e| format!("send UPDATE: {e}"))?;
    stream.write_all(&build_update(&[])).await.map_err(|e| format!("send end-of-rib: {e}"))?;

    eprintln!("[bgp] sent {} rules to {peer_addr} ({} process rules filtered)", syncable.rules.len(), rules_data.rules.len() - syncable.rules.len());

    let _ = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        let mut buf = [0u8; 1];
        let _ = stream.read(&mut buf).await;
    }).await;
    let _ = stream.shutdown().await;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_message_format() {
        let msg = build_open([10, 0, 0, 1]);
        assert_eq!(&msg[0..16], &BGP_MARKER);
        assert_eq!(msg[18], MSG_OPEN);
        assert_eq!(msg[19], BGP_VERSION);
        assert_eq!(u16::from_be_bytes([msg[20], msg[21]]), BGP_ASN);
        assert_eq!(u16::from_be_bytes([msg[22], msg[23]]), BGP_HOLD_TIME);
        assert_eq!(&msg[24..28], &[10, 0, 0, 1]);
    }

    #[test]
    fn keepalive_message_format() {
        let msg = build_keepalive();
        assert_eq!(msg.len(), 19);
        assert_eq!(&msg[0..16], &BGP_MARKER);
        assert_eq!(u16::from_be_bytes([msg[16], msg[17]]), 19);
        assert_eq!(msg[18], MSG_KEEPALIVE);
    }

    #[test]
    fn update_roundtrip() {
        let entries = vec![
            (b"key1".to_vec(), b"payload1".to_vec()),
            (b"key2".to_vec(), b"payload2".to_vec()),
        ];
        let msg = build_update(&entries);
        let body = &msg[19..];
        let parsed = parse_update_entries(body).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].0, b"key1");
        assert_eq!(parsed[0].1, b"payload1");
        assert_eq!(parsed[1].0, b"key2");
        assert_eq!(parsed[1].1, b"payload2");
    }

    #[test]
    fn empty_update_is_eor() {
        let msg = build_update(&[]);
        let body = &msg[19..];
        let parsed = parse_update_entries(body).unwrap();
        assert!(parsed.is_empty());
    }
}
