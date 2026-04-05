use crate::singbox::rules_storage::{RouteRuleConfig, RulesData};

// TLV field types for rule encoding
const FIELD_ID: u8 = 1;
const FIELD_NAME: u8 = 2;
const FIELD_ENABLED: u8 = 3;
const FIELD_MATCH_TYPE: u8 = 4;
const FIELD_MATCH_VALUE: u8 = 5;
const FIELD_OUTBOUND: u8 = 6;
const FIELD_OUTBOUND_NODE: u8 = 7;
const FIELD_RULE_SET_URL: u8 = 8;
const FIELD_DOWNLOAD_DETOUR: u8 = 9;
const FIELD_INVERT: u8 = 10;
const FIELD_ORDER: u8 = 11;
const FIELD_RULE_SET_LOCAL_PATH: u8 = 12;

/// Magic bytes to identify a RulesData metadata entry
const METADATA_MARKER: &[u8] = b"__META__";

const FIELD_FINAL_OUTBOUND: u8 = 20;
const FIELD_FINAL_OUTBOUND_NODE: u8 = 21;
const FIELD_UPDATE_INTERVAL: u8 = 22;

/// Process-level match types that are machine-specific and should not be synced via BGP.
const PROCESS_MATCH_TYPES: &[&str] = &["process-name", "process-path", "process-path-regex"];

/// Filter out process-level rules that are machine-specific and shouldn't be synced.
pub fn filter_syncable_rules(data: &RulesData) -> RulesData {
    RulesData {
        rules: data
            .rules
            .iter()
            .filter(|r| !PROCESS_MATCH_TYPES.contains(&r.match_type.as_str()))
            .cloned()
            .collect(),
        final_outbound: data.final_outbound.clone(),
        final_outbound_node: data.final_outbound_node.clone(),
        update_interval: data.update_interval,
    }
}

// --- TLV helpers ---

fn write_tlv_str(buf: &mut Vec<u8>, field_type: u8, value: &str) {
    let bytes = value.as_bytes();
    buf.push(field_type);
    buf.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    buf.extend_from_slice(bytes);
}

fn write_tlv_bool(buf: &mut Vec<u8>, field_type: u8, value: bool) {
    buf.push(field_type);
    buf.extend_from_slice(&1u16.to_be_bytes());
    buf.push(if value { 1 } else { 0 });
}

fn write_tlv_u32(buf: &mut Vec<u8>, field_type: u8, value: u32) {
    buf.push(field_type);
    buf.extend_from_slice(&4u16.to_be_bytes());
    buf.extend_from_slice(&value.to_be_bytes());
}

/// Encode a single rule into a TLV byte buffer.
pub fn encode_rule(rule: &RouteRuleConfig) -> Vec<u8> {
    let mut buf = Vec::new();
    write_tlv_str(&mut buf, FIELD_ID, &rule.id);
    write_tlv_str(&mut buf, FIELD_NAME, &rule.name);
    write_tlv_bool(&mut buf, FIELD_ENABLED, rule.enabled);
    write_tlv_str(&mut buf, FIELD_MATCH_TYPE, &rule.match_type);
    write_tlv_str(&mut buf, FIELD_MATCH_VALUE, &rule.match_value);
    write_tlv_str(&mut buf, FIELD_OUTBOUND, &rule.outbound);
    if let Some(ref v) = rule.outbound_node {
        write_tlv_str(&mut buf, FIELD_OUTBOUND_NODE, v);
    }
    if let Some(ref v) = rule.rule_set_url {
        write_tlv_str(&mut buf, FIELD_RULE_SET_URL, v);
    }
    if let Some(ref v) = rule.rule_set_local_path {
        write_tlv_str(&mut buf, FIELD_RULE_SET_LOCAL_PATH, v);
    }
    if let Some(ref v) = rule.download_detour {
        write_tlv_str(&mut buf, FIELD_DOWNLOAD_DETOUR, v);
    }
    write_tlv_bool(&mut buf, FIELD_INVERT, rule.invert);
    write_tlv_u32(&mut buf, FIELD_ORDER, rule.order as u32);
    buf
}

/// Decode a TLV byte buffer back into a RouteRuleConfig.
pub fn decode_rule(data: &[u8]) -> Result<RouteRuleConfig, String> {
    let mut id = String::new();
    let mut name = String::new();
    let mut enabled = false;
    let mut match_type = String::new();
    let mut match_value = String::new();
    let mut outbound = String::new();
    let mut outbound_node = None;
    let mut rule_set_url = None;
    let mut rule_set_local_path = None;
    let mut download_detour = None;
    let mut invert = false;
    let mut order: usize = 0;

    let mut pos = 0;
    while pos < data.len() {
        if pos + 3 > data.len() {
            return Err("truncated TLV".to_string());
        }
        let field_type = data[pos];
        let length = u16::from_be_bytes([data[pos + 1], data[pos + 2]]) as usize;
        pos += 3;
        if pos + length > data.len() {
            return Err("TLV length exceeds data".to_string());
        }
        let value = &data[pos..pos + length];
        pos += length;

        match field_type {
            FIELD_ID => id = String::from_utf8_lossy(value).to_string(),
            FIELD_NAME => name = String::from_utf8_lossy(value).to_string(),
            FIELD_ENABLED => enabled = value.first().copied().unwrap_or(0) != 0,
            FIELD_MATCH_TYPE => match_type = String::from_utf8_lossy(value).to_string(),
            FIELD_MATCH_VALUE => match_value = String::from_utf8_lossy(value).to_string(),
            FIELD_OUTBOUND => outbound = String::from_utf8_lossy(value).to_string(),
            FIELD_OUTBOUND_NODE => outbound_node = Some(String::from_utf8_lossy(value).to_string()),
            FIELD_RULE_SET_URL => rule_set_url = Some(String::from_utf8_lossy(value).to_string()),
            FIELD_RULE_SET_LOCAL_PATH => rule_set_local_path = Some(String::from_utf8_lossy(value).to_string()),
            FIELD_DOWNLOAD_DETOUR => download_detour = Some(String::from_utf8_lossy(value).to_string()),
            FIELD_INVERT => invert = value.first().copied().unwrap_or(0) != 0,
            FIELD_ORDER => {
                if value.len() >= 4 {
                    order = u32::from_be_bytes([value[0], value[1], value[2], value[3]]) as usize;
                }
            }
            _ => {} // skip unknown fields for forward compatibility
        }
    }

    if id.is_empty() {
        return Err("missing rule id".to_string());
    }

    Ok(RouteRuleConfig {
        id,
        name,
        enabled,
        match_type,
        match_value,
        outbound,
        outbound_node,
        rule_set_url,
        rule_set_local_path,
        download_detour,
        invert,
        order,
    })
}

/// Encode RulesData metadata into a TLV buffer.
pub fn encode_metadata(data: &RulesData) -> Vec<u8> {
    let mut buf = Vec::new();
    write_tlv_str(&mut buf, FIELD_FINAL_OUTBOUND, &data.final_outbound);
    if let Some(ref node) = data.final_outbound_node {
        write_tlv_str(&mut buf, FIELD_FINAL_OUTBOUND_NODE, node);
    }
    write_tlv_u32(&mut buf, FIELD_UPDATE_INTERVAL, data.update_interval as u32);
    buf
}

/// Decode RulesData metadata from a TLV buffer.
pub fn decode_metadata(data: &[u8]) -> Result<(String, Option<String>, u64), String> {
    let mut final_outbound = "proxy".to_string();
    let mut final_outbound_node = None;
    let mut update_interval: u64 = 86400;

    let mut pos = 0;
    while pos < data.len() {
        if pos + 3 > data.len() {
            return Err("truncated TLV".to_string());
        }
        let field_type = data[pos];
        let length = u16::from_be_bytes([data[pos + 1], data[pos + 2]]) as usize;
        pos += 3;
        if pos + length > data.len() {
            return Err("TLV length exceeds data".to_string());
        }
        let value = &data[pos..pos + length];
        pos += length;

        match field_type {
            FIELD_FINAL_OUTBOUND => final_outbound = String::from_utf8_lossy(value).to_string(),
            FIELD_FINAL_OUTBOUND_NODE => final_outbound_node = Some(String::from_utf8_lossy(value).to_string()),
            FIELD_UPDATE_INTERVAL => {
                if value.len() >= 4 {
                    update_interval = u32::from_be_bytes([value[0], value[1], value[2], value[3]]) as u64;
                }
            }
            _ => {}
        }
    }

    Ok((final_outbound, final_outbound_node, update_interval))
}

/// Encode a complete RulesData into a list of (key, payload) pairs.
pub fn encode_rules_data(data: &RulesData) -> Vec<(Vec<u8>, Vec<u8>)> {
    let mut entries = Vec::new();
    entries.push((METADATA_MARKER.to_vec(), encode_metadata(data)));
    for rule in &data.rules {
        entries.push((rule.id.as_bytes().to_vec(), encode_rule(rule)));
    }
    entries
}

/// Decode a list of (key, payload) pairs back into RulesData.
pub fn decode_rules_data(entries: &[(Vec<u8>, Vec<u8>)]) -> Result<RulesData, String> {
    let mut rules = Vec::new();
    let mut final_outbound = "proxy".to_string();
    let mut final_outbound_node = None;
    let mut update_interval = 86400u64;

    for (key, payload) in entries {
        if key == METADATA_MARKER {
            let (fo, fon, ui) = decode_metadata(payload)?;
            final_outbound = fo;
            final_outbound_node = fon;
            update_interval = ui;
        } else {
            rules.push(decode_rule(payload)?);
        }
    }

    rules.sort_by_key(|r| r.order);

    Ok(RulesData {
        rules,
        final_outbound,
        final_outbound_node,
        update_interval,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_rule() -> RouteRuleConfig {
        RouteRuleConfig {
            id: "rule-1".to_string(),
            name: "Google".to_string(),
            enabled: true,
            match_type: "domain-suffix".to_string(),
            match_value: "google.com".to_string(),
            outbound: "proxy".to_string(),
            outbound_node: Some("Tokyo 01".to_string()),
            rule_set_url: None,
            rule_set_local_path: None,
            download_detour: None,
            invert: false,
            order: 0,
        }
    }

    fn sample_rule_with_ruleset() -> RouteRuleConfig {
        RouteRuleConfig {
            id: "rule-2".to_string(),
            name: "China Direct".to_string(),
            enabled: true,
            match_type: "geosite".to_string(),
            match_value: "cn".to_string(),
            outbound: "direct".to_string(),
            outbound_node: None,
            rule_set_url: Some("https://example.com/geosite-cn.srs".to_string()),
            rule_set_local_path: None,
            download_detour: Some("proxy".to_string()),
            invert: false,
            order: 1,
        }
    }

    #[test]
    fn rule_roundtrip() {
        let rule = sample_rule();
        let encoded = encode_rule(&rule);
        let decoded = decode_rule(&encoded).unwrap();
        assert_eq!(decoded.id, rule.id);
        assert_eq!(decoded.name, rule.name);
        assert_eq!(decoded.enabled, rule.enabled);
        assert_eq!(decoded.match_type, rule.match_type);
        assert_eq!(decoded.match_value, rule.match_value);
        assert_eq!(decoded.outbound, rule.outbound);
        assert_eq!(decoded.outbound_node, rule.outbound_node);
        assert_eq!(decoded.rule_set_url, rule.rule_set_url);
        assert_eq!(decoded.download_detour, rule.download_detour);
        assert_eq!(decoded.invert, rule.invert);
        assert_eq!(decoded.order, rule.order);
    }

    #[test]
    fn rule_with_ruleset_roundtrip() {
        let rule = sample_rule_with_ruleset();
        let encoded = encode_rule(&rule);
        let decoded = decode_rule(&encoded).unwrap();
        assert_eq!(decoded.rule_set_url, rule.rule_set_url);
        assert_eq!(decoded.download_detour, rule.download_detour);
    }

    #[test]
    fn metadata_roundtrip() {
        let data = RulesData {
            rules: vec![],
            final_outbound: "direct".to_string(),
            final_outbound_node: Some("US West".to_string()),
            update_interval: 3600,
        };
        let encoded = encode_metadata(&data);
        let (fo, fon, ui) = decode_metadata(&encoded).unwrap();
        assert_eq!(fo, "direct");
        assert_eq!(fon, Some("US West".to_string()));
        assert_eq!(ui, 3600);
    }

    #[test]
    fn full_rules_data_roundtrip() {
        let data = RulesData {
            rules: vec![sample_rule(), sample_rule_with_ruleset()],
            final_outbound: "proxy".to_string(),
            final_outbound_node: None,
            update_interval: 86400,
        };
        let entries = encode_rules_data(&data);
        assert_eq!(entries.len(), 3); // 1 metadata + 2 rules
        let decoded = decode_rules_data(&entries).unwrap();
        assert_eq!(decoded.rules.len(), 2);
        assert_eq!(decoded.rules[0].id, "rule-1");
        assert_eq!(decoded.rules[1].id, "rule-2");
        assert_eq!(decoded.final_outbound, "proxy");
        assert_eq!(decoded.update_interval, 86400);
    }

    #[test]
    fn decode_empty_data_fails() {
        let result = decode_rule(&[]);
        assert!(result.is_err());
    }

    #[test]
    fn decode_truncated_tlv_fails() {
        let result = decode_rule(&[1, 0]);
        assert!(result.is_err());
    }

    #[test]
    fn filter_excludes_process_rules() {
        let data = RulesData {
            rules: vec![
                sample_rule(), // domain-suffix → should be kept
                RouteRuleConfig {
                    id: "proc-1".to_string(),
                    name: "Chrome".to_string(),
                    enabled: true,
                    match_type: "process-name".to_string(),
                    match_value: "Google Chrome".to_string(),
                    outbound: "proxy".to_string(),
                    outbound_node: None,
                    rule_set_url: None,
                    rule_set_local_path: None,
                    download_detour: None,
                    invert: false,
                    order: 1,
                },
                RouteRuleConfig {
                    id: "proc-2".to_string(),
                    name: "Safari Path".to_string(),
                    enabled: true,
                    match_type: "process-path".to_string(),
                    match_value: "/Applications/Safari.app".to_string(),
                    outbound: "direct".to_string(),
                    outbound_node: None,
                    rule_set_url: None,
                    rule_set_local_path: None,
                    download_detour: None,
                    invert: false,
                    order: 2,
                },
                RouteRuleConfig {
                    id: "proc-3".to_string(),
                    name: "Regex".to_string(),
                    enabled: true,
                    match_type: "process-path-regex".to_string(),
                    match_value: ".*firefox.*".to_string(),
                    outbound: "proxy".to_string(),
                    outbound_node: None,
                    rule_set_url: None,
                    rule_set_local_path: None,
                    download_detour: None,
                    invert: false,
                    order: 3,
                },
                sample_rule_with_ruleset(), // geosite → should be kept
            ],
            final_outbound: "proxy".to_string(),
            final_outbound_node: None,
            update_interval: 86400,
        };

        let filtered = filter_syncable_rules(&data);
        assert_eq!(filtered.rules.len(), 2);
        assert_eq!(filtered.rules[0].id, "rule-1");
        assert_eq!(filtered.rules[1].id, "rule-2");
        // Metadata preserved
        assert_eq!(filtered.final_outbound, "proxy");
        assert_eq!(filtered.update_interval, 86400);
    }

    #[test]
    fn unknown_fields_are_skipped() {
        let mut buf = Vec::new();
        write_tlv_str(&mut buf, FIELD_ID, "test-id");
        // unknown field type 99
        write_tlv_str(&mut buf, 99, "unknown-data");
        let decoded = decode_rule(&buf).unwrap();
        assert_eq!(decoded.id, "test-id");
    }
}
